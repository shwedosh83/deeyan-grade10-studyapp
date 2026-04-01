"""
Parse Geography raw text → /tmp/geography_questions.json

Strategy: split on Ans: markers first, then find preceding question number.
This avoids splitting on numbered answer points (1. ... 2. ...).

Skips:
- Chapter 302 (Map of India) - pure map-marking
- All diagram/image questions (topo map extracts, figure references, map labelling)
- Theory/glossary entries (no Ans: marker)
"""
import re, json
from collections import Counter

RAW_PATH = '/tmp/geography_raw.txt'
OUT_PATH = '/tmp/geography_questions.json'

CHAPTER_MAP = {
    301: 'Interpretation of Topographical Maps',
    302: 'Map of India',
    303: 'Location, Extent and Physical Features',
    304: 'Climate',
    305: 'Soil Resources',
    306: 'Natural Vegetation',
    307: 'Water Resources',
    308: 'Mineral Resources',
    309: 'Energy Resources',
    310: 'Agriculture',
    311: 'Manufacturing Industries',
    312: 'Transport',
    313: 'Waste Management',
}

SKIP_CHAPTERS = {302}

DIAGRAM_PATTERNS = [
    r'outline map', r'toposheet', r'topo sheet', r'survey of india map',
    r'study the extract', r'study the map', r'given extract',
    r'grid reference', r'grid square', r'easting', r'northing',
    r'six.figure', r'four.figure', r'4 figure', r'6 figure',
    r'shade and (label|name)', r'mark and (label|name)', r'draw and name',
    r'mark with (a dot|an arrow)', r'mark (a dot|an arrow)',
    r'given (figure|map|diagram)', r'figure [ab]\b',
    r'\bfigure \d\b', r'shown in the (map|figure|diagram)',
    r'above (figure|map|diagram)', r'given below is a (map|figure)',
    r'the following (conventional|symbols)',
    r'in grid square', r'on the map extract',
    r'represented on the map',
]
DIAGRAM_RE = re.compile('|'.join(DIAGRAM_PATTERNS), re.IGNORECASE)

def is_diagram(text):
    return bool(DIAGRAM_RE.search(text))

def clean(s):
    s = re.sub(r'\s+', ' ', s).strip()
    return s

def extract_mcq_options(text):
    opts = {}
    for letter in 'abcd':
        m = re.search(
            rf'\(\s*{letter}\s*\)\s*(.+?)(?=\(\s*[a-d]\s*\)|\bAns\b|\Z)',
            text, re.IGNORECASE | re.DOTALL
        )
        if m:
            val = clean(m.group(1))
            if val:
                opts[letter] = val
    return opts if len(opts) >= 3 else None

def extract_correct_letter(answer_text):
    # "Thus (b) is correct option"
    m = re.search(r'[Tt]hus\s+\(\s*([a-dA-D])\s*\)', answer_text)
    if m: return m.group(1).lower()
    m = re.search(r'correct\s+option\s+is\s+\(\s*([a-dA-D])\s*\)', answer_text, re.IGNORECASE)
    if m: return m.group(1).lower()
    m = re.search(r'\(\s*([a-dA-D])\s*\)\s+is\s+(?:the\s+)?correct', answer_text, re.IGNORECASE)
    if m: return m.group(1).lower()
    m = re.search(r'^\s*\(\s*([a-d])\s*\)', answer_text.strip(), re.IGNORECASE)
    if m: return m.group(1).lower()
    return None

def classify_type(q_text):
    tl = q_text.lower()
    opts = extract_mcq_options(q_text)
    if opts:
        return 'mcq'
    short_triggers = ['name ', 'state ', 'what is', 'define ', 'give one', 'give two',
                      'give three', 'mention ', 'why is ', 'how is ', 'which of',
                      'name the', 'state the', 'what are']
    if any(t in tl for t in short_triggers) and len(q_text) < 250:
        return 'short_answer'
    return 'long_answer'

def extract_source(raw_line):
    m = re.search(r'\b(COMP|MAIN|SQP|BOARD)\s+(\d{2,4})', raw_line, re.IGNORECASE)
    if m:
        yr = int(m.group(2))
        return m.group(1).upper(), yr if yr > 2000 else 2000 + yr
    m = re.search(r'\b(20\d{2}|19\d{2})\b', raw_line)
    if m:
        return 'MAIN', int(m.group(1))
    return None, None

# ─── Parse ───────────────────────────────────────────────────────────────────

raw = open(RAW_PATH, encoding='utf-8').read()
sections = re.split(r'###CHAPTER (\d+) ([^#]+)###', raw)

questions = []
q_id_counter = 0

