"""Create reproducible antialiased extension icons using only the standard library."""
from pathlib import Path
import math
import struct
import zlib

ROOT = Path(__file__).resolve().parents[1]

def distance_segment(x, y, ax, ay, bx, by):
    t = max(0, min(1, ((x-ax)*(bx-ax)+(y-ay)*(by-ay))/((bx-ax)**2+(by-ay)**2)))
    return math.hypot(x-ax-t*(bx-ax), y-ay-t*(by-ay))

def pixel(x, y):
    # Rounded rectangle signed distance, in the SVG's 128-unit space.
    dx, dy = abs(x-64)-31, abs(y-64)-31
    inside = math.hypot(max(dx, 0), max(dy, 0)) + min(max(dx, dy), 0) <= 29
    if not inside:
        return (0, 0, 0, 0)
    paths = ((33,39,60,64),(60,64,33,89),(64,39,91,64),(91,64,64,89))
    if min(distance_segment(x,y,*segment) for segment in paths) <= 5:
        return (255,255,255,255)
    t = min(1, max(0, (x*.25+y*.75)/128))
    return tuple(round(a+(b-a)*t) for a,b in zip((122,104,231),(81,66,185)))+(255,)

def chunk(kind, data):
    return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)

def create(size):
    samples = 4
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        for x in range(size):
            colors = [pixel((x+(sx+.5)/samples)*128/size, (y+(sy+.5)/samples)*128/size)
                      for sy in range(samples) for sx in range(samples)]
            alpha = sum(c[3] for c in colors)
            # Unpremultiply edge colors before writing straight RGBA pixels.
            rgb = [round(sum(c[i]*c[3] for c in colors)/alpha) if alpha else 0 for i in range(3)]
            raw.extend(rgb+[round(alpha/(samples*samples))])
    png = b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',size,size,8,6,0,0,0))
    png += chunk(b'IDAT',zlib.compress(bytes(raw),9))+chunk(b'IEND',b'')
    (ROOT/'icons'/f'icon{size}.png').write_bytes(png)

if __name__ == '__main__':
    for size in (16,32,48,128):
        create(size)
    print('Generated 16, 32, 48 and 128 px icons.')
