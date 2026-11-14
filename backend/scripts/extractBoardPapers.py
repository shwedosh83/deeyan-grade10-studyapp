#!/usr/bin/env python3
"""
extractBoardPapers.py

Turn ICSE board papers (with printed solutions) into app-ready JSON:
full question text, MCQ options, correct option, official solution, marking points,
marks, compulsory/choice, chapter, applied/difficulty tags, and a figure flag.

Input : a folder of plain-text files, one per paper, named
          <Subject>_-_<year>[S1|S2].txt        e.g. Physics_-_2024.txt, Biology_-_2022S1.txt
        Page breaks must be marked  =====PAGE n=====  (see to_text() below, which builds them from PDFs).
Output: backend/data/board/<paper_id>.json     e.g. physics_2024.json, biology_2022s1.json

Usage:
  python3 extractBoardPapers.py --pdf  <paper.pdf> --subject Physics --year 2024      # one PDF -> txt
  python3 extractBoardPapers.py --txt-dir <dir> [--only Physics_-_2024]               # txt -> json (needs ANTHROPIC_API_KEY)
  python3 extractBoardPapers.py --txt-dir <dir> --dry-run                             # print what would run, no API calls

Cost note: one API call per paper (~25k input / ~15k output tokens). 35 papers is roughly $10-15 on Sonnet.
"""
import os, sys, re, json, time, argparse, urllib.request, concurrent.futures as cf

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, '..', 'data', 'board')
MODEL = os.environ.get('BOARD_EXTRACT_MODEL', 'claude-sonnet-5-5')

SUBJECT_IDS = {
    'Biology': 'biology', 'Chemistry': 'chemistry', 'Physics': 'physics', 'Geography': 'geography',
    'History_and_Civics': 'history_civics', 'History & Civics': 'history_civics',
    'Computer_Applications': 'computer_applications', 'Mathematics': 'mathematics',
    'English_Language': 'english_language', 'Literature_in_English': 'english_literature', 'Hindi': 'hindi',
}

CHAPTERS = {
    'biology': ['Cell Cycle and Structure of Chromosomes','Genetics','Absorption by Roots','Transpiration','Photosynthesis','Chemical Coordination in Plants','The Circulatory System','The Excretory System','Nervous System and Sense Organs','The Endocrine System','The Reproductive System','Human Population','Human Evolution','Pollution','The Cell'],
    'chemistry': ['Periodic Properties and Variations','Chemical Bonding','Study of Acids, Bases and Salts','Analytical Chemistry','Mole Concept and Stoichiometry','Electrolysis','Metallurgy','Hydrogen Chloride','Ammonia','Nitric Acid','Sulphuric Acid','Organic Chemistry'],
    'physics': ['Force: Turning Forces and Uniform Circular Motion','Work, Power and Energy','Mechanics (Machines, Gravitation)','Light (Refraction, Lenses, Spectrum)','Sound','Electricity and Magnetism','Heat (Calorimetry)','Modern Physics (Radioactivity)'],
    'geography': ['Interpretation of Topographical Maps','Location, Extent and Physical Features','Climate','Soil Resources','Natural Vegetation','Water Resources','Mineral Resources','Energy Resources','Agriculture','Manufacturing Industries','Transport','Waste Management','Map of India (outline map work)'],
    'history_civics': ['The First War of Independence 1857','Growth of Nationalism','First Phase of Indian National Movement','Second Phase of Indian National Movement','Gandhian Era and Struggle for Independence','Forward Bloc and The INA','Independence and Partition of India','The First World War','Rise of Dictatorships','The Second World War','The United Nations','Non Aligned Movement','The Union Legislature','President and Vice President','Prime Minister and Council of Ministers','The Supreme Court','High Court and Subordinate Courts'],
    'computer_applications': ['Revision of Class IX (Java basics, operators, loops)','Class as the Basis of All Computations','User Defined Methods','Constructors','Library Classes (wrapper classes, Math etc.)','Encapsulation (scope, access)','Arrays','String Handling','Input/Output & Programs (mixed)'],
}

