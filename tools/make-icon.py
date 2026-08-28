#!/usr/bin/env python3
"""从 Fig/ 下的原图生成 assets/icon.png（浏览器标签页图标）。

    python tools/make-icon.py [Fig/APP.png]

和 make-photo.py 一样，这不是构建步骤 —— 产品本身仍然是纯静态的。
只有想换图标时才用得上：把新图丢进 Fig/，跑一次这个脚本。

favicon 会被浏览器缩到 16~32px 显示，原图那圈白边在那个尺寸下
纯属浪费像素，所以先按「非背景色」裁掉留白，再补成正方形。
不裁的话主体只占一半宽，缩完就是一团看不清的灰。
"""

import pathlib
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("需要 Pillow：pip install Pillow")

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "Fig" / "APP.png"
OUT = ROOT / "assets" / "icon.png"
SIZE = 256          # 单张就够，浏览器自己往下缩
PAD = 0.04          # 裁完四周留一点气口，别让主体贴边
TOL = 12            # 和背景色差多少才算「有内容」


def content_box(im):
    """按左上角像素当背景色，找出有内容那块的外接矩形。"""
    rgb = im.convert("RGB")
    bg = rgb.getpixel((0, 0))
    w, h = rgb.size
    px = rgb.load()
    x0, y0, x1, y1 = w, h, 0, 0
    step = max(1, min(w, h) // 400)           # 大图抽样扫，够准且快
    for y in range(0, h, step):
        for x in range(0, w, step):
            r, g, b = px[x, y]
            if abs(r - bg[0]) > TOL or abs(g - bg[1]) > TOL or abs(b - bg[2]) > TOL:
                if x < x0: x0 = x
                if y < y0: y0 = y
                if x > x1: x1 = x
                if y > y1: y1 = y
    if x0 > x1 or y0 > y1:                    # 整张都是背景色，别裁
        return (0, 0, w, h)
    return (x0, y0, x1 + 1, y1 + 1)


def main():
    if not SRC.exists():
        sys.exit(f"找不到原图：{SRC}")
    im = Image.open(SRC)
    if im.mode in ("RGBA", "LA", "P"):        # 带 alpha 的先合成到白底
        im = im.convert("RGBA")
        flat = Image.new("RGB", im.size, (255, 255, 255))
        flat.paste(im, mask=im.split()[-1])
        im = flat
    else:
        im = im.convert("RGB")

    x0, y0, x1, y1 = content_box(im)
    bg = im.getpixel((0, 0))

    # 补成正方形：以内容的中心为心，边长取长边 + 气口，越界的部分用背景色填
    side = int(max(x1 - x0, y1 - y0) * (1 + PAD * 2))
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    square = Image.new("RGB", (side, side), bg)
    square.paste(im, (side // 2 - cx, side // 2 - cy))

    square.resize((SIZE, SIZE), Image.LANCZOS).save(OUT, "PNG", optimize=True)
    print(f"{SRC.name}  {im.size[0]}x{im.size[1]}"
          f"  → 内容框 {x1-x0}x{y1-y0}  → {OUT.relative_to(ROOT)}  {SIZE}x{SIZE}"
          f"  {OUT.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
