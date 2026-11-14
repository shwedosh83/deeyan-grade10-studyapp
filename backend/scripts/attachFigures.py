#!/usr/bin/env python3
"""
attachFigures.py

For every question flagged needs_figure, find the page of the ORIGINAL question paper (no solutions on it)
where the question starts, render that page to a JPEG, upload it to the public Supabase bucket `board-figures`,
and write the URL into backend/data/board/<paper_id>.json (field figure_url). Re-run uploadBoardPapers.js afterwards.

Usage: python3 attachFigures.py <paper_id>=<original.pdf> [<paper_id>=<original.pdf> ...]
   e.g. python3 attachFigures.py physics_2025=/path/Physics_2025.pdf chemistry_2023="/path/Chemistry - 2023 Board Paper.pdf"
Env: SUPABASE_URL, SUPABASE_SERVICE_KEY (loaded from backend/.env if present).
"""
import os, sys, re, json, urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'data', 'board')
BUCKET = 'board-figures'

def load_env():
    p = os.path.join(HERE, '..', '.env')
    if os.path.exists(p):
        for line in open(p):
            m = re.match(r'\s*([A-Z_]+)\s*=\s*(.*)\s*$', line)
            if m and m.group(1) not in os.environ:
                os.environ[m.group(1)] = m.group(2).strip().strip('"').strip("'")

def norm(t):
    return re.sub(r'[^a-z0-9]', '', (t or '').lower())

def req(method, path, body=None, headers=None):
    url = os.environ['SUPABASE_URL'].rstrip('/') + path
    h = {'apikey': os.environ['SUPABASE_SERVICE_KEY'], 'Authorization': 'Bearer ' + os.environ['SUPABASE_SERVICE_KEY']}
    h.update(headers or {})
    r = urllib.request.Request(url, data=body, method=method, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=120) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()

def ensure_bucket():
    code, body = req('POST', '/storage/v1/bucket', json.dumps({'id': BUCKET, 'name': BUCKET, 'public': True}).encode(), {'Content-Type': 'application/json'})
    if code not in (200, 201) and b'already exists' not in body and b'Duplicate' not in body:
        print('bucket:', code, body[:200])

def find_pages(doc, questions):
    """Return {q_label: page_index} using monotonic text matching against the original paper."""
    pages = [norm(doc[i].get_text()) for i in range(doc.page_count)]
    out, cur = {}, 0
    for q in sorted(questions, key=lambda x: x['q_order']):
        txt = norm(q['question'])
        probes = [txt[:45], txt[len(txt) // 2: len(txt) // 2 + 40], txt[-40:]]
        hit = None
        for pr in probes:
            if len(pr) < 15:
                continue
            for i in range(cur, len(pages)):
                if pr in pages[i]:
                    hit = i
                    break
            if hit is not None:
                break
        if hit is not None:
            cur = hit
            out[q['q_label']] = hit
        else:
            out[q['q_label']] = None
    return out

def main():
    load_env()
    import fitz
    ensure_bucket()
    for arg in sys.argv[1:]:
        pid, pdf = arg.split('=', 1)
        path = os.path.join(DATA, pid + '.json')
        paper = json.load(open(path))
        doc = fitz.open(pdf)
        figs = [q for q in paper['questions'] if q.get('needs_figure')]
        pagemap = find_pages(doc, paper['questions'])
        done, missed, uploaded = 0, [], {}
        for q in figs:
            pg = pagemap.get(q['q_label'])
            if pg is None:
                missed.append(q['q_label']); continue
            if pg not in uploaded:
                png = doc[pg].get_pixmap(dpi=110).tobytes('jpeg')
                name = f'{pid}/p{pg + 1}.jpg'
                code, body = req('POST', f'/storage/v1/object/{BUCKET}/{name}', png, {'Content-Type': 'image/jpeg', 'x-upsert': 'true'})
                if code not in (200, 201):
                    print('  upload failed', name, code, body[:150]); missed.append(q['q_label']); continue
                uploaded[pg] = os.environ['SUPABASE_URL'].rstrip('/') + f'/storage/v1/object/public/{BUCKET}/{name}'
            q['figure_url'] = uploaded[pg]; q['page'] = pg + 1; done += 1
        json.dump(paper, open(path, 'w'), ensure_ascii=False, indent=1)
        print(f'{pid}: {done}/{len(figs)} figure questions linked to {len(uploaded)} page images' + (f'; unmatched {missed}' if missed else ''))

if __name__ == '__main__':
    main()
