/** Fixed paper geometry. Both fictional and current-business previews share it. */
export function paperStyles(layout: "a4" | "receipt80"): string {
  return `
*{box-sizing:border-box}
body{margin:0;padding:28px 12px;background:#e9edf1;color:#17202a;font:14px/1.5 Arial,sans-serif}
.paper{background:#fff;margin:auto;padding:36px;max-width:794px;min-height:1123px;overflow-wrap:anywhere}
.masthead{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(0,1fr);gap:32px;align-items:start}
.masthead>*{min-width:0}
.business-name{display:block;font-size:25px;line-height:1.25;letter-spacing:-.02em;margin:0 0 16px;font-weight:700;white-space:pre-wrap}
.kicker{margin:0 0 8px;font-size:10px;letter-spacing:.06em;color:#596574}
.brand-position{display:flex;justify-content:flex-end;padding-block-start:4px}
.paper-brand{display:block;width:188px;max-width:100%;height:auto;direction:ltr;transform:none}
.paper-icon{width:15px;height:15px;flex:none}
.paper-rule{display:block;width:100%;height:4px;margin-block:20px}
[dir="rtl"] .paper-rule{transform:scaleX(-1)}
.title-band{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-block:22px 14px}
h1{font-size:29px;line-height:1.2;margin:0;padding-inline:2px;letter-spacing:-.02em;min-width:0}
h2{display:flex;align-items:center;gap:8px;font-size:13px;margin:0 0 14px}
h3{font-size:14px;line-height:1.4;margin:0 0 12px;white-space:pre-wrap}
.draft{padding:6px 10px;border:1px solid #c5a45a;border-radius:4px;background:#fff8e8;color:#6e4c00;font-size:10px;line-height:1.4;font-weight:700;margin:0;max-width:45%;flex:none}
.number-note{font-size:10px;color:#596574;margin:10px 0 0}
.detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:20px;row-gap:4px;margin:0;padding:0;min-width:0}
.field{display:grid;grid-template-rows:subgrid;grid-row:span 2;row-gap:4px;min-width:0;padding-block-end:12px;align-content:start}
.field[data-wide="true"]{grid-column:1/-1}
dt{font-size:10px;line-height:1.4;color:#596574;min-width:0;display:flex;align-items:start;gap:7px}
dd{margin:0;padding:0;font-size:13px;line-height:1.5;min-width:0;white-space:pre-wrap;text-align:start}
bdi{unicode-bidi:isolate;overflow-wrap:anywhere}
bdi[dir="ltr"]{direction:ltr}
.metadata .detail-grid{grid-template-columns:repeat(3,minmax(0,1fr));padding:14px 16px;background:#f6f7f9;border:1px solid #d8dee6;border-radius:6px}
.metadata dd{font-size:11px}
.metadata .field{padding-block-end:0}
.recipient{margin-block:0 18px;padding:16px;border:1px solid #d8dee6;border-radius:6px}
.recipient h2{margin-bottom:12px}
.recipient .field:first-child dd{font-weight:700;font-size:15px}
.recipient .field:last-child{padding-block-end:0}
.items{width:100%;border-collapse:collapse;margin-block:18px;table-layout:fixed}
.items caption{text-align:start;font-size:10px;color:#596574;margin-bottom:7px}
.items th,.items td{padding:11px 6px;border-bottom:1px solid #d8dee6;vertical-align:top}
.items th{text-align:start;background:#f4f6f8;font-size:10px;line-height:1.35}
.items th:first-child{width:42%}.items th:nth-child(2){width:8%}.items th:nth-child(3){width:17%}.items th:nth-child(4){width:15%}.items th:nth-child(5){width:18%}
.items tbody tr:nth-child(even){background:#fafbfc}
.items .gross{font-weight:700}
.items .numeric{text-align:right;font-variant-numeric:tabular-nums;font-size:11px}
.item-description{white-space:pre-wrap;font-size:12px;line-height:1.5}
.item-meta{margin-top:9px}
.item-meta .detail-grid{column-gap:12px}
.item-meta dt{font-size:9px}.item-meta dd{font-size:10px}.item-meta .field{padding-bottom:0}
.closing{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.12fr);gap:24px;align-items:start;margin-top:22px}
.summary{padding:16px;background:#f4f6f8;border:1px solid #cfd7df;border-radius:6px;margin-inline-start:auto;width:54%;min-width:0}
.closing .summary{width:100%}
.summary .total-field{border-top:1px solid #cfd7df;padding-top:12px;margin-top:2px}
.summary .total-field dt{font-weight:700;color:#17202a}
.summary .total-field dd{font-size:24px;line-height:1.3;font-weight:700;letter-spacing:-.02em}
.summary .field{padding-bottom:8px}
.payments,.notes{margin-top:20px;min-width:0}
.closing .payments{margin-top:0}
.payment{border-bottom:1px solid #d8dee6;padding-bottom:12px;margin-bottom:12px}
.payment:last-child{border-bottom:0;margin-bottom:0;padding-bottom:0}
.payment .detail-grid{column-gap:14px}
.notes p{white-space:pre-wrap;font-size:12px;margin:0}
[data-layout="a4"] .item-cards{display:none}
.receipt-item{border-bottom:1px solid #d8dee6;padding-block:12px}
.receipt-item h3{margin-bottom:9px}
.receipt-item .field{padding-block-end:7px}
.receipt-item .field:last-child dd{font-weight:700}
.paper-footer{margin-top:26px;color:#596574;font-size:9px}
.paper-footer .detail-grid{margin-top:12px}
.paper-footer dd{font-size:10px}
.paper-footer p{margin-bottom:0}
.paper[data-layout="receipt80"]{max-width:302px;padding:18px 16px;min-height:0;font-size:12px}
[data-layout="receipt80"] .masthead{display:flex;flex-direction:column;gap:20px}
[data-layout="receipt80"] .brand-position{order:-1;width:100%;justify-content:center}
[data-layout="receipt80"] .paper-brand{width:155px}
[data-layout="receipt80"] .business-identity{width:100%}
[data-layout="receipt80"] .business-name{font-size:19px;margin-bottom:13px}
[data-layout="receipt80"] .detail-grid{column-gap:14px}
[data-layout="receipt80"] .metadata .detail-grid{grid-template-columns:repeat(2,minmax(0,1fr));padding:12px}
[data-layout="receipt80"] .metadata .field:last-child{grid-column:1/-1}
[data-layout="receipt80"] .metadata .field{padding-bottom:8px}
[data-layout="receipt80"] .title-band{display:block;margin-top:18px}
[data-layout="receipt80"] h1{font-size:23px;margin-bottom:10px}
[data-layout="receipt80"] .draft{max-width:none;display:inline-block}
[data-layout="receipt80"] .recipient{padding:12px}
[data-layout="receipt80"] dd{font-size:12px}
[data-layout="receipt80"] .closing{display:flex;flex-direction:column;gap:20px}
[data-layout="receipt80"] .summary{width:100%;order:-1;padding:12px}
[data-layout="receipt80"] .summary .total-field dd{font-size:21px}
[data-layout="receipt80"] .payments{width:100%}
@media screen and (max-width:600px){
 .paper{padding:20px 14px;min-height:0}.masthead{grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:14px}
 .business-name{font-size:20px}.title-band{display:block}h1{font-size:24px;margin-bottom:10px}.draft{max-width:none;display:inline-block}
 .metadata .detail-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.metadata .field{padding-bottom:8px}.metadata .field:last-child{grid-column:1/-1}.closing{display:flex;flex-direction:column}.closing .summary,.summary{width:100%}.closing .summary{order:-1}
 [data-layout="a4"] .items{display:none}
 [data-layout="a4"] .item-cards{display:block}
 .detail-grid{column-gap:14px}
}
@page{size:${layout === "a4" ? "A4" : "80mm 297mm"};margin:${layout === "a4" ? "12mm" : "4mm"}}
@media print{
 body{background:#fff;margin:0;padding:0}.paper,.paper[data-layout="receipt80"]{width:100%;max-width:none;min-height:0;padding:0}
 thead{display:table-header-group}tr,.field,.summary,.payment,.receipt-item{break-inside:avoid}.masthead{break-inside:auto}
 .paper-brand,.draft{break-inside:avoid}h2,h3{break-after:avoid}.notes p{orphans:2;widows:2}
 [data-layout="a4"] .business-name{font-size:18pt;margin-block-end:10px}
 [data-layout="a4"] .paper-brand{width:165px}
 [data-layout="a4"] .title-band{margin-block:13px 9px}
 [data-layout="a4"] h1{font-size:22pt}
 [data-layout="a4"] h2{margin-block-end:8px}
 [data-layout="a4"] .detail-grid,[data-layout="a4"] .field{row-gap:2px}
 [data-layout="a4"] .field{padding-block-end:4px}
 [data-layout="a4"] :is(.business-profile,.recipient) .field{padding-block-end:3px}
 [data-layout="a4"] dt{font-size:7pt;line-height:1.35}
 [data-layout="a4"] dd{font-size:9pt;line-height:1.35}
 [data-layout="a4"] .metadata .detail-grid{padding:9px 12px}
 [data-layout="a4"] .metadata .field{padding-block-end:0}
 [data-layout="a4"] .number-note{margin-block-start:5px}
 [data-layout="a4"] .paper-rule{margin-block:10px}
 [data-layout="a4"] .recipient{margin-block-end:10px;padding:10px 12px}
 [data-layout="a4"] .items{margin-block:10px}
 [data-layout="a4"] .items th,[data-layout="a4"] .items td{padding-block:5px}
 [data-layout="a4"] .item-meta{margin-block-start:4px}
 [data-layout="a4"] .item-meta .field{padding-block-end:0}
 [data-layout="a4"] .closing{margin-block-start:12px}
 [data-layout="a4"] .summary{padding:10px 12px}
 [data-layout="a4"] .summary .total-field{padding-block-start:6px}
 [data-layout="a4"] .summary .total-field dd{font-size:18pt}
 [data-layout="a4"] .notes,[data-layout="a4"] .paper-footer{margin-block-start:10px}
 [data-layout="a4"] .paper-footer .paper-rule{margin-block:5px}
 [data-layout="a4"] .paper-footer .detail-grid{margin-block-start:4px}
 [data-layout="a4"] .paper-footer .field{padding-block-end:2px}
 [data-layout="a4"] .paper-footer dd{font-size:8pt}
 [data-layout="a4"] .paper-footer p{margin-block-start:3px}
 .paper-rule,.draft,.items th,.items tbody tr,.summary,.metadata{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
`;
}
