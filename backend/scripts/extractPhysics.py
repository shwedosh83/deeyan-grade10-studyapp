"""
extractPhysics.py

Extracts Physics 10th.pdf, strips front matter and ad pages,
injects chapter markers, and writes clean text to /tmp/physics_raw.txt.

Chapters (PDF page indices, 0-based):
  Ch 1: Force (22-63)
  Ch 2: Work, Power & Energy (64-115)
  Ch 3: Mechanics (116-159)
  Ch 4: Light (160-251)
  Ch 5: Sound (252-299)
  Ch 6: Electricity & Magnetism (300-411)
  Ch 7: Heat (412-453)
  Ch 8: Modern Physics (454-491)
"""

import pypdf
import re
import sys

PDF_PATH = '/Users/shwetadoshi/Documents/Deeyan Grade 10/Physics/Physics 10th.pdf'
OUT_PATH = '/tmp/physics_raw.txt'

CHAPTERS = [
    (1,  22,  63,  'Force: Turning Forces and Uniform Circular Motion'),
    (2,  64,  115, 'Work, Power and Energy'),
    (3,  116, 159, 'Mechanics'),
    (4,  160, 251, 'Light'),
    (5,  252, 299, 'Sound'),
    (6,  300, 411, 'Electricity and Magnetism'),
    (7,  412, 453, 'Heat'),
    (8,  454, 491, 'Modern Physics'),
]

# Running headers to strip (appear at top of most pages)
HEADER_RE = re.compile(
    r'^(?:ICSE\s+Ch\s*APtErwISE\s+PYQ\s+Cl\s*ASS\s+10\s+PhYSICS\s+PAgE\s+\d+|'
    r'Ch\s*\d+\s*:.*?(?=\n)|'
    r'iCSE\s+ChaptErwiSE\s+pYQ\s+CL\s*a\s*SS\s+10\s+phYS\s*iCS\s+pagE\s+\d+|'
    r'ICSE\s+ClaSS\s+X\s+EXaMINaTION\s+PaPER\s+\d{4})',
    re.IGNORECASE | re.MULTILINE
)

AD_RE = re.compile(
    r'NODIA\s+APP|www\.\S+|Play\s+Store|pdf\.tube|Amazon|Free\s+PDF|'
    r'Search\s+Play|Order\s+the\s+Hard|Click\s+your\s+Subject|'
    r'Copyright\s+©|Information\s+contained\s+in\s+this\s+book',
    re.IGNORECASE
)

def clean_page(text):
    # Remove running headers
    text = HEADER_RE.sub('', text)
    # Remove OCR noise: lone page numbers at start of line
    text = re.sub(r'^\s*\d{1,3}\s*$', '', text, flags=re.MULTILINE)
    # Normalise whitespace runs
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()

def is_ad_page(text):
    return bool(AD_RE.search(text)) and len(text.strip()) < 400

reader = pypdf.PdfReader(PDF_PATH)
print(f'Total pages: {len(reader.pages)}')

output_parts = []

for ch_id, start_idx, end_idx, ch_name in CHAPTERS:
    output_parts.append(f'\n###CHAPTER {ch_id} {ch_name}###\n')
    print(f'Ch {ch_id}: pages {start_idx+1}–{end_idx+1}  ({ch_name})')

    for i in range(start_idx, end_idx + 1):
        text = reader.pages[i].extract_text() or ''
        if is_ad_page(text):
            print(f'  Skipping ad page {i+1}')
            continue
        cleaned = clean_page(text)
        if cleaned:
            output_parts.append(cleaned + '\n')

full_text = '\n'.join(output_parts)

with open(OUT_PATH, 'w', encoding='utf-8') as f:
    f.write(full_text)

print(f'\nWrote {len(full_text):,} chars to {OUT_PATH}')
