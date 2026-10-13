"""Packs the boat art into game/boats.png, one request for all of it. Run from the project root:
    python -I game/assets/boats/make-sheet.py
The frame table lives in game/index.html (BOAT_SHEET); keep the two in step.

The hulls go in without their guns so the game can turn gun sprites on top. The destroyer has a
bare hull already; the patrol boat does not, so its baked-on guns are painted over with deck colour.
A damaged destroyer hull is made here too, by copying the scorch marks off the damaged picture.
Pure Python (zlib only), so it runs without Pillow."""
import os, struct, zlib

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'boats.png')

def read_png(path):
    d = open(path, 'rb').read()
    assert d[:8] == b'\x89PNG\r\n\x1a\n', path
    i, idat, w, h, ct = 8, b'', 0, 0, 0
    while i < len(d):
        n = struct.unpack('>I', d[i:i + 4])[0]; t = d[i + 4:i + 8]; c = d[i + 8:i + 8 + n]; i += 12 + n
        if t == b'IHDR':
            w, h, bd, ct = struct.unpack('>IIBB', c[:10]); assert bd == 8, path
        elif t == b'IDAT':
            idat += c
    bpp = {6: 4, 2: 3, 0: 1, 4: 2}[ct]
    raw = zlib.decompress(idat); stride = w * bpp; out = []; prev = bytearray(stride); p = 0
    for _ in range(h):
        f = raw[p]; line = bytearray(raw[p + 1:p + 1 + stride]); p += 1 + stride
        for x in range(stride):
            a = line[x - bpp] if x >= bpp else 0; b = prev[x]; c = prev[x - bpp] if x >= bpp else 0
            if f == 1: line[x] = (line[x] + a) & 255
            elif f == 2: line[x] = (line[x] + b) & 255
            elif f == 3: line[x] = (line[x] + (a + b) // 2) & 255
            elif f == 4:
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                line[x] = (line[x] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        out.append(line); prev = line
    # normalise to RGBA rows
    rows = []
    for line in out:
        if bpp == 4: rows.append(line)
        elif bpp == 3: rows.append(bytearray(b''.join(bytes(line[i:i + 3]) + b'\xff' for i in range(0, stride, 3))))
        elif bpp == 2: rows.append(bytearray(b''.join(bytes([line[i]] * 3) + bytes([line[i + 1]]) for i in range(0, stride, 2))))
        else: rows.append(bytearray(b''.join(bytes([v] * 3) + b'\xff' for v in line)))
    return w, h, rows

def write_png(path, w, h, rows):
    raw = b''.join(b'\x00' + bytes(r) for r in rows)
    def chunk(t, c): return struct.pack('>I', len(c)) + t + c + struct.pack('>I', zlib.crc32(t + c) & 0xffffffff)
    open(path, 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
                           + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))

def load(name): return read_png(os.path.join(HERE, name))
def px(rows, x, y): return rows[y][x * 4:x * 4 + 4]
def put(rows, x, y, v): rows[y][x * 4:x * 4 + 4] = v

def paint_over(img, x0, y0, x1, y1, colour):
    """Flatten a rectangle of a hull to one colour (only where it is opaque): erases a baked-on gun."""
    w, h, rows = img
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if rows[y][x * 4 + 3] > 0: put(rows, x, y, colour)

def damaged_hull(hull, full, damaged):
    """hull + the pixels the damaged picture changed, skipping the guns (which the hull lacks)."""
    w, h, hr = hull; _, _, fr = full; _, _, dr = damaged
    out = [bytearray(r) for r in hr]
    for y in range(h):
        for x in range(w):
            if px(dr, x, y) != px(fr, x, y) and px(fr, x, y) == px(hr, x, y): put(out, x, y, px(dr, x, y))
    return w, h, out

DECK = bytes([0x4f, 0x5a, 0x64, 0xff])  # the patrol boat's deck plating
PATROL_GUNS = [(18, 31, 45, 62), (19, 131, 42, 158)]  # bow gun, aft AA: boxes to paint over

patrol = load('patrol_boat_enemy_dark.png')
patrol_dmg = load('patrol_boat_enemy_dark_damaged.png')
for box in PATROL_GUNS:
    paint_over(patrol, *box, DECK); paint_over(patrol_dmg, *box, DECK)
dhull = load('destroyer_enemy_dark_hull.png')
dhull_dmg = damaged_hull(dhull, load('destroyer_enemy_dark.png'), load('destroyer_enemy_dark_damaged.png'))
gun_main = load('turret_main_enemy_dark.png')
gun_aa = load('turret_aa_enemy_dark.png')
wake_d = load(os.path.join('wake', 'wake_destroyer_strip.png'))
wake_p = load(os.path.join('wake', 'wake_patrol_boat_strip.png'))

# [name, image, x, y] -- mirror any change into BOAT_SHEET in index.html
PLACE = [
    ('wake_destroyer', wake_d, 0, 0),
    ('destroyer', dhull, 1240, 0),
    ('destroyer_dmg', dhull_dmg, 1331, 0),
    ('ship', patrol, 1422, 0),
    ('ship_dmg', patrol_dmg, 1489, 0),
    ('gunMain', gun_main, 1556, 0),
    ('gunAA', gun_aa, 1556, 80),
    ('wake_ship', wake_p, 0, 540),
]
W = max(x + img[0] for _, img, x, _ in PLACE)
H = max(y + img[1] for _, img, _, y in PLACE)
sheet = [bytearray(W * 4) for _ in range(H)]
for name, (w, h, rows), x0, y0 in PLACE:
    for y in range(h): sheet[y0 + y][x0 * 4:(x0 + w) * 4] = rows[y]
    print('%-16s [%d, %d, %d, %d]' % (name + ':', x0, y0, w, h))
write_png(OUT, W, H, sheet)
print('wrote', os.path.normpath(OUT), W, 'x', H)
