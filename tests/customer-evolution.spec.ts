import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("appearance backup restores original public tokens and console Dark stays unchanged", async ({
  page,
}) => {
  await page.goto("/en/contact");
  await expect(page.locator("html")).toHaveAttribute(
    "data-motion-ready",
    "true",
  );
  const palettes = await page.evaluate(() => {
    const root = document.documentElement;
    const read = () => {
      const css = getComputedStyle(root);
      return [
        "--background",
        "--surface",
        "--foreground",
        "--primary",
        "--focus-ring",
      ].map((token) => css.getPropertyValue(token).trim());
    };
    root.dataset.theme = "dark";
    root.dataset.appearanceVersion = "1";
    const original = read();
    root.dataset.appearanceVersion = "2";
    const enhanced = read();
    const consoleRoot = document.createElement("div");
    consoleRoot.className = "mgmt-shell-root";
    consoleRoot.hidden = true;
    document.body.append(consoleRoot);
    const consoleDark = read();
    consoleRoot.remove();
    const workerRoot = document.createElement("section");
    workerRoot.dataset.managementSurface = "true";
    workerRoot.hidden = true;
    document.body.append(workerRoot);
    const workerDark = read();
    workerRoot.remove();
    root.dataset.appearanceVersion = "1";
    const restored = read();
    return { original, enhanced, consoleDark, workerDark, restored };
  });
  expect(palettes.enhanced).not.toEqual(palettes.original);
  expect(palettes.consoleDark).toEqual(palettes.original);
  expect(palettes.workerDark).toEqual(palettes.original);
  expect(palettes.restored).toEqual(palettes.original);
});

for (const { path, width } of [
  { path: "/en/services", width: 1280 },
  { path: "/en/login", width: 390 },
  { path: "/he", width: 320 },
  { path: "/he/store/cameras/miro-4k-pro", width: 390 },
]) {
  test(`enhanced Light stays readable and fits ${path} at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => localStorage.setItem("miro-theme", "light"));
    await page.goto(path);
    await expect(page.locator("html")).toHaveAttribute(
      "data-motion-ready",
      "true",
    );
    await page.evaluate(
      () => (document.documentElement.dataset.appearanceVersion = "2"),
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const violations = await new AxeBuilder({ page })
      .withRules(["color-contrast"])
      .analyze();
    expect(violations.violations).toEqual([]);
  });
}
