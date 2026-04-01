"""
Parse Chemistry question bank raw text → /tmp/chemistry_questions.json
Handles OCR quirks: "A\nns" split, spaced letters in chapter headers, etc.
"""
import re, json, sys

RAW_PATH  = '/tmp/chemistry_raw.txt'
OUT_PATH  = '/tmp/chemistry_questions.json'

CHAPTER_MAP = {
    201: 'Periodic Properties and Variations',
    202: 'Chemical Bonding',
    203: 'Study of Acids, Bases and Salts',
    204: 'Analytical Chemistry',
    205: 'Mole Concept and Stoichiometry',
    206: 'Electrolysis',
    207: 'Metallurgy',
    208: 'Hydrogen Chloride',
    209: 'Ammonia',
    210: 'Nitric Acid',
    211: 'Sulphuric Acid',
    212: 'Organic Chemistry',
}

# ─── Regex patterns ────────────────────────────────────────────────────────────

# Chapter marker injected by extractor
CH_MARKER  = re.compile(r'###CHAPTER (\d+) ([^#]+)###')

# Answer marker: "As SQP 2014" / "A\nns COMP 2017" / "A\ns M a IN 2020"
ANS_MARKER = re.compile(
    r'\bA\s*\n?\s*[Ss]\s+'
    r'(?:(?:SQP|COMP|MAIN|M\s*a\s*IN|MA\s*IN|SEM[-\s]*I{1,2}|OUA\s*U\s*MARKS?|BOARD)\s+\d{2,4}|\d{4})',
    re.IGNORECASE
)

# MCQ option line: "(a) something (b) something (c) something (d) something"
# or split across lines
MCQ_OPT = re.compile(r'\(\s*[aAbBcCdD]\s*\)')

# "Thus (b) is correct" or standalone "(b)" or "(a) is correct"
CORRECT_OPT = re.compile(r'[Tt]hus\s+\(([a-dA-D])\)|correct\s+option\s+is\s+\(([a-dA-D])\)|\(\s*([a-dA-D])\s*\)\s+is\s+correct', re.IGNORECASE)

# Numbered question start: "123. " at start of line or after newline
Q_NUM = re.compile(r'(?:^|\n)\s*(\d{1,3})\.\s+(.+?)(?=\n\s*\d{1,3}\.\s|\Z)', re.DOTALL)

# ─── Helpers ──────────────────────────────────────────────────────────────────

def clean(s):
    s = re.sub(r'\s+', ' ', s).strip()
    s = re.sub(r'Downloaded From.*?\.com', '', s, flags=re.IGNORECASE)
    return s.strip()

def extract_mcq_options(text):
    """Try to extract a/b/c/d options from question text."""
    opts = {}
    for letter in 'abcd':
        m = re.search(rf'\(\s*{letter}\s*\)\s*(.+?)(?=\(\s*[a-d]\s*\)|\Z)', text, re.IGNORECASE|re.DOTALL)
        if m:
            opts[letter] = clean(m.group(1))
    return opts if len(opts) >= 3 else None

def extract_correct_letter(answer_text):
    """Extract the MCQ correct option letter from answer/explanation text."""
    # "Thus (b) is correct option"
    m = re.search(r'[Tt]hus\s+\(\s*([a-dA-D])\s*\)', answer_text)
    if m: return m.group(1).lower()
    # "correct option is (b)"
    m = re.search(r'correct\s+option\s+is\s+\(\s*([a-dA-D])\s*\)', answer_text, re.IGNORECASE)
    if m: return m.group(1).lower()
    # "(b) is correct"
    m = re.search(r'\(\s*([a-dA-D])\s*\)\s+is\s+correct', answer_text, re.IGNORECASE)
    if m: return m.group(1).lower()
    # First standalone option reference in answer
    m = re.search(r'^\s*\(\s*([a-dA-D])\s*\)', answer_text.strip())
    if m: return m.group(1).lower()
    return None

def is_diagram_question(text):
    keywords = ['diagram', 'figure', 'label', 'draw', 'sketch', 'illustrate', 'given below is a diagram', 'study the figure']
    return any(k in text.lower() for k in keywords)

# ─── Main parser ──────────────────────────────────────────────────────────────

raw = open(RAW_PATH, encoding='utf-8').read()

# Split into chapter sections
sections = re.split(r'###CHAPTER (\d+) ([^#]+)###', raw)

questions = []
q_id_counter = 0

