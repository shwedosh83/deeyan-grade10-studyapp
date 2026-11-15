#!/usr/bin/env python3
"""
dropPrelimToposheet.py

School prelim Geography PDFs do not include the Survey of India toposheet extract, so their Q1
(map reading) cannot be attempted or marked. This removes the Q1 rows from a prelim geography
paper JSON, reduces Part I and the paper total by those marks, and notes it in the instructions.
The untouched file is first copied to <dir>/_with_topo/ so the change can be reversed if the
toposheet is ever supplied.

Usage: python3 dropPrelimToposheet.py <paper.json> [...]
"""
import json, os, shutil, sys

NOTE = ' Q1 (toposheet map reading) is omitted: the school paper was shared without its Survey of India map extract.'

for path in sys.argv[1:]:
    p = json.load(open(path))
    if p.get('source') != 'prelim' or p.get('subject') != 'geography':
        print(f'{path}: skipped (not a prelim geography paper)'); continue
    q1 = [q for q in p['questions'] if q.get('q_main') == 1]
    if not q1:
        print(f'{p["paper_id"]}: no Q1 rows (already dropped)'); continue
    bak = os.environ.get('TOPO_BACKUP_DIR') or os.path.join(os.path.dirname(path), '_with_topo')
    os.makedirs(bak, exist_ok=True)
    shutil.copy2(path, os.path.join(bak, os.path.basename(path)))
    drop = sum(q['marks'] for q in q1)
    sec = q1[0].get('section')
    p['questions'] = [q for q in p['questions'] if q.get('q_main') != 1]
    for i, q in enumerate(p['questions']):
        q['q_order'] = i
    for s in p.get('sections', []):
        if sec and s['name'] == sec:
            s['total_marks'] = s['total_marks'] - drop
    p['max_marks'] = p['max_marks'] - drop
    if NOTE.strip() not in (p.get('instructions') or ''):
        p['instructions'] = (p.get('instructions') or '').rstrip() + NOTE
    json.dump(p, open(path, 'w'), ensure_ascii=False, indent=1)
    print(f'{p["paper_id"]}: dropped {len(q1)} Q1 rows ({drop:g} marks); max_marks now {p["max_marks"]}')
