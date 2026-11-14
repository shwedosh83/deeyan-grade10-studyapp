"""
One-off local extraction: OCR the Selina Biology Class 10 PDF (scanned images,
no text layer) using macOS's built-in Vision framework, chapter by chapter,
and write one JSON file per DB chapter_id into backend/data/textbook/biology/.

Run locally only (needs macOS + PyObjC Vision: `pip3 install pyobjc-framework-Vision
pyobjc-framework-Quartz`, plus PyMuPDF: `pip3 install pymupdf`). Not part of the
deployed app — deployed code only reads the JSON this produces (via
buildTextbookIndex.js), never the source PDF.

After running this, combine the per-chapter files into the single index file
evaluate.js actually loads:
    node backend/scripts/buildTextbookIndex.js biology

Update PDF_PATH below if the source file moves.
"""
import json
import time
import fitz  # PyMuPDF
import Vision
from Foundation import NSData

PDF_PATH = "/Users/shwetadoshi/Documents/ClaudeCodeExperiments/Deeyan Grade 10/Bio/ICSE-Class-10-Selina-Biology-Full-Book.pdf"
OUT_DIR = "/Users/shwetadoshi/Documents/ClaudeCodeExperiments/deeyan-bio/backend/data/textbook/biology"

# Selina PDF chapter -> (start_page, end_page) 1-indexed, inclusive, from the PDF's own TOC.
# Mapped to the Supabase `questions` table's biology chapter_id/chapter_name.
# Two DB chapters (6 "Chemical Coordination in Plants", 13 "Human Evolution") don't exist
# in this (older) edition of the book, so they're intentionally omitted here — evaluate.js
# falls back to model-answer-only grading for those two chapters.
CHAPTER_MAP = [
    # (db_chapter_id, db_chapter_name, selina_title, start_page, end_page)
    (15, "The Cell", "Cell: The Structural and Functional Unit of Life", 9, 14),
    (1,  "Cell Cycle and Structure of Chromosomes", "Structure of Chromosomes, Cell Cycle and Cell Division", 15, 27),
    (2,  "Genetics", "Genetics: Some Basic Fundamentals", 28, 41),
    (3,  "Absorption by Roots", "Absorption by Roots — The Processes Involved", 42, 59),
    (4,  "Transpiration", "Transpiration", 60, 71),
    (5,  "Photosynthesis", "Photosynthesis", 72, 83),
    (7,  "The Circulatory System", "The Circulatory System", 84, 105),
    (8,  "The Excretory System", "The Excretory System", 106, 114),
    (9,  "Nervous System and Sense Organs", "The Nervous System", 115, 141),
    (10, "The Endocrine System", "Endocrine Glands", 142, 154),
    (11, "The Reproductive System", "The Reproductive System", 155, 172),
    (12, "Human Population", "Population", 173, 183),
    (14, "Pollution", "Pollution", 199, 206),
]


def ocr_page_text(doc, page_index, zoom=2.5):
    """Render a PDF page to a PNG in memory, run Vision OCR, return joined text."""
    page = doc[page_index]
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom))
    png_bytes = pix.tobytes("png")

    ns_data = NSData.dataWithBytes_length_(png_bytes, len(png_bytes))
    handler = Vision.VNImageRequestHandler.alloc().initWithData_options_(ns_data, None)

    request = Vision.VNRecognizeTextRequest.alloc().init()
    request.setRecognitionLevel_(1)  # VNRequestTextRecognitionLevelAccurate
    request.setUsesLanguageCorrection_(True)

    ok, error = handler.performRequests_error_([request], None)
    if not ok:
        return f"[OCR ERROR page {page_index + 1}: {error}]"

    lines = []
    for obs in request.results():
        candidates = obs.topCandidates_(1)
        if candidates and len(candidates) > 0:
            lines.append(str(candidates[0].string()))
    return "\n".join(lines)


def main():
    doc = fitz.open(PDF_PATH)
    for chapter_id, chapter_name, selina_title, start, end in CHAPTER_MAP:
        t0 = time.time()
        page_texts = [ocr_page_text(doc, p) for p in range(start - 1, end)]
        full_text = "\n\n".join(page_texts)
        out = {
            "chapter_id": chapter_id,
            "chapter_name": chapter_name,
            "selina_title": selina_title,
            "source": "Selina Concise Biology, ICSE Class 10",
            "pdf_pages": [start, end],
            "text": full_text,
        }
        out_path = f"{OUT_DIR}/{chapter_id}.json"
        with open(out_path, "w") as f:
            json.dump(out, f, ensure_ascii=False, indent=2)
        print(f"ch{chapter_id} '{chapter_name}': {len(full_text)} chars, {time.time() - t0:.1f}s -> {out_path}", flush=True)


if __name__ == "__main__":
    main()
