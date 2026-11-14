"""
parsePhysics.py

Parses /tmp/physics_raw.txt into structured JSON questions.

Format notes:
- Answers start with 'ns' (OCR artifact for 'Ans')
- MCQs have options (a)(b)(c)(d) and end with 'Thus (x) is correct'
- Year tags like 'MAIN 2021', 'COMP 2017', 'SEM-1 2022' embedded in answers
- Diagram/figure questions skipped

Output: /tmp/physics_questions.json
"""

import re
import json
import sys

IN_PATH  = '/tmp/physics_raw.txt'
OUT_PATH = '/tmp/physics_questions.json'

CHAPTER_RE = re.compile(r'###CHAPTER (\d+) (.+?)###')

# Answer delimiter — 'ns' alone on a line or followed by spaces/year tag
ANS_RE = re.compile(r'\bns\s*(?:\s+(?:MaIN|COMP|SEM|MAIN|HCG)\s*[\d\-]+)?', re.IGNORECASE)

# MCQ options pattern
MCQ_OPT_RE = re.compile(
    r'\(a\)\s*(.+?)\s*\(b\)\s*(.+?)\s*\(c\)\s*(.+?)\s*\(d\)\s*(.+?)(?=\s*(?:ns|\n\n|\Z))',
    re.DOTALL | re.IGNORECASE
)

# Correct option in answer
CORRECT_OPT_RE = re.compile(r'Thus\s*\(([a-d])\)\s*is\s*correct', re.IGNORECASE)

# Skip diagram/figure questions
DIAGRAM_RE = re.compile(
    r'\b(?:diagram|figure|fig\.|draw|sketch|label|shown\s+below|'
    r'given\s+figure|following\s+figure|refer\s+to\s+the|'
    r'study\s+the\s+(?:diagram|figure)|complete\s+the\s+diagram|'
    r'name\s+the\s+parts?\s+(?:marked|labelled))\b',
    re.IGNORECASE
)

# Question number at start
Q_NUM_RE = re.compile(r'^\s*(\d{1,3})\.\s+(.+)', re.DOTALL)

# Year tag in answer to extract source
YEAR_RE = re.compile(r'\b(MaIN|COMP|SEM|MAIN|HCG)\s*([\d]{4})', re.IGNORECASE)

NUMERICAL_RE = re.compile(
    r'\b(?:calculate|compute|find\s+the|determine\s+the|what\s+is\s+the\s+(?:value|magnitude|speed|velocity|'
    r'force|energy|power|resistance|current|voltage|frequency|wavelength|distance|time|mass|weight|'
    r'pressure|temperature|work|acceleration|momentum)|'
    r'how\s+(?:much|many|far|long|fast)|'
    r'if\s+.{0,60}(?:kg|m\/s|km\/h|ohm|watt|joule|newton|ampere|volt|hertz|metre|second))\b',
    re.IGNORECASE
)

def classify_type(q_text, answer, options):
    if options:
        return 'mcq'
    if NUMERICAL_RE.search(q_text):
        return 'numerical'
    words = len(answer.split())
    if words <= 40:
        return 'short_answer'
    return 'long_answer'

def extract_marks(q_type):
    if q_type == 'mcq':
        return 1
    if q_type in ('short_answer', 'numerical'):
        return 2
    return 4

def parse_options(text):
    m = MCQ_OPT_RE.search(text)
    if not m:
        return None
    return {
        'a': re.sub(r'[\x00-\x1f\x7f]', '', m.group(1)).strip(),
        'b': re.sub(r'[\x00-\x1f\x7f]', '', m.group(2)).strip(),
        'c': re.sub(r'[\x00-\x1f\x7f]', '', m.group(3)).strip(),
        'd': re.sub(r'[\x00-\x1f\x7f]', '', m.group(4)).strip(),
    }

def extract_correct_option(answer_text):
    m = CORRECT_OPT_RE.search(answer_text)
    return m.group(1).lower() if m else None

def extract_source(answer_text):
    m = YEAR_RE.search(answer_text)
    if m:
        return f"{m.group(1).upper()} {m.group(2)}"
    return None

