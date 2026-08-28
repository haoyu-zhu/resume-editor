#!/usr/bin/env python3
"""从 Fig/ 下的原图生成 assets/photo.js（默认证件照占位图）。

    python tools/make-photo.py

这不是构建步骤 —— 产品本身仍然是纯静态的，不需要跑任何东西。
只有想换占位图时才用得上：把新图丢进 Fig/，跑一次这个脚本。

处理规格和 assets/app.js 里 setPhotoFromFile() 完全一致：
缩到 420px 宽（2.85cm 宽在 300dpi 下只需约 340px），JPEG 质量 88。
带 alpha 的图会先合成到白底上，否则转 JPEG 时透明处会变黑。
"""

import base64
import io
import pathlib
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("需要 Pillow：pip install Pillow")

MAX_W = 420          # 和 app.js 里的 MAX 保持一致
QUALITY = 88         # 和 app.js 里 toDataURL("image/jpeg", 0.88) 对齐

ROOT = pathlib.Path(__file__).resolve().parent.parent
FIG = ROOT / "Fig"
OUT = ROOT / "assets" / "photo.js"

HEADER = """/* 默认证件照占位图 —— 由 tools/make-photo.py 从 {src} 生成，别手改。

   处理规格和 app.js 上传照片时一致：缩到 {w}px 宽、JPEG 质量 {q}。
   想换图：把新图放进 Fig/，跑 `python tools/make-photo.py`。

   做成独立的 js 常量而不是图片文件，是为了本地双击 index.html 打开时也能用 ——
   file:// 协议下 fetch 会被 CORS 拦掉，和 sample.js 同一个道理。 */
window.DEFAULT_PHOTO = "{uri}";
"""


def pick_source():
    exts = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}
    imgs = sorted(p for p in FIG.iterdir() if p.suffix.lower() in exts)
    if not imgs:
        sys.exit(f"{FIG} 下没有找到图片")
    if len(imgs) > 1:
        print(f"Fig/ 下有 {len(imgs)} 张图，用第一张：{imgs[0].name}")
    return imgs[0]


def main():
    src = pick_source()
    im = Image.open(src)
    orig = im.size

    # 带 alpha 的先压到白底，不然 JPEG 里透明处会变成黑块
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, (255, 255, 255))
        bg.paste(im, mask=im.getchannel("A"))
        im = bg
    else:
        im = im.convert("RGB")

    w = min(im.width, MAX_W)
    im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)

    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=QUALITY, optimize=True)
    raw = buf.getvalue()
    uri = "data:image/jpeg;base64," + base64.b64encode(raw).decode("ascii")

    OUT.write_text(
        HEADER.format(src="Fig/" + src.name, w=MAX_W, q=QUALITY, uri=uri),
        encoding="utf-8",
    )
    print(f"{src.name}  {orig[0]}x{orig[1]} -> {im.size[0]}x{im.size[1]}")
    print(f"JPEG {len(raw) / 1024:.1f} KB  ->  {OUT.relative_to(ROOT)} "
          f"{OUT.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
