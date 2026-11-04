"""Convert the Deck Plus design-sheet PDFs (ReportLab, one page) into compact SVG
fragments + grid/field metadata for the 3D builder's plan export.

Usage: python3 -I sheet2svg.py <pdf> <key> >> out.json-lines
"""
import base64
import json
import re
import subprocess
import sys
import zlib

pdf, key = sys.argv[1], sys.argv[2]
d = open(pdf, 'rb').read()
W, H = [float(v) for v in re.search(rb'/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)', d).groups()]
i = d.find(b'stream\n') + 7
j = d.find(b'endstream', i)
raw = d[i:j].strip()
if raw.endswith(b'~>'):
    raw = raw[:-2]
t = zlib.decompress(base64.a85decode(raw)).decode('latin1')

FONTS = {'F1': ('Helvetica, Arial, sans-serif', 400), 'F2': ('Helvetica, Arial, sans-serif', 700)}
toks = re.findall(r'\((?:\\.|[^\\)])*\)|/[A-Za-z0-9]+|[-+]?\d*\.?\d+|[A-Za-z*\']+', t)
st, out, path, dots = [], [], [], []
fill, stroke, lw = '#000', '#000', 1.0
font, size, tz, tm, tc = 'F1', 12, 100, (0, 0), 0
hlines = []
fy = lambda y: round(H - y, 2)
col = lambda a: '#%02x%02x%02x' % tuple(round(float(v) * 255) for v in a)


def flush_path(op):
    global path
    if not path:
        return
    pts = [p for seg in path for p in seg[1:]]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    curves = sum(1 for s in path if s[0] == 'C')
    if op in ('f', 'f*') and curves == 4 and max(xs) - min(xs) < 4 and max(ys) - min(ys) < 4:
        dots.append(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, (max(xs) - min(xs)) / 2, fill))
        path = []
        return
    dstr = ''.join(s[0] + ' '.join('%.2f %.2f' % (x, fy(y)) for x, y in s[1:]) if s[0] != 'Z' else 'Z' for s in path)
    if op in ('f', 'f*'):
        out.append('<path d="%s" fill="%s"%s/>' % (dstr, fill, ' fill-rule="evenodd"' if op == 'f*' else ''))
    elif op == 'S':
        if len(path) == 2 and path[0][0] == 'M' and path[1][0] == 'L' and abs(path[0][1][1] - path[1][1][1]) < 0.01:
            hlines.append((round(path[0][1][0], 1), round(path[1][1][0], 1), fy(path[0][1][1])))
        out.append('<path d="%s" fill="none" stroke="%s" stroke-width="%s"/>' % (dstr, stroke, lw))
    path = []


for tok in toks:
    if tok[0] == '(' or tok[0] == '/' or re.match(r'^[-+]?\d*\.?\d+$', tok):
        st.append(tok)
        continue
    a = st
    if tok == 'm':
        path.append(('M', (float(a[-2]), float(a[-1]))))
    elif tok == 'l':
        path.append(('L', (float(a[-2]), float(a[-1]))))
    elif tok == 'c':
        v = [float(x) for x in a[-6:]]
        path.append(('C', (v[0], v[1]), (v[2], v[3]), (v[4], v[5])))
    elif tok == 'h':
        path.append(('Z',))
    elif tok == 're':
        x, y, w, h = [float(v) for v in a[-4:]]
        path += [('M', (x, y)), ('L', (x + w, y)), ('L', (x + w, y + h)), ('L', (x, y + h)), ('Z',)]
    elif tok in ('S', 'f', 'f*'):
        flush_path(tok)
    elif tok == 'n':
        path = []
    elif tok == 'rg':
        fill = col(a[-3:])
    elif tok == 'RG':
        stroke = col(a[-3:])
    elif tok == 'w':
        lw = float(a[-1])
    elif tok == 'Tf':
        font, size = a[-2][1:], float(a[-1])
    elif tok == 'Tc':
        tc = float(a[-1])
    elif tok == 'Tz':
        tz = float(a[-1])
    elif tok == 'Tm':
        tm = (float(a[-2]), float(a[-1]))
    elif tok == 'Tj':
        s = a[-1][1:-1].replace('\\(', '(').replace('\\)', ')').replace('\\\\', '\\')
        fam, wt = FONTS.get(font, FONTS['F1'])
        esc = s.replace('&', '&amp;').replace('<', '&lt;')
        x, y = tm
        tr = '' if tz == 100 else ' transform="translate(%.2f %.2f) scale(%.3f 1) translate(%.2f %.2f)"' % (x, fy(y), tz / 100, -x, -fy(y))
        ls = ' letter-spacing="%s"' % tc if tc else ''
        out.append('<text x="%.2f" y="%.2f" font-family="%s" font-weight="%d" font-size="%s" fill="%s"%s%s>%s</text>' % (x, fy(y), fam, wt, size, fill, ls, tr, esc))
    st = []

# Dot grid
xs = sorted({round(x, 1) for x, y, r, c in dots})
ys = sorted({round(fy(y), 1) for x, y, r, c in dots})
step = round((xs[-1] - xs[0]) / (len(xs) - 1), 3)
r0, c0 = round(dots[0][2], 2), dots[0][3]
dot_svg = '<g fill="%s">' % c0 + ''.join('<circle cx="%.1f" cy="%.1f" r="%s"/>' % (x, fy(y), r0) for x, y, r, c in dots) + '</g>'

# Field positions from the PDF's own text boxes (top-left origin, points)
bbox = subprocess.run(['pdftotext', '-bbox', pdf, '-'], capture_output=True, text=True).stdout
words = [(float(m[0]), float(m[1]), float(m[2]), float(m[3]), m[4]) for m in re.findall(r'xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<', bbox)]
title_x = min(w[0] for w in words if w[4] == 'Address:')


def after(label, nth=0):
    hits = [w for w in words if w[4] == label and w[0] >= title_x - 1]
    w = hits[nth]
    return [round(w[2] + 4, 1), round(w[3] - 1.2, 1)]


fields = {
    'client': after('Name:'), 'address': after('Address:'), 'city': after('City:'), 'state': after('State:'),
    'zip': after('Code:'), 'phone': after('Phone#:'), 'email': after('Email:'), 'contract': after('Contract#:'),
    'date': after('Date:'), 'builder': after('Builder:'), 'customer1': after('Customer:', 0), 'customer2': after('Customer:', 1),
}
notes = [w for w in words if w[4] == 'Notes:'][0]
builder_y = [w for w in words if w[4] == 'Builder:'][0][1]
right = max(w[2] for w in words if w[0] >= title_x)
note_lines = sorted(y for x0, x1, y in hlines if abs(x0 - title_x) < 3 and notes[3] < y < builder_y - 4)
fields['notes'] = {'x': title_x, 'lines': note_lines, 'right': round(right, 1)}
scale = [w for w in words if w[4] == 'Scale:'][0]
scale_words = [w for w in words if abs(w[1] - scale[1]) < 1 and scale[0] <= w[0] < scale[0] + 110]
fields['scale'] = {'x': scale[0], 'y': round(scale[3] - 1, 1), 'x1': round(max(w[2] for w in scale_words) + 2, 1), 'top': round(scale[1] - 1, 1)}

meta = {
    'key': key, 'w': W, 'h': H, 'label': '%g×%g' % (W / 72, H / 72),
    'grid': {'x0': xs[0], 'y0': ys[0], 'step': step, 'cols': len(xs), 'rows': len(ys)},
    'fields': fields,
    'svg': ''.join(out) + dot_svg,
}
print(json.dumps(meta))
