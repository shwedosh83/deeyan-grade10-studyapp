#!/usr/bin/env python3
"""Parse Biology 10th.pdf - two-column layout aware."""

import pdfplumber, re, json

PDF_PATH = '/Users/shwetadoshi/Downloads/Biology 10th.pdf'
OUTPUT_PATH = '/tmp/bio_pdf_questions.json'

CHAPTERS = [
    (21,  62,  1,  "Cell Cycle and Structure of Chromosomes"),
    (63,  86,  2,  "Genetics"),
    (87,  134, 3,  "Absorption by Roots"),
    (135, 174, 4,  "Transpiration"),
    (175, 212, 5,  "Photosynthesis"),
    (213, 230, 6,  "Chemical Coordination in Plants"),
    (231, 280, 7,  "The Circulatory System"),
    (281, 304, 8,  "The Excretory System"),
    (305, 348, 9,  "Nervous System and Sense Organs"),
    (349, 374, 10, "The Endocrine System"),
    (375, 412, 11, "The Reproductive System"),
    (413, 434, 12, "Human Population"),
    (435, 448, 13, "Human Evolution"),
    (449, 474, 14, "Pollution"),
]

ANS_RE = re.compile(r'A[\x01\s]*ns\s+(MaIN|COMP|SQP)\s+(\d{4})', re.IGNORECASE)
CORRECT_OPT_RE = re.compile(r'Thus\s+\(([a-d])\)\s+is\s+correct\s+option', re.IGNORECASE)
DIAGRAM_RE = re.compile(
    r'(given figure|diagram given|figure given|study the figure|study the diagram|'
    r'following diagram|following figure|draw a neat|draw a labelled|labelled diagram|'
    r'identify the parts|name the parts|the above figure|figure shows|diagram shows|'
    r'given below is a diagram|the given diagram|the given figure)',
    re.IGNORECASE)
JUNK_RE = re.compile(
    r'(Downloaded From|www\.mcqgpt\.com|NODIA AND COMPANY|Purchase paperback|'
    r'Click any subject|Click Any Subject|DON\'T WASTE|ICSE\s+ChAptErwISE|'
    r'PagE\s+\d+\s+ICSE|^\s*Ch\s+\d+\s*:)',
    re.IGNORECASE | re.MULTILINE)
GARBAGE_Q = re.compile(r'(UUTIIUE|COI\s*E|EQUESTION|TEEEER|IIEER)', re.IGNORECASE)
BLEED_RE = re.compile(r'\s+\d{2,3}\.\s+[A-Za-z]')

def extract_columns(page):
    try:
        words = page.extract_words(keep_blank_chars=False, x_tolerance=3, y_tolerance=3)
    except Exception:
        return '', ''
    if not words:
        return '', ''
    mid = page.width / 2
    left_words = [w for w in words if w['x0'] < mid - 10]
    right_words = [w for w in words if w['x0'] >= mid - 10]

    def words_to_text(wl):
        if not wl:
            return ''
        wl = sorted(wl, key=lambda w: (round(w['top'] / 5) * 5, w['x0']))
        lines, cur_line, cur_y = [], [], None
        for w in wl:
            y = round(w['top'] / 5) * 5
            if cur_y is None: cur_y = y
            if abs(y - cur_y) > 8:
                if cur_line: lines.append(' '.join(cur_line))
                cur_line, cur_y = [w['text']], y
            else:
                cur_line.append(w['text'])
        if cur_line: lines.append(' '.join(cur_line))
        return '\n'.join(lines)

    return words_to_text(left_words), words_to_text(right_words)

def clean_col(text):
    lines = [l for l in text.split('\n') if not JUNK_RE.search(l)]
    return '\n'.join(lines).strip()

def extract_chapter_text(pdf, start_page, end_page):
    parts = []
    for i in range(start_page - 1, min(end_page, len(pdf.pages))):
        left, right = extract_columns(pdf.pages[i])
        parts.append(clean_col(left) + '\n\n' + clean_col(right))
    return '\n\n'.join(parts)

def parse_options(text):
    options = {}
    for m in re.finditer(r'\(([a-d])\)\s+(.*?)(?=\s*\([a-d]\)\s|\Z)', text, re.IGNORECASE | re.DOTALL):
        key = m.group(1).lower()
        val = re.sub(r'\s+', ' ', m.group(2)).strip()
        if val and len(val) < 500:
            options[key] = val
    return options

def find_blocks(text):
    matches = list(re.finditer(r'(?:^|\n)(\d{1,3})\.\s+([A-Z("\'The])', text, re.MULTILINE))
    blocks = []
    for i, m in enumerate(matches):
        num = int(m.group(1))
        end = matches[i+1].start() if i+1 < len(matches) else len(text)
        block = text[m.start():end].strip()
        block = re.sub(r'^\n', '', block)
        block = re.sub(r'^\d{1,3}\.\s+', '', block)
        blocks.append((num, block))
    return blocks

def clean_sa_answer(ans):
    """Remove bleeding next-question content from SA answer."""
    # Truncate at "123. Next question"
    m = BLEED_RE.search(ans)
    if m:
        ans = ans[:m.start()].strip()
    # Truncate at embedded "A ns" markers
    m2 = ANS_RE.search(ans)
    if m2:
        ans = ans[:m2.start()].strip()
    return re.sub(r'\s+', ' ', ans).strip()