PROMPT = """You are converting an ICSE Class 10 {subject} board paper ({year}{semnote}) WITH its printed solutions into clean structured data for a practice app.

Return ONLY valid JSON, no prose and no markdown fence:
{{
 "max_marks": number, "duration_minutes": number, "reading_minutes": number,
 "instructions": "cover-page rules about compulsory/choice sections, 1-3 sentences",
 "sections": [{{"name":"Section A","total_marks":40,"rule":"Attempt all questions","compulsory":true,"attempt_n":null,"out_of":null}}],
 "questions": [
  {{
   "q": "label like 1(iii) or 5(a)(ii)",
   "section": "section name matching sections[]",
   "type": "mcq | assertion_reason | match | fill_blank | short | long | numerical | program | output_trace | map_work | diagram | comprehension | other",
   "marks": number,
   "mandatory": "compulsory | choice",
   "choice_note": null or "any 4 of 6 questions in Section B" / "one of two alternatives (OR)",
   "chapter": "ONE value from the chapter list or 'Other'",
   "topic": "3-6 word topic",
   "question": "the FULL question text exactly as a student must read it (include data, tables as plain text, case/passage text, statements, sub-parts). Do NOT include the answer or solution.",
   "options": {{"a":"...","b":"...","c":"...","d":"..."}} for mcq / assertion_reason (always include the four options; for assertion_reason use the standard four options as printed) ; {{}} otherwise,
   "correct_option": "a|b|c|d for mcq/assertion_reason, else null",
   "answer_items": for fill_blank, match-the-column, name-the-term / give-the-biological-term / one-word-answer questions whose every part has a short fixed answer: [{{"prompt":"the blank or item to answer, e.g. 'Part (iii): ______ is the hormone from the pancreas' or 'A matches with'","accepted":["the official answer","other equally correct wordings"]}}] , one entry per mark-bearing item; otherwise null,
   "solution": "the official answer as printed (full text for short/long answers; for numericals the key working and final answer; for programs the printed program or a faithful summary; for MCQ the letter and option text)",
   "marking_points": [{{"point":"one thing the examiner credits, stated precisely","marks":1}}],
   "needs_figure": true if the question cannot be answered without a diagram, graph, map, picture or toposheet that is not reproducible as text,
   "figure_desc": "if needs_figure: what the figure shows, as far as the text lets you tell, else null",
   "page": page number from the =====PAGE n===== markers where the question starts,
   "bloom": "recall | understand | apply",
   "applied": true if it cannot be answered by reproducing a textbook line (case/real-life scenario, data/graph/diagram interpretation, numerical, program writing/tracing, map work, multi-step reasoning, assertion-reason),
   "applied_kind": "case | numerical | data_diagram | reasoning | program | map | assertion_reason | null",
   "difficulty": 1-5 for a good Class 10 student,
   "concepts": ["1-3 specific textbook concepts tested"]
  }}
 ]
}}

Rules:
- One row per gradable item at the finest level that has its own printed marks (each MCQ (i)..(xv) at 1 mark, each sub-part (a)(b)(c) with its marks). If only a whole-question mark is printed for a multi-part question, emit one row with all parts in "question".
- Internal choice (a) ... OR (b): emit BOTH alternatives as separate rows, mandatory="choice", with choice_note.
- 'Attempt any N of M questions' sections: mandatory="choice" with choice_note; 'Attempt all' sections: "compulsory".
- marking_points: for subjective answers, split the solution into the points an examiner awards (each with marks, summing exactly to the question's marks). For mcq/assertion_reason leave [].
- If the paper text has no solution for a question, set solution null and marking_points [] (do not invent).
- Strip page headers/footers, copyright lines and any website advertising.
- Marks must be numbers. Never invent questions.
Chapter list for {subject}: {chapters}

===== PAPER TEXT (questions followed by or interleaved with solutions) =====
{text}
"""