def clean_answer(text):
    # Remove control characters FIRST (so year-tag regex works on clean start)
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
    # Remove year tag prefix (MAIN 2024, COMP 2017, SQP 2005, SEM-1 2022 etc)
    text = re.sub(r'^\s*(?:MaIN|COMP|SEM[\s\-]*\d*|MAIN|HCG|SQP)\s+\d{4}\s*', '', text, flags=re.IGNORECASE)
    # Truncate at next question number bleeding in (e.g. "72. In a beam...")
    text = re.sub(r'\s+\d{1,3}\.\s+.+$', '', text, flags=re.DOTALL)
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def clean_option(text):
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
    return text.strip()

with open(IN_PATH, encoding='utf-8') as f:
    raw = f.read()

questions = []
current_chapter_id   = None
current_chapter_name = None
skipped_diagram = 0
skipped_short   = 0

# Split into chapter blocks
chapter_splits = list(CHAPTER_RE.finditer(raw))

for idx, ch_match in enumerate(chapter_splits):
    current_chapter_id   = int(ch_match.group(1))
    current_chapter_name = ch_match.group(2).strip()

    # Get text until next chapter or end
    start = ch_match.end()
    end   = chapter_splits[idx + 1].start() if idx + 1 < len(chapter_splits) else len(raw)
    block = raw[start:end]

    # Split on answer markers
    parts = ANS_RE.split(block)

    i = 0
    while i < len(parts) - 1:
        pre_text  = parts[i].strip()
        ans_text  = parts[i + 1].strip() if i + 1 < len(parts) else ''
        i += 1

        if not pre_text:
            continue

        # Find the last question number in pre_text
        lines = pre_text.split('\n')
        last_q_start = -1
        last_q_num   = None
        q_body       = ''

        for li, line in enumerate(lines):
            m = Q_NUM_RE.match(line)
            if m:
                last_q_start = li
                last_q_num   = int(m.group(1))
                q_body       = m.group(2)

        if last_q_num is None:
            continue

        # Gather rest of question lines after number
        full_q = q_body
        for line in lines[last_q_start + 1:]:
            if Q_NUM_RE.match(line):
                break
            full_q += ' ' + line

        full_q = re.sub(r'\s+', ' ', full_q).strip()

        if len(full_q) < 10:
            skipped_short += 1
            continue

        if DIAGRAM_RE.search(full_q):
            skipped_diagram += 1
            continue

        # Parse MCQ options from full question text
        q_section = '\n'.join(lines[last_q_start:])
        options   = parse_options(q_section)

        # Clean answer
        answer = clean_answer(ans_text)
        if not answer or len(answer) < 3:
            continue

        # For MCQs embed correct option in answer
        correct_opt = extract_correct_option(ans_text)
        if options and correct_opt and correct_opt in options:
            answer = f"({correct_opt}) {options[correct_opt]} — Thus ({correct_opt}) is correct"

        source = extract_source(ans_text)
        q_type = classify_type(full_q, answer, options)
        marks  = extract_marks(q_type)

        qid = f"physics_ch{current_chapter_id}_{last_q_num}"

        questions.append({
            'id':           qid,
            'subject':      'physics',
            'chapter_id':   current_chapter_id,
            'chapter_name': current_chapter_name,
            'question':     full_q,
            'answer':       answer,
            'options':      options,
            'type':         q_type,
            'marks':        marks,
            'source':       source,
        })

with open(OUT_PATH, 'w', encoding='utf-8') as f:
    json.dump(questions, f, indent=2, ensure_ascii=False)

# Stats
mcq   = sum(1 for q in questions if q['type'] == 'mcq')
short = sum(1 for q in questions if q['type'] == 'short_answer')
long  = sum(1 for q in questions if q['type'] == 'long_answer')

print(f'Total questions: {len(questions)}')
print(f'  MCQ:          {mcq}')
print(f'  Short answer: {short}')
print(f'  Long answer:  {long}')
print(f'  Skipped (diagram): {skipped_diagram}')
print(f'  Skipped (too short): {skipped_short}')
print(f'\nWritten to {OUT_PATH}')
