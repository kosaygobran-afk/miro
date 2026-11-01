// Deterministic SVG/app-icon exports from the same outlines used by React.
import { readFile, mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
const art = JSON.parse(
  await readFile(
    new URL("../src/components/brand/artwork.json", import.meta.url),
    "utf8",
  ),
);
const dir = new URL("../public/images/brand/", import.meta.url);
await mkdir(dir, { recursive: true });
const paths = art.wordmark
  .map(
    (p) => `<path d="${p.d}" fill="${p.accent ? art.gold : "currentColor"}"/>`,
  )
  .join("");
const caption = art.caption
  .map((p) => `<path d="${p.d}" transform="${p.transform}"/>`)
  .join("");
const outline = paths + `<g fill="currentColor">${caption}</g>`;
const svg = (body, box, color) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}" role="img" aria-label="מירו גרופ." style="color:${color}"><title>מירו גרופ. — מערכות מיגון ותקשורת</title>${body}</svg>\n`;
for (const [name, color] of [
  ["miro-group.svg", "#f5f5f2"],
  ["miro-group-dark-ink.svg", "#171717"],
]) {
  await writeFile(new URL(name, dir), svg(outline, art.viewBox, color));
}
// A neutral 2:1 campaign plate; lettering sits in the unobscured image area.
await writeFile(
  new URL("miro-group-hero.svg", dir),
  svg(
    `<rect width="1600" height="800" fill="#050505"/><g transform="translate(500 280) scale(.7)">${outline}</g>`,
    "0 0 1600 800",
    "#f5f5f2",
  ),
);
const mark =
  art.wordmark
    .slice(0, 2)
    .map((p) => `<path d="${p.d}" fill="${p.accent ? art.gold : "#f5f5f2"}"/>`)
    .join("") + `<circle cx="1178" cy="233" r="25" fill="${art.gold}"/>`;
const icon = svg(
  `<rect width="512" height="512" rx="112" fill="#0c0c0c"/><svg x="64" y="114" width="384" height="284" viewBox="1100 10 380 280">${mark}</svg>`,
  "0 0 512 512",
  "#f5f5f2",
);
await writeFile(new URL("../public/miro-pos-icon.svg", import.meta.url), icon);
await writeFile(new URL("../src/app/icon.svg", import.meta.url), icon);
for (const size of [192, 512])
  await sharp(Buffer.from(icon))
    .resize(size, size)
    .png()
    .toFile(
      new URL(`../public/miro-pos-icon-${size}.png`, import.meta.url).pathname,
    );
// ICO with PNG entries: no opaque third-party ICO generator dependency.
const sizes = [16, 32, 48];
const pngs = await Promise.all(
  sizes.map((size) =>
    sharp(Buffer.from(icon)).resize(size, size).png().toBuffer(),
  ),
);
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
for (let i = 0; i < sizes.length; i++) {
  const pos = 6 + i * 16;
  header[pos] = sizes[i];
  header[pos + 1] = sizes[i];
  header.writeUInt16LE(1, pos + 4);
  header.writeUInt16LE(32, pos + 6);
  header.writeUInt32LE(pngs[i].length, pos + 8);
  header.writeUInt32LE(offset, pos + 12);
  offset += pngs[i].length;
}
await writeFile(
  new URL("../src/app/favicon.ico", import.meta.url),
  Buffer.concat([header, ...pngs]),
);
console.log(
  "Generated MIRO Group SVGs, PWA icons and favicon from canonical outlines.",
);