def to_text(pdf_path):
    """PDF -> text with =====PAGE n===== markers (needs PyMuPDF)."""
    import fitz
    d = fitz.open(pdf_path)
    return '\n'.join(f'\n=====PAGE {i+1}=====\n' + d[i].get_text() for i in range(d.page_count))


def paper_meta(base):
    m = re.match(r'(.+?)_-_(\d{4})(S[12])?$', base)
    if not m:
        raise ValueError(f'bad file name {base}')
    subj_raw, year, sem = m.groups()
    sid = SUBJECT_IDS.get(subj_raw) or SUBJECT_IDS.get(subj_raw.replace('_', ' '))
    if not sid:
        raise ValueError(f'unknown subject {subj_raw}')
    semn = int(sem[1]) if sem else None
    pid = f"{sid}_{year}{('s' + str(semn)) if semn else ''}"
    label = year + (f' Sem {semn}' if semn else '')
    return dict(subject=sid, subject_name=subj_raw.replace('_and_', ' & ').replace('_', ' '), year=int(year), sem=semn, paper_id=pid, label=label)


def call_api(prompt, max_tokens=32000):
    key = os.environ['ANTHROPIC_API_KEY']
    body = json.dumps({'model': MODEL, 'max_tokens': max_tokens, 'messages': [{'role': 'user', 'content': prompt}]}).encode()
    req = urllib.request.Request('https://api.anthropic.com/v1/messages', data=body, headers={
        'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json'})
    with urllib.request.urlopen(req, timeout=1500) as r:
        d = json.loads(r.read())
    return ''.join(b.get('text', '') for b in d['content']), d.get('stop_reason')


def clean_label(q):
    return re.sub(r'\s+', '', str(q))


def normalize(meta, raw):
    """Model output -> app JSON (the shape uploadBoardPapers.js expects). Also repairs common issues."""
    qs, seen = [], set()
    for i, q in enumerate(raw.get('questions', [])):
        label = clean_label(q.get('q', f'?{i}'))
        if label in seen:
            label = f'{label}#{i}'
        seen.add(label)
        qtype = q.get('type') or 'other'
        opts = q.get('options') or {}
        opts = {k.lower(): v for k, v in opts.items()} if isinstance(opts, dict) else {}
        corr = (q.get('correct_option') or '').strip().lower()[:1] or None
        if corr and corr not in opts:
            corr = None
        items = q.get('answer_items') or []
        items = [it for it in items if isinstance(it, dict) and it.get('prompt') and it.get('accepted')] if isinstance(items, list) else []
        is_obj = (len(opts) >= 2 and corr is not None) or bool(items)   # any question with printed options + a key is auto-markable, whatever its type label
        if is_obj and not items and qtype not in ('mcq', 'assertion_reason'):
            qtype = 'mcq'
        marks = float(q.get('marks') or 0)
        mp = q.get('marking_points') or []
        if mp and not is_obj:
            tot = sum(float(p.get('marks', 0)) for p in mp)
            if marks and abs(tot - marks) > 0.01 and tot > 0:      # rescale rubric so it sums to the printed marks
                for p in mp:
                    p['marks'] = round(float(p['marks']) * marks / tot, 2)
        main = re.match(r'(\d+)', label)
        qs.append(dict(
            q_label=label, q_order=i, q_main=int(main.group(1)) if main else None, section=q.get('section'),
            type=qtype, marks=marks, mandatory=q.get('mandatory') if q.get('mandatory') in ('compulsory', 'choice') else 'compulsory',
            choice_note=q.get('choice_note'), chapter=q.get('chapter'), topic=q.get('topic'),
            bloom=q.get('bloom'), applied=bool(q.get('applied')), applied_kind=q.get('applied_kind'),
            difficulty=q.get('difficulty'), concepts=q.get('concepts') or [],
            question=(q.get('question') or q.get('text') or '').strip(), options=opts, is_objective=is_obj, correct_option=corr, answer_items=items or None,
            solution=(q.get('solution') or q.get('answer')) or None, marking_points=mp if not is_obj else [],
            needs_figure=bool(q.get('needs_figure')), figure_desc=q.get('figure_desc'), page=q.get('page'),
        ))
    has_sol = sum(1 for q in qs if q['solution']) >= 0.6 * max(len(qs), 1)
    return dict(
        paper_id=meta['paper_id'], subject=meta['subject'], year=meta['year'], sem=meta['sem'], label=meta['label'],
        max_marks=raw.get('max_marks'), duration_minutes=raw.get('duration_minutes') or (60 if meta['sem'] else 120),
        reading_minutes=raw.get('reading_minutes') or (0 if meta['sem'] else 15), instructions=raw.get('instructions'),
        sections=raw.get('sections', []), has_solutions=has_sol, questions=qs)


