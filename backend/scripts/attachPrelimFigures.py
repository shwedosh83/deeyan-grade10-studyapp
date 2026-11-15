#!/usr/bin/env python3
"""
attachPrelimFigures.py

Prelim papers are mostly scans, so attachFigures.py's text matching cannot find pages.
The prelim extraction already records `page` (1-based, in the source PDF) on every
needs_figure question: render that page, upload it to the public `board-figures`
bucket under prelim/<paper_id>/pN.jpg, and write figure_url into the JSON.
Re-run uploadBoardPapers.js afterwards.

Usage: python3 attachPrelimFigures.py <paper_id>=<source.pdf> [...]
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

def main():
    load_env()
    import fitz
    for arg in sys.argv[1:]:
        pid, pdf = arg.split('=', 1)
        path = os.path.join(DATA, pid + '.json')
        paper = json.load(open(path))
        doc = fitz.open(pdf)
        figs = [q for q in paper['questions'] if q.get('needs_figure')]
        done, missed, uploaded = 0, [], {}
        for q in figs:
            pg = q.get('page')
            if not pg or pg < 1 or pg > doc.page_count:
                missed.append(q['q_label']); continue
            i = pg - 1
            if i not in uploaded:
                jpg = doc[i].get_pixmap(dpi=110).tobytes('jpeg')
                name = f'prelim/{pid}/p{pg}.jpg'
                code, body = req('POST', f'/storage/v1/object/{BUCKET}/{name}', jpg, {'Content-Type': 'image/jpeg', 'x-upsert': 'true'})
                if code not in (200, 201):
                    print('  upload failed', name, code, body[:150]); missed.append(q['q_label']); continue
                uploaded[i] = os.environ['SUPABASE_URL'].rstrip('/') + f'/storage/v1/object/public/{BUCKET}/{name}'
            q['figure_url'] = uploaded[i]; done += 1
        json.dump(paper, open(path, 'w'), ensure_ascii=False, indent=1)
        print(f'{pid}: {done}/{len(figs)} figure questions linked to {len(uploaded)} page images' + (f'; missed {missed}' if missed else ''))

if __name__ == '__main__':
    main()
