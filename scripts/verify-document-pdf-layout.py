"""Check real PDF page bounds and text collisions with free Poppler utilities.

Usage: python3 scripts/verify-document-pdf-layout.py /tmp/miro-document-layout-qa
Run once for renderer fixtures and once for browser/native-print evidence.
"""
import json
import pathlib
import re
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET

if not shutil.which("pdftotext") or not shutil.which("pdfinfo"):
    raise SystemExit("Install free Poppler (pdftotext/pdfinfo) to verify PDF layout.")
directory = pathlib.Path(sys.argv[1]).resolve()
files = sorted(directory.glob("*.pdf"))
if not files:
    raise SystemExit("No PDF fixtures found")
ns = {"x": "http://www.w3.org/1999/xhtml"}
failures = []
pages = 0
expectations_file = directory / "pdf-content-expectations.json"
expectations = json.loads(expectations_file.read_text()) if expectations_file.exists() else {}
for expected_file in expectations:
    if not (directory / expected_file).is_file():
        failures.append({"file": expected_file, "problem": "missing required maximum-field fixture"})
anchor_checks = 0
content_checks = 0
wrapped_content_checks = []


def compact_text(value):
    # Poppler adds these directional formatting characters around visual runs.
    # They carry no source glyph and may separate a word across wrapped lines.
    return re.sub(r"[\s\u200e\u200f\u202a-\u202e\u2066-\u2069]", "", value)


def stacked_value_fragments(words, page, label_box, expected):
    """Find the exact contact value in contiguous physical lines below a label."""
    starts = [word for word in words if word[0] == page and word[2]
              and expected.startswith(compact_text(word[2]))
              and label_box[1] - 1 <= word[1][1] <= label_box[3] + 35]
    starts.sort(key=lambda word: (abs(word[1][1] - label_box[3]), abs(word[1][0] - label_box[0])))
    for first in starts:
        fragments = [first]
        remaining = expected[len(compact_text(first[2])):]
        while remaining:
            previous = fragments[-1][1]
            following = [word for word in words if word[0] == page and word[2]
                         and remaining.startswith(compact_text(word[2]))
                         and previous[1] + 1 < word[1][1]
                         and word[1][1] - previous[3] <= 20
                         and abs(word[1][0] - first[1][0]) < 50]
            if not following:
                break
            following.sort(key=lambda word: (word[1][1] - previous[1], abs(word[1][0] - first[1][0])))
            fragments.append(following[0])
            remaining = remaining[len(compact_text(following[0][2])):]
        if not remaining:
            return fragments
    return []


def wrapped_marker_fragments(words, expected, rtl):
    """Verify exact fixture-marker glyphs across adjacent reading-edge lines.

    RTL extraction may place other words before the continuation digit on the
    next line. Reconstruct only uppercase test markers, never financial values.
    Address separator punctuation is allowed outside the marker's last glyph.
    """
    if not re.fullmatch(r"[A-Z0-9]+", expected):
        return []
    edge = 2 if rtl else 0
    for first in words:
        initial = compact_text(first[2] or "").strip(",;:")
        if not initial or initial == expected or not expected.startswith(initial):
            continue
        fragments = [first]
        remaining = expected[len(initial):]
        while remaining:
            previous = fragments[-1][1]
            following = [word for word in words
                         if word[0] == first[0] and word[2]
                         and compact_text(word[2]).strip(",;:")
                         and remaining.startswith(compact_text(word[2]).strip(",;:"))
                         and abs(word[1][edge] - first[1][edge]) <= 1.5
                         and previous[1] + 1 < word[1][1]
                         and word[1][1] - previous[3] <= 20]
            if not following:
                break
            following.sort(key=lambda word: (word[1][1] - previous[1], abs(word[1][edge] - first[1][edge])))
            fragments.append(following[0])
            remaining = remaining[len(compact_text(following[0][2]).strip(",;:")):]
        if not remaining:
            return fragments
    return []