def validate(paper):
    """Warnings about things a human should look at."""
    w = []
    qs = paper['questions']
    comp = sum(q['marks'] for q in qs if q['mandatory'] == 'compulsory')
    for s in paper['sections']:
        if s.get('compulsory') and s.get('total_marks'):
            sec = sum(q['marks'] for q in qs if q['section'] == s['name'])
            if abs(sec - s['total_marks']) > 0.5:
                w.append(f"{s['name']}: extracted marks {sec} != printed {s['total_marks']}")
    if not qs:
        w.append('no questions')
    nosol = [q['q_label'] for q in qs if not q['solution']]
    if nosol:
        w.append(f'{len(nosol)} questions without solution: {nosol[:8]}')
    bad_mcq = [q['q_label'] for q in qs if q['type'] in ('mcq', 'assertion_reason') and not q['is_objective']]
    if bad_mcq:
        w.append(f'MCQ rows missing options/correct option: {bad_mcq[:8]}')
    return w


def process(path, force=False):
    base = os.path.basename(path)[:-4]
    meta = paper_meta(base)
    out = os.path.join(OUT_DIR, meta['paper_id'] + '.json')
    if os.path.exists(out) and not force:
        return base, 'cached', []
    text = open(path).read()
    semnote = f", Semester {meta['sem']} of the split 2022 exam" if meta['sem'] else ''
    prompt = PROMPT.format(subject=meta['subject_name'], year=meta['year'], semnote=semnote,
                           chapters=json.dumps(CHAPTERS.get(meta['subject'], ['(choose a short sensible topic area)'])), text=text)
    err = ''
    for _ in range(3):
        try:
            txt, stop = call_api(prompt)
            raw = json.loads(re.search(r'\{.*\}', txt, re.S).group(0))
            paper = normalize(meta, raw)
            os.makedirs(OUT_DIR, exist_ok=True)
            json.dump(paper, open(out, 'w'), ensure_ascii=False, indent=1)
            return base, f"ok q={len(paper['questions'])} stop={stop}", validate(paper)
        except Exception as e:
            err = str(e)[:200]
            time.sleep(4)
    return base, 'FAILED ' + err, []


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--pdf'); ap.add_argument('--subject'); ap.add_argument('--year')
    ap.add_argument('--txt-dir'); ap.add_argument('--only', nargs='*'); ap.add_argument('--force', action='store_true')
    ap.add_argument('--dry-run', action='store_true'); ap.add_argument('--workers', type=int, default=5)
    a = ap.parse_args()
    if a.pdf:
        name = f"{a.subject.replace(' ', '_')}_-_{a.year}.txt"
        dest = os.path.join(a.txt_dir or '.', name)
        open(dest, 'w').write(to_text(a.pdf)); print('wrote', dest); sys.exit(0)
    files = sorted(f for f in os.listdir(a.txt_dir) if f.endswith('.txt'))
    if a.only:
        files = [f for f in files if any(o in f for o in a.only)]
    files = [os.path.join(a.txt_dir, f) for f in files]
    if a.dry_run:
        for f in files:
            m = paper_meta(os.path.basename(f)[:-4]); print(m['paper_id'], f)
        sys.exit(0)
    with cf.ThreadPoolExecutor(a.workers) as ex:
        for base, msg, warns in ex.map(lambda f: process(f, a.force), files):
            print(base, msg)
            for w in warns:
                print('   WARN', w)
