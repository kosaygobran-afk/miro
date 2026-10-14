import { z } from "zod";
import {
  CommerceError,
  commerceFailure,
  requireCommerceActor,
} from "@/lib/commerce/http";
import {
  renderStoredDraft,
  renderStoredDraftHtml,
} from "@/lib/commerce/document-service";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireCommerceActor(request, "viewCommerce");
    const id = z
      .string()
      .uuid()
      .safeParse((await context.params).id);
    const query = z
      .object({
        layout: z.enum(["a4", "receipt80"]).default("a4"),
        format: z.enum(["pdf", "html"]).default("pdf"),
      })
      .strict()
      .safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!id.success || !query.success) throw new CommerceError("invalid_input");
    const headers = {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    };
    if (query.data.format === "html")
      return new Response(await renderStoredDraftHtml(id.data), {
        headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
      });
    const rendered = await renderStoredDraft(id.data, query.data.layout);
    return new Response(Buffer.from(rendered.pdfBytes), {
      headers: {
        ...headers,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="MIRO-DRAFT-${id.data}-${query.data.layout}.pdf"`,
        "X-Document-State": "draft",
      },
    });
  } catch (error) {
    return commerceFailure(error, "document_preview");
  }
}
