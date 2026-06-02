#!/usr/bin/env python3
"""flat PNG (outline + flat fill + white bg) -> recolorable SVG.
Fill region uses fill="currentColor" so the host can recolor via CSS `color`.
Outline/detail lines are fixed dark. Two potrace passes (silhouette + ink)."""
import subprocess, os, re, sys, tempfile
from PIL import Image, ImageMath
import PIL.ImageChops as IC

def trim(im, thr=14, m=10):
    im = im.convert('RGB'); bg = Image.new('RGB', im.size, (255,255,255))
    dd = IC.difference(im, bg).convert('L')
    bb = dd.point(lambda p: 255 if p > thr else 0).getbbox()
    if bb:
        x0,y0,x1,y1 = bb
        x0=max(0,x0-m); y0=max(0,y0-m); x1=min(im.width,x1+m); y1=min(im.height,y1+m)
        return im.crop((x0,y0,x1,y1))
    return im

def potrace_g(mask_L, turd, tmpbase):
    """mask_L: 'L' image with 0=foreground(trace), 255=bg. Returns (transform, inner_paths)."""
    bmp = tmpbase + '.bmp'; svg = tmpbase + '.svg'
    mask_L.convert('1').save(bmp, 'BMP')
    subprocess.run(['potrace','-s','-t',str(turd),'-a','1.0','-O','0.2','-o',svg,bmp], check=True)
    t = open(svg).read()
    g = re.search(r'<g\b[^>]*transform="([^"]*)"[^>]*>(.*?)</g>', t, re.S)
    if not g:
        # no foreground traced (empty) -> return empty
        return None, ''
    return g.group(1), g.group(2)

def build(flat_png, out_svg, fill_default="#EADFCE"):
    im = trim(Image.open(flat_png))
    W, H = im.size
    R,G,B = [c.convert('L') for c in im.split()]
    minc = ImageMath.eval("min(min(a,b),c)", a=R, b=G, c=B).convert('L')
    lum  = im.convert('L')
    # silhouette foreground (0=black) = garment pixels (not near-white bg)
    sil = minc.point(lambda v: 0 if v <= 244 else 255).convert('L')
    # ink foreground = dark lines
    ink = lum.point(lambda v: 0 if v < 110 else 255).convert('L')
    with tempfile.TemporaryDirectory() as td:
        tf_s, p_s = potrace_g(sil, 40, os.path.join(td,'sil'))
        tf_i, p_i = potrace_g(ink, 2,  os.path.join(td,'ink'))
    layers = []
    if tf_s: layers.append(f'<g transform="{tf_s}" fill="currentColor" stroke="none">{p_s}</g>')
    if tf_i: layers.append(f'<g transform="{tf_i}" fill="#1f1f1f" stroke="none">{p_i}</g>')
    # NB: НЕ задаём color на корне — иначе currentColor резолвится в него и
    # родитель не сможет перекрасить. Цвет заливки задаёт хост (style color).
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" '
           f'width="{W}" height="{H}" preserveAspectRatio="xMidYMid meet">\n'
           + '\n'.join(layers) + '\n</svg>\n')
    with open(out_svg,'w') as f: f.write(svg)
    return W, H, len(svg)

if __name__ == '__main__':
    src = sys.argv[1]; out = sys.argv[2]
    w,h,n = build(src, out)
    print(f"OK {out}  {w}x{h}  {n} bytes")