# sections[0] = preamble, then groups of (ch_id, ch_name, text)
i = 1
while i < len(sections) - 2:
    ch_id   = int(sections[i])
    ch_name = sections[i+1].strip()
    text    = sections[i+2]
    i += 3

    print(f'\nParsing Ch{ch_id} {ch_name}...')

    # Split text at answer markers to get Q-A pairs
    # Strategy: find all numbered questions, then find their answers

    # Normalize OCR split: "A\nns" → "Ans"
    text = re.sub(r'A\s*\n\s*[Ss]\s+', 'Ans ', text)

    # Find all answer positions
    ans_positions = [(m.start(), m.end()) for m in re.finditer(
        r'Ans\s+(?:(?:SQP|COMP|MAIN|SEM[-\s]*I{1,2}|BOARD|OUA\s*U\s*MARKS?)\s+\d{2,4}|\d{4})',
        text, re.IGNORECASE
    )]

    if not ans_positions:
        print(f'  No answer markers found — skipping')
        continue

    # Find all numbered questions
    q_matches = list(re.finditer(r'(?:^|\n)\s*(\d{1,3})\.\s+', text))

    parsed_ch = 0
    skipped   = 0

    for qi, qm in enumerate(q_matches):
        q_num  = int(qm.group(1))
        q_start = qm.start()
        q_end   = q_matches[qi+1].start() if qi+1 < len(q_matches) else len(text)
        segment = text[q_start:q_end]

        # Find answer marker within this segment
        ans_m = re.search(
            r'Ans\s+(?:(?:SQP|COMP|MAIN|SEM[-\s]*I{1,2}|BOARD|OUA\s*U\s*MARKS?)\s+\d{2,4}|\d{4})',
            segment, re.IGNORECASE
        )
        if not ans_m:
            skipped += 1
            continue

        q_text_raw  = segment[:ans_m.start()]
        ans_text_raw = segment[ans_m.end():]

        q_text   = clean(q_text_raw)
        ans_text = clean(ans_text_raw)

        if not q_text or len(q_text) < 5:
            skipped += 1
            continue

        # Skip diagram-only questions
        if is_diagram_question(q_text) and len(q_text) < 60:
            skipped += 1
            continue

        # Determine if MCQ
        has_options = len(re.findall(r'\(\s*[abcd]\s*\)', q_text, re.IGNORECASE)) >= 3

        if has_options:
            opts = extract_mcq_options(q_text)
            correct = extract_correct_letter(ans_text) if ans_text else None

            if not opts or not correct:
                skipped += 1
                continue

            # Clean question text (remove options from question body)
            q_clean = re.split(r'\(\s*a\s*\)', q_text, flags=re.IGNORECASE)[0].strip()
            q_clean = clean(q_clean)

            if len(q_clean) < 8:
                skipped += 1
                continue

            q_id_counter += 1
            questions.append({
                'id': f'chem_pdf_ch{ch_id}_mcq_{q_id_counter:04d}',
                'subject': 'chemistry',
                'chapter_id': ch_id,
                'chapter_name': ch_name,
                'type': 'mcq',
                'question': q_clean,
                'options': opts,
                'answer': correct,
                'skill': None,
            })
            parsed_ch += 1

        else:
            # Short or long answer
            if not ans_text or len(ans_text) < 5:
                skipped += 1
                continue

            q_type = 'long_answer' if len(q_text) > 350 or len(ans_text) > 400 else 'short_answer'
            marks  = 4 if q_type == 'long_answer' else 2

            q_id_counter += 1
            questions.append({
                'id': f'chem_pdf_ch{ch_id}_sho_{q_id_counter:04d}',
                'subject': 'chemistry',
                'chapter_id': ch_id,
                'chapter_name': ch_name,
                'type': q_type,
                'question': q_text,
                'options': None,
                'answer': ans_text[:800],
                'skill': None,
            })
            parsed_ch += 1

    print(f'  Parsed: {parsed_ch} | Skipped: {skipped}')

# ─── Output ───────────────────────────────────────────────────────────────────

mcq_count = sum(1 for q in questions if q['type'] == 'mcq')
sa_count  = sum(1 for q in questions if q['type'] == 'short_answer')
la_count  = sum(1 for q in questions if q['type'] == 'long_answer')

print(f'\n=== Totals ===')
print(f'MCQ:          {mcq_count}')
print(f'Short answer: {sa_count}')
print(f'Long answer:  {la_count}')
print(f'TOTAL:        {len(questions)}')

with open(OUT_PATH, 'w', encoding='utf-8') as f:
    json.dump(questions, f, ensure_ascii=False, indent=2)

print(f'\nWritten to {OUT_PATH}')
