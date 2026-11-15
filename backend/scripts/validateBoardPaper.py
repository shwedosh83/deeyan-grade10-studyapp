#!/usr/bin/env python3
"""Validate extracted paper JSONs before copying into backend/data/board/.

Usage: python3 validateBoardPaper.py <dir-or-json ...>   (default: ./prelim_extract)
Checks: parse, required fields, unique labels, objective keys, marking_points sums,
        solutions present, section mark totals. Exit 1 if any file has an ERR.
"""
import json, sys, glob, os

args = [a for a in sys.argv[1:] if not a.startswith('-')]
DIR = args[0] if args else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'prelim_extract')
TYPES = {'mcq','assertion_reason','fill_blank','match','short','long','numerical','diagram','map_work'}
files = [DIR] if DIR.endswith('.json') else sorted(glob.glob(os.path.join(DIR, '*.json')))
fail = 0
for f in files:
    pid = os.path.basename(f)[:-5]
    errs, warns = [], []
    try:
        p = json.load(open(f))
    except Exception as e:
        print(f'{pid}: PARSE FAIL {e}'); fail += 1; continue
    for k in ('paper_id','subject','label','source','school','exam_label','max_marks','duration_minutes','sections','questions'):
        if k not in p or p[k] in (None, '', []): errs.append(f'missing {k}')
    if p.get('paper_id') != pid: errs.append(f'paper_id {p.get("paper_id")} != filename {pid}')
    if p.get('source') not in ('prelim', 'board', 'competency'): errs.append(f'bad source {p.get("source")}')
    qs = p.get('questions', [])
    labels = [q.get('q_label') for q in qs]
    if len(set(labels)) != len(labels): errs.append('duplicate q_labels: ' + str([l for l in labels if labels.count(l) > 1][:6]))
    orders = [q.get('q_order') for q in qs]
    if sorted(orders) != list(range(len(qs))): warns.append('q_order not 0..n-1 contiguous')
    nsol = nobj = napp = nfig = 0
    for q in qs:
        L = q.get('q_label')
        if not q.get('question', '').strip(): errs.append(f'{L}: empty question')
        if q.get('type') not in TYPES: warns.append(f'{L}: odd type {q.get("type")}')
        if q.get('mandatory') not in ('compulsory','choice'): errs.append(f'{L}: bad mandatory')
        m = q.get('marks')
        if not isinstance(m, (int,float)) or m <= 0: errs.append(f'{L}: bad marks {m}')
        if q.get('is_objective'):
            nobj += 1
            if not q.get('correct_option') and not q.get('answer_items'): errs.append(f'{L}: objective without key')
            if q.get('type') in ('mcq','assertion_reason'):
                if len(q.get('options') or {}) < 4: errs.append(f'{L}: mcq with <4 options')
                if q.get('correct_option') not in ('a','b','c','d'): errs.append(f'{L}: bad correct_option {q.get("correct_option")}')
        else:
            mp = q.get('marking_points') or []
            if not mp: errs.append(f'{L}: subjective without marking_points')
            else:
                s = sum(x.get('marks', 0) for x in mp)
                if abs(s - m) > 0.01: errs.append(f'{L}: marking_points sum {s} != marks {m}')
        if not (q.get('solution') or '').strip(): errs.append(f'{L}: no solution')
        else: nsol += 1
        if q.get('applied'): napp += 1
        if q.get('needs_figure'):
            nfig += 1
            if not q.get('page'): warns.append(f'{L}: needs_figure without page')
    # section sums
    secsum = {}
    for q in qs: secsum[q.get('section')] = secsum.get(q.get('section'), 0) + q.get('marks', 0)
    for s in p.get('sections', []):
        got = secsum.get(s['name'])
        if got is None:
            got = next((v for k, v in secsum.items() if k and (k.startswith(s['name']) or s['name'].startswith(k))), None)
        exp = s['total_marks'] if s.get('compulsory') else (None if not s.get('attempt_n') else s['total_marks'] / s['attempt_n'] * (s.get('out_of') or s['attempt_n']))
        if got is not None and exp and abs(got - exp) > 0.01: warns.append(f"{s['name']}: marks sum {got} vs expected {exp}")
    status = 'FAIL' if errs else 'ok'
    if errs: fail += 1
    print(f'{pid}: {status} | {len(qs)} q, {nobj} objective, {napp} applied, {nfig} figure, {nsol} solved')
    for e in errs[:12]: print('   ERR', e)
    for w in warns[:8]: print('   warn', w)
print('---'); sys.exit(1 if fail else 0)