for file in files:
    root = ET.fromstring(subprocess.check_output(["pdftotext", "-bbox-layout", str(file), "-"]))
    metadata = subprocess.check_output(["pdfinfo", str(file)], text=True)
    footer_marker = re.search(r"footer-reserve=([0-9]+(?:\.[0-9]+)?)", metadata)
    footer_reserve = float(footer_marker.group(1)) if footer_marker else 52
    document_words = []
    for number, page in enumerate(root.findall(".//x:page", ns), 1):
        pages += 1
        width, height = float(page.attrib["width"]), float(page.attrib["height"])
        assert abs(width - 595.28) < 1 or abs(width - 226.77) < 1, (file, width)
        # Browser @page uses mm; the canonical PDF template uses point margins.
        margin = ((12 if width > 500 else 4) * 72 / 25.4) if file.name.startswith("print-") else (36 if width > 500 else 12)
        words = []
        for word in page.findall(".//x:word", ns):
            box = [float(word.attrib[key]) for key in ("xMin", "yMin", "xMax", "yMax")]
            # Logical ActualText can have a zero-height synthetic extraction box;
            # it is not painted text. Completeness is checked separately below.
            if box[3] - box[1] <= 0.1:
                continue
            if box[0] < margin - 1 or box[2] > width - margin + 1 or box[1] < 10 or box[3] > height - 10:
                failures.append({"file":file.name,"page":number,"problem":"outside printable margins","text":word.text,"box":box})
            body_bottom = height - footer_reserve
            footer_top = body_bottom + 12
            if not file.name.startswith("print-") and box[1] < footer_top - 0.5 and box[3] > body_bottom + 1:
                failures.append({"file":file.name,"page":number,"problem":"body overlaps footer reserve","text":word.text,"box":box})
            words.append((box, word.text))
            document_words.append((number, box, word.text))
        for index, (a, text_a) in enumerate(words):
            for b, text_b in words[index + 1:]:
                overlap_x = min(a[2], b[2]) - max(a[0], b[0])
                overlap_y = min(a[3], b[3]) - max(a[1], b[1])
                if overlap_x > 1 and overlap_y > 2:
                    failures.append({"file":file.name,"page":number,"problem":"text collision","text":[text_a,text_b],"boxes":[a,b]})
    # The English sample has stable, fictional contact values. Verify the real
    # PDF text sits below its label at the same left anchor, rather than merely
    # asserting the intended renderer coordinates or HTML styles.
    sample_name = re.fullmatch(r"(?:print-)?(?:quote|proforma|transaction_invoice|tax_invoice|receipt|invoice_receipt|credit_note|correction)-en-(a4|receipt80)\.pdf", file.name)
    if sample_name:
        for label, value in (("Phone", "+972-00-000-0000"), ("Email", "business@example.invalid")):
            labels = [word for word in document_words if word[2] == label]
            if not labels:
                failures.append({"file":file.name,"problem":"missing contact anchor text","text":[label,value]})
                continue
            p, a, _ = min(labels, key=lambda word:(word[0],word[1][1]))
            fragments = stacked_value_fragments(document_words, p, a, value)
            if not fragments:
                failures.append({"file":file.name,"page":p,"problem":"missing complete contact value below label","text":[label,value]})
                continue
            b = fragments[0][1]
            anchor_checks += 1
            if any(abs(a[0] - fragment[1][0]) > 1.5 for fragment in fragments) or b[1] < a[3] - 1:
                failures.append({"file":file.name,"page":p,"problem":"contact value not stacked on label reading edge","text":[label,value],"boxes":[a,*[fragment[1] for fragment in fragments]]})
        if sample_name.group(1) == "a4":
            descriptions = [word for word in document_words if word[2] == "Description"]
            for label, value in (("Qty", "2"), ("Net", "240.00"), ("VAT", "43.20"), ("Gross", "283.20")):
                headers = [word for word in document_words if word[2] == label and any(word[0] == d[0] and abs(word[1][1] - d[1][1]) < 3 for d in descriptions)]
                paired = False
                for p, a, _ in headers:
                    candidates = [word for word in document_words if word[0] == p and word[2] == value and a[3] <= word[1][1] <= a[3] + 160]
                    if not candidates:
                        continue
                    _, b, _ = min(candidates, key=lambda word:abs(word[1][2] - a[2]))
                    anchor_checks += 1
                    paired = True
                    if abs(a[2] - b[2]) > 1.5:
                        failures.append({"file":file.name,"page":p,"problem":"numeric table heading/body anchors differ","text":[label,value],"boxes":[a,b]})
                    break
                if not paired:
                    failures.append({"file":file.name,"problem":"missing numeric table anchor pair","text":[label,value]})
    if file.name in expectations:
        text = subprocess.check_output(["pdftotext", str(file), "-"], text=True)
        compact = compact_text(text)
        for required in expectations[file.name]:
            content_checks += 1
            if compact_text(required) not in compact:
                fragments = wrapped_marker_fragments(document_words, required, "-he-" in file.name)
                if fragments:
                    wrapped_content_checks.append({"file":file.name,"text":required,"fragments":[{"page":part[0],"box":part[1],"text":part[2]} for part in fragments]})
                else:
                    failures.append({"file":file.name,"problem":"missing maximum-field/financial content","text":required})
    if file.name.startswith("current-business-"):
        text = subprocess.check_output(["pdftotext", str(file), "-"], text=True)
        for marker in ("CURRENTV2END", "STREETV2END"):
            content_checks += 1
            if marker not in compact_text(text):
                failures.append({"file":file.name,"problem":"missing current business identity continuation","text":marker})
    if file.name.startswith("stress-"):
        text = subprocess.check_output(["pdftotext", str(file), "-"], text=True)
        for marker in ("END-OF-DESCRIPTION", "END-OF-NOTE"):
            if marker not in text:
                failures.append({"file":file.name,"problem":"missing continuation content","text":marker})
report = {"files":len(files), "pages":pages, "anchor_checks":anchor_checks, "content_checks":content_checks, "wrapped_content_checks":wrapped_content_checks, "failures":failures}
(directory / "pdf-layout-report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(f"PDF layout: {len(files)} files, {pages} pages, {anchor_checks} alignment checks, {content_checks} completeness checks, {len(failures)} failures")
for failure in failures[:10]:
    print(failure)
if failures:
    raise SystemExit(1)