i = 1
while i < len(sections) - 2:
    ch_id   = int(sections[i])
    ch_name = sections[i+1].strip()
    text    = sections[i+2]
    i += 3

    if ch_id in SKIP_CHAPTERS:
        print(f'Skipping Ch {ch_id} ({ch_name}) — map chapter')
        continue

    print(f'Parsing Ch {ch_id} ({ch_name})...')

    # ── New strategy: split by Ans: markers ──────────────────────────────────
    # Pattern: capture everything before Ans: as "block", source tag, then answer
    # We split on "Ans :" and rebuild question+answer pairs

    # Tokenise: find all Ans: positions
    ans_pattern = re.compile(
        r'\bAns\s*:?\s*((?:COMP|MAIN|SQP|BOARD|SEM\s*[IV]+)?\s*\d{0,4})\n?',
        re.IGNORECASE
    )

    splits = ans_pattern.split(text)
    # splits = [before_first_ans, source1, after_source1_before_ans2, source2, ...]
    # Even indices = text blocks (contain question + prev answer if not first)
    # Odd indices = source tags

    ch_q_count = 0

    for k in range(0, len(splits) - 2, 2):
        pre_text  = splits[k]       # contains the question (and maybe a previous answer tail)
        source_tag = splits[k+1] if k+1 < len(splits) else ''
        ans_text   = splits[k+2] if k+2 < len(splits) else ''

        # Find the last numbered question in pre_text
        # Match "N. " at start of line (with up to 4 spaces indent)
        q_matches = list(re.finditer(r'(?:^|\n)[ \t]{0,4}(\d{1,3})\.\s+',
                                      pre_text, re.MULTILINE))
        if not q_matches:
            continue

        last_q = q_matches[-1]
        # Take everything from after the "N. " to end of pre_text (multi-line question)
        q_text_raw = pre_text[last_q.end():].strip()

        # The answer text ends at the next question's start (handled by next iteration)
        # but may contain answer to sub-parts; trim at first new question number
        # Remove trailing question: e.g. "...answer.\n\n5. Next question"
        ans_clean_m = re.search(r'\n\s{0,4}\d{1,3}\.\s+[A-Z(]', ans_text)
        if ans_clean_m:
            ans_text = ans_text[:ans_clean_m.start()]

        q_text  = clean(q_text_raw)
        ans_text = clean(ans_text)

        # Skip if question too short
        if not q_text or len(q_text) < 12:
            continue

        # Skip diagram questions
        if is_diagram(q_text) or is_diagram(ans_text[:50]):
            continue

        # Skip theory/glossary entries (no answer, looks like definition)
        if (not ans_text or len(ans_text) < 5) and '?' not in q_text:
            tl = q_text.lower()
            starts = ('name', 'state', 'what', 'why', 'how', 'give', 'explain',
                      'describe', 'define', 'mention', 'write', 'discuss',
                      'differentiate', 'compare', 'with reference', 'account for')
            if not any(tl.startswith(s) for s in starts):
                continue  # looks like glossary, skip

        # Skip if answer is still very short for non-MCQ
        if not ans_text or len(ans_text) < 5:
            continue

        q_type = classify_type(q_text)
        source_type, source_year = extract_source(source_tag)

        q_id_counter += 1
        q = {
            'id':             f'geo_{ch_id}_{q_id_counter:04d}',
            'chapter_id':     ch_id,
            'chapter_name':   ch_name,
            'subject':        'geography',
            'question':       q_text,
            'answer':         ans_text,
            'type':           q_type,
            'source_type':    source_type,
            'source_year':    source_year,
            'marks':          1 if q_type == 'mcq' else (2 if q_type == 'short_answer' else 4),
            'options':        None,
            'correct_option': None,
        }

        if q_type == 'mcq':
            opts = extract_mcq_options(q_text)
            correct = extract_correct_letter(ans_text)
            if opts:
                stripped = re.sub(r'\(\s*[abcd]\s*\).*', '', q_text,
                                   flags=re.IGNORECASE | re.DOTALL).strip()
                q['question'] = clean(stripped)
                q['options'] = opts
                q['correct_option'] = correct

        questions.append(q)
        ch_q_count += 1

    print(f'  → {ch_q_count} questions')

print(f'\nTotal: {len(questions)}')
types = Counter(q['type'] for q in questions)
print('By type:', dict(types))
print('By chapter:')
chs = Counter(q['chapter_id'] for q in questions)
for ch in sorted(chs):
    print(f'  Ch{ch} ({CHAPTER_MAP.get(ch,"?")}): {chs[ch]}')

with open(OUT_PATH, 'w', encoding='utf-8') as f:
    json.dump(questions, f, ensure_ascii=False, indent=2)
print(f'\nSaved → {OUT_PATH}')
