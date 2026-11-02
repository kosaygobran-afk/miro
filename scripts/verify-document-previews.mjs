import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const base = process.env.COMMERCE_NEXT_URL;
const actors = JSON.parse(process.env.COMMERCE_TEST_ACTORS || "{}");
assert.ok(base && new URL(base).hostname === "127.0.0.1" && actors.ceo);
const out = process.env.COMMERCE_OUTPUT_DIR || "/tmp/miro-document-browser-qa";
await mkdir(out, { recursive: true });
const types = [
  "quote",
  "proforma",
  "transaction_invoice",
  "tax_invoice",
  "receipt",
  "invoice_receipt",
  "credit_note",
  "correction",
];
const id = "00000000-0000-4000-8000-000000009941";
function session(actor) {
  return `base64-${Buffer.from(JSON.stringify({ access_token: actor.token, refresh_token: `refresh-${actor.token}`, token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: actor.id, aud: "authenticated", role: "authenticated", email: actor.email, app_metadata: {}, user_metadata: { full_name: actor.name } } })).toString("base64url")}`;
}

// Inspect painted text and boxes, not just class names or declared CSS. The
// same checks run on every fictional choice and on long current-business input.
async function verifyPaperGeometry(tab, name) {
  const result = await tab.evaluate(() => {
    const failures = [];
    const rtl = document.documentElement.dir === "rtl";
    const paper = document.querySelector(".paper");
    const receipt = paper.dataset.layout === "receipt80";
    const rect = (node) => node.getBoundingClientRect();
    const near = (a, b) => Math.abs(a - b) <= 1.5;
    const inside = (child, parent) =>
      child.left >= parent.left - 1 &&
      child.right <= parent.right + 1 &&
      child.top >= parent.top - 1 &&
      child.bottom <= parent.bottom + 1;
    const textBoxes = (node) => {
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      const boxes = [];
      while (walker.nextNode()) {
        // Collapsed spaces at a wrapped line end have range boxes outside the
        // line but paint no glyph. Measure each non-whitespace run instead.
        for (const match of walker.currentNode.textContent.matchAll(/\S+/gu)) {
          const range = document.createRange();
          range.setStart(walker.currentNode, match.index);
          range.setEnd(walker.currentNode, match.index + match[0].length);
          boxes.push(...Array.from(range.getClientRects()));
        }
      }
      return boxes.filter((box) => box.width > 0 && box.height > 0);
    };
    const edge = (boxes) =>
      rtl
        ? Math.max(...boxes.map((box) => box.right))
        : Math.min(...boxes.map((box) => box.left));
    const masthead = document.querySelector(".masthead");
    const identity = document.querySelector(".business-identity");
    const brand = document.querySelector(".brand-position");
    if (!masthead || !identity || !brand)
      return { failures: ["missing premium masthead"], fields: 0 };
    const m = rect(masthead),
      business = rect(identity),
      logo = rect(brand);
    if (!inside(business, m) || !inside(logo, m))
      failures.push("masthead columns escape their container");
    if (receipt) {
      if (logo.bottom > business.top + 1)
        failures.push("receipt logo collides with business identity");
      const artwork = rect(brand.querySelector("svg"));
      if (!near((artwork.left + artwork.right) / 2, (m.left + m.right) / 2))
        failures.push("receipt logo is not centered");
    } else {
      if (rtl ? business.left < logo.right - 1 : business.right > logo.left + 1)
        failures.push("business and logo columns overlap or are not mirrored");
      if (!near(business.top, m.top) || Math.abs(logo.top - m.top) > 6)
        failures.push("masthead top anchors differ");
    }
    const fields = Array.from(
      document.querySelectorAll(".detail-grid > .field"),
    );
    if (!fields.length) failures.push("missing stacked printable fields");
    for (const field of fields) {
      const label = field.querySelector("dt"),
        value = field.querySelector("dd");
      const title = field.dataset.field;
      if (!label || !value) {
        failures.push(`${title}: missing label/value`);
        continue;
      }
      const f = rect(field),
        l = rect(label),
        v = rect(value);
      if (v.top < l.bottom - 1)
        failures.push(`${title}: value is not below its label`);
      if (!near(rtl ? l.right : l.left, rtl ? v.right : v.left))
        failures.push(`${title}: label/value reading edges differ`);
      if (!inside(l, f) || !inside(v, f))
        failures.push(`${title}: label/value escapes field bounds`);
      if (value.scrollWidth > value.clientWidth + 1)
        failures.push(`${title}: value expands its fixed-width column`);
      const valueText = textBoxes(value),
        labelText = textBoxes(label);
      if (
        valueText.some(
          (box) => box.left < v.left - 1 || box.right > v.right + 1,
        )
      )
        failures.push(`${title}: painted value escapes its column`);
      if (
        !label.querySelector("svg") &&
        labelText.length &&
        valueText.length &&
        !near(edge(labelText), edge(valueText))
      )
        failures.push(`${title}: painted text is indented from its label`);
    }
    for (const grid of document.querySelectorAll(".detail-grid")) {
      const cells = Array.from(grid.children).filter((node) =>
        node.matches(".field"),
      );
      for (let i = 0; i < cells.length; i++)
        for (let j = i + 1; j < cells.length; j++) {
          const a = rect(cells[i]),
            b = rect(cells[j]);
          if (
            near(a.top, b.top) &&
            (!near(a.bottom, b.bottom) ||
              !near(
                rect(cells[i].querySelector("dd")).top,
                rect(cells[j].querySelector("dd")).top,
              ))
          )
            failures.push("neighboring fields do not share vertical row space");
          if (
            Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
            Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1
          )
            failures.push("field boxes collide");
        }
    }
    const headers = Array.from(document.querySelectorAll(".items th.numeric"));
    for (const row of document.querySelectorAll(".items tbody tr")) {
      const values = Array.from(row.querySelectorAll("td.numeric"));
      headers.forEach((header, index) => {
        if (!values[index]) {
          failures.push("missing numeric table column");
          return;
        }
        if (
          getComputedStyle(header).textAlign !== "right" ||
          getComputedStyle(values[index]).textAlign !== "right"
        )
          failures.push("numeric header/body use different alignment");
        const h = textBoxes(header),
          v = textBoxes(values[index]);
        if (
          h.length &&
          v.length &&
          !near(
            Math.max(...h.map((box) => box.right)),
            Math.max(...v.map((box) => box.right)),
          )
        )
          failures.push("numeric heading/value anchors differ");
      });
    }
    return { failures, fields: fields.length, width: rect(paper).width };
  });
  assert.deepEqual(
    result.failures,
    [],
    `${name}: ${result.failures.join("; ")}`,
  );
  return { name, ...result };
}
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    reducedMotion: "reduce",
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const preview = await context.newPage();
  const errors = [];
  const geometry = [];
  for (const tab of [page, preview])
    tab.on("pageerror", (error) => errors.push(error.message));
  const sample = `${base}/api/management/commerce/documents/sample?type=receipt&language=he`;
  assert.equal((await page.request.get(sample)).status(), 401);
  await context.addCookies([
    {
      name: "sb-127-auth-token",
      value: session(actors.inactive),
      url: base,
      httpOnly: true,
    },
  ]);
  assert.equal((await page.request.get(sample)).status(), 401);
  for (const actor of [actors.admin, actors.ceo]) {
    await context.addCookies([
      {
        name: "sb-127-auth-token",
        value: session(actor),
        url: base,
        httpOnly: true,
      },
    ]);
    assert.equal((await page.request.get(sample)).status(), 200);
  }
  const before = await (
    await page.request.get(
      `${base}/api/management/commerce/documents?limit=100`,
    )
  ).json();
  // This script is launched only by the disposable PostgreSQL harness. Identity
  // edits below are intentional fixture setup, before the no-write preview audit.
  assert.ok(
    process.env.COMMERCE_PG_PORT && process.env.COMMERCE_PSQL,
    "identity refresh QA requires the disposable database harness",
  );
  const savedUrl = `${base}/api/management/commerce/documents/${id}/preview?format=html&layout=a4`;
  const savedBefore = await page.request.get(savedUrl);
  assert.equal(savedBefore.status(), 200);
  const savedHtmlBefore = await savedBefore.text();
  const identityBefore = await (
    await page.request.get(`${base}/api/management/commerce/settings`)
  ).json();
  let revision = identityBefore.revision ?? 0;
  const currentUrl = `${base}/api/management/commerce/documents/sample?type=receipt&language=en&layout=a4&format=html&source=business`;
  const missingIdentity = await page.request.get(currentUrl);
  assert.equal(missingIdentity.status(), 409);
  assert.equal(missingIdentity.headers()["cache-control"], "private, no-store");
  const identityPatch = {
    legal_name: "Current preview business identity v1",
    trade_name: "Current business preview v1",
    entity_kind: "company",
    registration_number: "EXAMPLE-CURRENT-REG",
    vat_number: "EXAMPLE-CURRENT-VAT",
    address: {
      street: "18 Current Preview Street",
      city: "Fixture City",
      postal_code: "0000000",
      country: "IL",
    },
    phone: "+972-00-123-4567",
    email: "current-v1@example.invalid",
    document_language: "he",
    prices_include_vat: true,
    document_policy_version: "fixture-review-only",
  };
  async function saveIdentity(patch) {
    const response = await page.request.post(
      `${base}/api/management/commerce/settings`,
      {
        headers: { Origin: base },
        data: {
          action: "settings_save",
          payload: { expected_revision: revision, patch },
        },
      },
    );
    assert.equal(
      response.status(),
      200,
      `fixture identity save: ${await response.text()}`,
    );
    const data = await response.json();
    assert.equal(data.ok, true);
    revision = data.revision;
  }
  await saveIdentity(identityPatch);
  const currentV1 = await page.request.get(currentUrl);
  assert.equal(currentV1.status(), 200);
  assert.equal(currentV1.headers()["x-document-identity"], "business");
  assert.match(await currentV1.text(), /Current preview business identity v1/);
  const longName = `${"Premium current business name ".repeat(5).slice(0, 147)} CURRENTV2END`;
  await saveIdentity({
    ...identityPatch,
    legal_name: longName,
    trade_name: "Current business preview v2",
    address: {
      ...identityPatch.address,
      street: `${"Extended address details ".repeat(13).slice(0, 288)} STREETV2END`,
    },
    email: `${"a".repeat(254 - "@current-preview.example.invalid".length)}@current-preview.example.invalid`,
  });
  for (const language of ["he", "en"])
    for (const layout of ["a4", "receipt80"]) {
      const url = new URL(currentUrl);
      url.searchParams.set("language", language);
      url.searchParams.set("layout", layout);
      const response = await preview.goto(url.href);
      assert.equal(response.status(), 200);
      await expect(preview.locator(".business-identity")).toContainText(
        "CURRENTV2END",
      );
      await expect(preview.locator(".business-identity")).not.toContainText(
        "identity v1",
      );
      geometry.push(
        await verifyPaperGeometry(
          preview,
          `current-business/${language}/${layout}/long-fields`,
        ),
      );
      const pdfUrl = new URL(url);
      pdfUrl.searchParams.set("format", "pdf");
      const pdf = await page.request.get(pdfUrl.href);
      assert.equal(pdf.status(), 200);
      await writeFile(
        path.join(out, `current-business-${language}-${layout}.pdf`),
        await pdf.body(),
      );
      await preview.screenshot({
        path: path.join(out, `current-business-${language}-${layout}.png`),
        fullPage: true,
      });
    }
  const savedAfter = await page.request.get(savedUrl);
  assert.equal(savedAfter.status(), 200);
  assert.equal(
    await savedAfter.text(),
    savedHtmlBefore,
    "current identity update changed the saved draft snapshot",
  );
  console.log(
    "PASS current-business preview reads the latest authorized identity; saved document snapshot remains unchanged",
  );
  // Reuse real maximum-limit renderer output, including long customer fields
  // and very large prices, for browser and native-print layout verification.
  const rendererFixtures = process.env.COMMERCE_RENDERER_FIXTURE_DIR;
  if (rendererFixtures) {
    const expected = JSON.parse(
      await readFile(
        path.join(rendererFixtures, "pdf-content-expectations.json"),
        "utf8",
      ),
    );
    const printedExpectations = {};
    for (const language of ["he", "en"])
      for (const layout of ["a4", "receipt80"]) {
        const stem = `maximum-${language}-${layout}`;
        const html = await readFile(
          path.join(rendererFixtures, `${stem}.html`),
          "utf8",
        );
        await preview.setContent(html, { waitUntil: "load" });
        for (const width of [320, 1440]) {
          await preview.setViewportSize({ width, height: 1000 });
          geometry.push(await verifyPaperGeometry(preview, `${stem}/${width}`));
        }
        await preview.pdf({
          path: path.join(out, `print-${stem}.pdf`),
          preferCSSPageSize: true,
          printBackground: true,
        });
        await preview.screenshot({
          path: path.join(out, `${stem}.png`),
          fullPage: true,
        });
        assert.ok(
          expected[`${stem}.pdf`]?.length,
          `${stem}: missing PDF content expectations`,
        );
        printedExpectations[`print-${stem}.pdf`] = expected[`${stem}.pdf`];
      }
    await writeFile(
      path.join(out, "pdf-content-expectations.json"),
      JSON.stringify(printedExpectations, null, 2),
    );
    console.log(
      "PASS maximum-length business/customer/contact and large-money browser/native-print fixtures",
    );
  }
  const mutations = [];
  context.on("request", (request) => {
    if (
      new URL(request.url()).pathname.startsWith("/api/management/") &&
      request.method() !== "GET"
    )
      mutations.push(request.url());
  });
  for (const locale of ["he", "en"]) {
    await page.goto(`${base}/${locale}/admin/documents`);
    await page.waitForLoadState("networkidle");
    const tester = page.locator("[data-document-preview-tester]");
    await expect(tester).toBeVisible();
    const card = tester.locator("..").locator("..");
    for (const type of types)
      for (const language of ["he", "en"])
        for (const layout of ["a4", "receipt80"]) {
          await tester.locator("select").nth(0).selectOption(type);
          await tester.locator("select").nth(1).selectOption(language);
          await tester.locator("select").nth(2).selectOption(layout);
          await tester.locator("select").nth(3).selectOption("sample");
          const link = page.getByRole("link", {
            name:
              locale === "he"
                ? "בדיקת טיוטה (בחלון חדש)"
                : "Test draft preview (new tab)",
          });
          const href = await link.getAttribute("href");
          const target = new URL(href, base);
          assert.equal(target.searchParams.get("type"), type);
          assert.equal(target.searchParams.get("language"), language);
          assert.equal(target.searchParams.get("layout"), layout);
          assert.equal(target.searchParams.get("source"), "sample");
          if (locale === "en") continue; // UI wiring checked twice; render matrix needs one pass.
          const response = await preview.goto(target.href);
          assert.equal(response.status(), 200);
          assert.equal(response.headers()["x-document-identity"], "sample");
          assert.equal(
            response.headers()["cache-control"],
            "private, no-store",
          );
          await expect(preview.locator("html")).toHaveAttribute(
            "lang",
            language,
          );
          await expect(preview.locator("html")).toHaveAttribute(
            "dir",
            language === "he" ? "rtl" : "ltr",
          );
          await expect(preview.locator(".paper")).toHaveAttribute(
            "data-layout",
            layout,
          );
          assert.ok((await preview.locator(".paper-brand path").count()) > 20);
          await expect(preview.locator(".summary")).toContainText(
            type === "credit_note" ? "-ILS 401.20" : "ILS 401.20",
          );
          assert.equal(
            await preview
              .locator('bdi[dir="ltr"]')
              .first()
              .evaluate((node) => getComputedStyle(node).direction),
            "ltr",
          );
          for (const width of [320, 1440]) {
            await preview.setViewportSize({ width, height: 1000 });
            assert.ok(
              await preview.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
              ),
              `${type}/${language}/${layout}/${width}: overflow`,
            );
            geometry.push(
              await verifyPaperGeometry(
                preview,
                `${type}/${language}/${layout}/${width}`,
              ),
            );
          }
          const pdf = await page.request.get(
            new URL(href.replace("format=html", "format=pdf"), base).href,
          );
          assert.equal(pdf.status(), 200);
          assert.equal(pdf.headers()["x-document-sample"], "true");
          const bytes = await pdf.body();
          assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
          await writeFile(
            path.join(out, `${type}-${language}-${layout}.pdf`),
            bytes,
          );
          await preview.pdf({
            path: path.join(out, `print-${type}-${language}-${layout}.pdf`),
            preferCSSPageSize: true,
            printBackground: true,
          });
          if (type === "receipt") {
            const axe = await new AxeBuilder({ page: preview }).analyze();
            assert.deepEqual(
              axe.violations.map((v) => ({ id: v.id, impact: v.impact })),
              [],
            );
            await preview.screenshot({
              path: path.join(out, `${language}-${layout}.png`),
              fullPage: true,
            });
          }
        }
    const popupPromise = context.waitForEvent("page");
    await page
      .getByRole("link", {
        name:
          locale === "he"
            ? "בדיקת טיוטה (בחלון חדש)"
            : "Test draft preview (new tab)",
      })
      .click();
    const popup = await popupPromise;
    await popup.waitForLoadState();
    assert.ok(popup.url().includes("/documents/sample?"));
    await popup.close();
    await page
      .getByRole("button", {
        name: locale === "he" ? "בחירה" : "Select",
        exact: true,
      })
      .first()
      .click();
    const saved = page.getByRole("link", {
      name: locale === "he" ? "תצוגה · 80 מ״מ" : "Preview · 80 mm",
      exact: true,
    });
    await expect(saved).toBeVisible();
    const stored = await preview.goto(
      new URL(await saved.getAttribute("href"), base).href,
    );
    assert.equal(stored.status(), 200);
    await expect(preview.locator(".paper")).toHaveAttribute(
      "data-layout",
      "receipt80",
    );
    await expect(preview.locator("body")).toContainText("Stored draft fixture");
    for (const width of [320, 390, 1440])
      for (const theme of ["dark", "medium", "light"]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate(
          (theme) => (document.documentElement.dataset.theme = theme),
          theme,
        );
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `${locale}/${width}/${theme}: management overflow`,
        );
      }
    await page.screenshot({
      path: path.join(out, `workspace-${locale}.png`),
      fullPage: true,
    });
    assert.ok(await card.count());
    console.log(
      `PASS ${locale}: all sample controls, real new-tab preview, saved draft links and responsive themes`,
    );
  }
  const after = await (
    await page.request.get(
      `${base}/api/management/commerce/documents?limit=100`,
    )
  ).json();
  assert.equal(
    JSON.stringify(before.rows),
    JSON.stringify(after.rows),
    "Sample previews changed documents or numbering",
  );
  assert.equal(after.rows.find((row) => row.id === id).number, null);
  assert.deepEqual(mutations, []);
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(out, "paper-geometry-report.json"),
    JSON.stringify(geometry, null, 2),
  );
  console.log(
    "PASS 32 HTML/PDF/native-print combinations; auth, draft-only/no-write, RTL/LTR, mobile containment and preview accessibility",
  );
} finally {
  await browser.close();
}
