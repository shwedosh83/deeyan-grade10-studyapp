"""
Extract Geography 10th PDF text to /tmp/geography_raw.txt
Injects ###CHAPTER [id] [name]### markers for the parser.
Skips: NODIA ad pages, ICSE 2025 exam paper (pages 6-15), front matter.
"""
import re
from pypdf import PdfReader

PDF_PATH = '/Users/shwetadoshi/Documents/Deeyan Grade 10 copy/Geo/Geography 10th.pdf'
OUT_PATH = '/tmp/geography_raw.txt'

CHAPTER_MAP = {
    1:  (301, 'Interpretation of Topographical Maps'),
    2:  (302, 'Map of India'),
    3:  (303, 'Location, Extent and Physical Features'),
    4:  (304, 'Climate'),
    5:  (305, 'Soil Resources'),
    6:  (306, 'Natural Vegetation'),
    7:  (307, 'Water Resources'),
    8:  (308, 'Mineral Resources'),
    9:  (309, 'Energy Resources'),
    10: (310, 'Agriculture'),
    11: (311, 'Manufacturing Industries'),
    12: (312, 'Transport'),
    13: (313, 'Waste Management'),
}

# Pages to skip: front matter (0-4), ICSE 2025 exam (5-14)
SKIP_PAGES = set(range(0, 15))

AD_PATTERNS = [
    r'NODIA AND COMPANY',
    r'www\.pdf\.tube',
    r'www\.nodia',
    r'Search Play Store by NODIA',
    r'NODIA APP',
    r'Free PDF For All Study Material',
    r'Previous Year Solved Exam Question Bank',
    r'Click your Subject and Instantly',
    r'Order the Hard copy from Amazon',
]
AD_RE = re.compile('|'.join(AD_PATTERNS), re.IGNORECASE)

def is_ad_page(text):
    return bool(AD_RE.search(text))

def clean_text(raw):
    raw = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', ' ', raw)
    raw = re.sub(r'\s*w\.nodiwd\.\s*', ' ', raw)  # strip watermark
    # Strip running page headers embedded mid-text
    raw = re.sub(r'ICSE\s+Ch\s+APTERwISE.*?PAGE\s+\d+', '', raw, flags=re.IGNORECASE)
    raw = re.sub(r'PAGE\s+\d+\s+ICSE\s+GEO.*?PYQ', '', raw, flags=re.IGNORECASE)
    raw = re.sub(r'(?m)^Ch\s+\d+\s*:.*$', '', raw)
    raw = re.sub(r'  +', ' ', raw)
    return raw.strip()

def detect_chapter(text):
    """Detect chapter from page header: 'Ch 1 :' or 'CHAPtER    1' or 'CHAPTER 1'"""
    # "Ch 3 : LOCATION, EXTENT..."
    m = re.search(r'\bCh\s+(\d{1,2})\s*:', text, re.IGNORECASE)
    if m:
        return int(m.group(1))
    # "CHAPtER    1" or "CHAPTER 1"
    m = re.search(r'\bCHAPT?ER\s+(\d{1,2})\b', text, re.IGNORECASE)
    if m:
        return int(m.group(1))
    return None

reader = PdfReader(PDF_PATH)
total = len(reader.pages)
print(f'Total pages: {total}')

# First pass: detect chapter boundaries (skip ad pages and front matter)
chapter_pages = {}
for i in range(total):
    if i in SKIP_PAGES:
        continue
    text = reader.pages[i].extract_text() or ''
    if is_ad_page(text):
        continue
    ch = detect_chapter(text)
    if ch and ch not in chapter_pages:
        chapter_pages[ch] = i
        ch_id, ch_name = CHAPTER_MAP.get(ch, (300+ch, f'Chapter {ch}'))
        print(f'Ch{ch} ({ch_name}) starts at page {i+1}')

print(f'\nDetected {len(chapter_pages)} chapters')

# Build page→chapter mapping
page_chapter = {}
sorted_chs = sorted(chapter_pages.keys())
for idx, ch in enumerate(sorted_chs):
    start = chapter_pages[ch]
    end = chapter_pages[sorted_chs[idx+1]] if idx+1 < len(sorted_chs) else total
    for p in range(start, end):
        page_chapter[p] = ch

# Second pass: extract text with chapter markers
output_lines = []
current_ch = None
skipped_ad = 0
skipped_front = 0

for i in range(total):
    if i in SKIP_PAGES:
        skipped_front += 1
        continue
    text = reader.pages[i].extract_text() or ''
    if is_ad_page(text):
        skipped_ad += 1
        continue

    text = clean_text(text)
    ch = page_chapter.get(i)

    if ch and ch != current_ch:
        current_ch = ch
        ch_id, ch_name = CHAPTER_MAP.get(ch, (300+ch, f'Chapter {ch}'))
        output_lines.append(f'\n\n###CHAPTER {ch_id} {ch_name}###\n')

    output_lines.append(text)

full_text = '\n'.join(output_lines)

with open(OUT_PATH, 'w', encoding='utf-8') as f:
    f.write(full_text)

print(f'\nDone. Skipped {skipped_front} front-matter pages, {skipped_ad} ad pages.')
print(f'Output: {OUT_PATH} ({len(full_text):,} chars)')