def parse_questions(chapter_text, chapter_id, chapter_name):
    questions = []
    seen = set()
    blocks = find_blocks(chapter_text)

    for q_num, content in blocks:
        if len(content) < 15:
            continue
        if DIAGRAM_RE.search(content[:400]):
            continue

        # Skip if question text is garbage header
        first_line = content.split('\n')[0]
        if GARBAGE_Q.search(first_line):
            # Try salvaging by skipping the garbage prefix
            m = re.search(r'\n(\d{1,3}\.\s+[A-Z])', content)
            if not m:
                continue
            # There's an embedded real question; skip (it'll be picked up separately)
            continue

        has_options = bool(re.search(r'\(a\).*\(b\)', content, re.IGNORECASE | re.DOTALL))
        ans_match = ANS_RE.search(content)
        if not ans_match:
            continue

        year_tag = f"{ans_match.group(1).upper()} {ans_match.group(2)}"
        ans_pos = ans_match.start()
        question_part = content[:ans_pos].strip()
        answer_part = content[ans_match.end():].strip()

        if has_options:
            opt_m = re.search(r'(?:^|\n)\(a\)', question_part, re.IGNORECASE)
            if opt_m:
                q_text = question_part[:opt_m.start()].strip()
                opts_text = question_part[opt_m.start():]
            else:
                opt_m2 = re.search(r'(?:^|\n)\(a\)', content, re.IGNORECASE)
                if not opt_m2: continue
                q_text = content[:opt_m2.start()].strip()
                opts_text = content[opt_m2.start():ans_pos]

            q_text = re.sub(r'\s+', ' ', q_text).strip()
            if len(q_text) < 10: continue
            if not (q_text[0].isupper() or q_text[0].isdigit() or q_text[0] in '"('): continue
            if GARBAGE_Q.search(q_text): continue

            q_key = q_text.lower()[:60]
            if q_key in seen: continue
            seen.add(q_key)

            options = parse_options(opts_text)
            if len(options) < 2: continue

            correct_m = CORRECT_OPT_RE.search(answer_part) or CORRECT_OPT_RE.search(content)
            if not correct_m: continue
            correct = correct_m.group(1).lower()
            if correct not in options: continue

            thus_pos = CORRECT_OPT_RE.search(answer_part)
            expl = answer_part[:thus_pos.start()].strip() if thus_pos else answer_part.strip()
            expl = re.sub(r'\s+', ' ', expl)[:800].strip()

            questions.append({
                "id": f"pdf_ch{chapter_id}_{q_num}",
                "type": "MCQ",
                "question": q_text,
                "options": {k: options[k] for k in ['a','b','c','d'] if k in options},
                "correctAnswer": correct,
                "explanation": expl,
                "skill": chapter_name,
                "chapter_id": chapter_id,
                "chapter_name": chapter_name,
                "year_tag": year_tag,
                "source": "pdf"
            })

        else:
            q_text = re.sub(r'\s+', ' ', question_part).strip()
            if len(q_text) < 20: continue
            if not (q_text[0].isupper() or q_text[0].isdigit()): continue
            if GARBAGE_Q.search(q_text): continue
            if DIAGRAM_RE.search(answer_part[:300]): continue

            q_key = q_text.lower()[:60]
            if q_key in seen: continue
            seen.add(q_key)

            answer = clean_sa_answer(answer_part)
            if len(answer) < 5: continue
            if len(answer) > 1200: answer = answer[:1200] + '...'

            questions.append({
                "id": f"pdf_ch{chapter_id}_{q_num}",
                "type": "ShortAnswer",
                "question": q_text,
                "correctAnswer": answer,
                "skill": chapter_name,
                "chapter_id": chapter_id,
                "chapter_name": chapter_name,
                "year_tag": year_tag,
                "source": "pdf"
            })

    return questions

def main():
    all_questions = []
    print("Opening PDF...")
    with pdfplumber.open(PDF_PATH) as pdf:
        print(f"Pages: {len(pdf.pages)}")
        for start, end, ch_id, ch_name in CHAPTERS:
            print(f"  Ch {ch_id}: {ch_name} (pp {start}-{end})...", end=' ', flush=True)
            text = extract_chapter_text(pdf, start, end)
            questions = parse_questions(text, ch_id, ch_name)
            mcq = sum(1 for q in questions if q['type'] == 'MCQ')
            sa = sum(1 for q in questions if q['type'] == 'ShortAnswer')
            print(f"{len(questions)} ({mcq} MCQ, {sa} SA)")
            all_questions.extend(questions)

    print(f"\nTotal: {len(all_questions)}")
    seen = set()
    unique = [q for q in all_questions if (k := q['question'].lower()[:80]) not in seen and not seen.add(k)]
    print(f"After dedup: {len(unique)}")
    mcqs = sum(1 for q in unique if q['type']=='MCQ')
    sas = sum(1 for q in unique if q['type']=='ShortAnswer')
    print(f"MCQ: {mcqs}, ShortAnswer: {sas}")

    with open(OUTPUT_PATH, 'w') as f:
        json.dump(unique, f, indent=2)
    print(f"Saved to {OUTPUT_PATH}")

    # Print samples
    mu = [q for q in unique if q['type']=='MCQ']
    su = [q for q in unique if q['type']=='ShortAnswer']
    if mu:
        q = mu[2]
        print(f"\nSample MCQ: {q['question'][:80]}")
        print(f"  ({q['correctAnswer']}) {q['options'].get(q['correctAnswer'],'')[:60]}")
    if su:
        q = su[2]
        print(f"\nSample SA: {q['question'][:80]}")
        print(f"  A: {q['correctAnswer'][:120]}")

if __name__ == '__main__':
    main()
