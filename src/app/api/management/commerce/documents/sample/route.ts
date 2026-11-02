import { z } from "zod";
import {
  CommerceError,
  commerceFailure,
  requireCommerceActor,
} from "@/lib/commerce/http";
import { createDocumentSample } from "@/lib/commerce/documents/sample";
import { DOCUMENT_PREVIEW_TYPES } from "@/lib/commerce/documents/options";
import {
  renderDraftDocument,
  renderDraftHtml,
} from "@/lib/commerce/documents/renderer";
import { DOCUMENT_PREVIEW_HEADERS } from "@/lib/commerce/documents/preview-response";
import {
  readCurrentPreviewIdentity,
  previewIdentityErrorHtml,
} from "@/lib/commerce/documents/preview-identity";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const { client } = await requireCommerceActor(request, "viewCommerce");
    const query = z
      .object({
        type: z.enum(DOCUMENT_PREVIEW_TYPES),
        language: z.enum(["he", "en"]),
        layout: z.enum(["a4", "receipt80"]).default("a4"),
        format: z.enum(["html", "pdf"]).default("html"),
        source: z.enum(["sample", "business"]).default("sample"),
      })
      .strict()
      .safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!query.success) throw new CommerceError("invalid_input");
    const { type, language, layout, format, source } = query.data;
    let identity;
    if (source === "business") {
      try {
        identity = await readCurrentPreviewIdentity(client, type, language);
      } catch (error) {
        if (
          format === "html" &&
          error instanceof CommerceError &&
          [
            "business_identity_required",
            "business_identity_invalid",
            "business_identity_document_type_unavailable",
          ].includes(error.code)
        )
          return new Response(previewIdentityErrorHtml(error.code, language), {
            status: error.status,
            headers: {
              ...DOCUMENT_PREVIEW_HEADERS,
              "Content-Type": "text/html; charset=utf-8",
            },
          });
        throw error;
      }
    }
    const document = createDocumentSample(type, language, undefined, identity);
    const headers = {
      ...DOCUMENT_PREVIEW_HEADERS,
      "X-Document-Sample": "true",
      "X-Document-Identity": source,
    };
    if (format === "html")
      return new Response(renderDraftHtml(document, layout), {
        headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
      });
    const rendered = await renderDraftDocument(document, layout);
    return new Response(Buffer.from(rendered.pdfBytes), {
      headers: {
        ...headers,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="MIRO-SAMPLE-${type}-${language}-${layout}.pdf"`,
      },
    });
  } catch (error) {
    return commerceFailure(error, "document_sample_preview");
  }
}
