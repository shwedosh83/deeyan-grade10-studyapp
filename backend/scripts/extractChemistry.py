"""
Extract Chemistry 10th PDF text to /tmp/chemistry_raw.txt
Handles encrypted PDFs (pypdf handles it transparently)
"""
import sys, re
try:
    from pypdf import PdfReader
except ImportError:
    from PyPDF2 import PdfReader

PDF_PATH = '/Users/shwetadoshi/Documents/Deeyan Grade 10 copy/Chemistry/Chemistry 10th.pdf'
OUT_PATH = '/tmp/chemistry_raw.txt'

CHAPTER_MAP = {
    1:  (201, 'Periodic Properties and Variations'),
    2:  (202, 'Chemical Bonding'),
    3:  (203, 'Study of Acids, Bases and Salts'),
    4:  (204, 'Analytical Chemistry'),
    5:  (205, 'Mole Concept and Stoichiometry'),
    6:  (206, 'Electrolysis'),
    7:  (207, 'Metallurgy'),
    8:  (208, 'Hydrogen Chloride'),
    9:  (209, 'Ammonia'),
    10: (210, 'Nitric Acid'),
    11: (211, 'Sulphuric Acid'),
    12: (212, 'Organic Chemistry'),
}

def clean_text(raw):
    # Remove control chars
    raw = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', ' ', raw)
    # Collapse multiple spaces
    raw = re.sub(r'  +', ' ', raw)
    return raw

def detect_chapter(text):
    m = re.search(r'Ch\s+(\d+)\s*:', text, re.IGNORECASE)
    if m:
        return int(m.group(1))
    return None

reader = PdfReader(PDF_PATH)
total = len(reader.pages)
print(f'Total pages: {total}')

# First pass: detect chapter boundaries
chapter_pages = {}
for i in range(total):
    text = reader.pages[i].extract_text() or ''
    ch = detect_chapter(text)
    if ch and ch not in chapter_pages:
        chapter_pages[ch] = i
        print(f'Ch{ch} starts at page {i+1}')

# Build page→chapter mapping
page_chapter = {}
sorted_chs = sorted(chapter_pages.keys())
for idx, ch in enumerate(sorted_chs):
    start = chapter_pages[ch]
    end = chapter_pages[sorted_chs[idx+1]] if idx+1 < len(sorted_chs) else total
    for p in range(start, end):
        page_chapter[p] = ch

# Second pass: extract all text with chapter markers
output_lines = []
current_ch = None

for i in range(total):
    text = reader.pages[i].extract_text() or ''
    text = clean_text(text)
    ch = page_chapter.get(i)
    if ch and ch != current_ch:
        current_ch = ch
        ch_id, ch_name = CHAPTER_MAP.get(ch, (200+ch, f'Chapter {ch}'))
        output_lines.append(f'\n\n###CHAPTER {ch_id} {ch_name}###\n')
    output_lines.append(text)

full_text = '\n'.join(output_lines)

with open(OUT_PATH, 'w', encoding='utf-8') as f:
    f.write(full_text)

print(f'\nWritten to {OUT_PATH} ({len(full_text):,} chars)')
print(f'Answer occurrences: {full_text.count("As   ")}')
