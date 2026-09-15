# -*- coding: utf-8 -*-
"""生成 assets/share.png —— 分享按钮弹窗里那张图。

一张图要说完三件事：这工具做出来的简历长什么样、它是什么、去哪找。
所以构图是「示例简历的真实截图 + 底部横幅（标题 + 网址 + 二维码）」。

二维码不是装饰：剪贴板一次粘贴只能带图片**或**文字，不能两个都要，
所以链接必须长在图里，否则用户得发两次。

用真实渲染而不是设计稿，是为了这张图永远和产品一致 ——
改了版面样式，重跑一次这个脚本就同步了。

    python tools/make-share.py

需要：PIL、segno、本机 Chrome。产品运行时不读它们，只在重做图时用。
"""
import os, re, json, shutil, subprocess, sys, tempfile
from PIL import Image, ImageDraw, ImageFont
import segno

ROOT   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")
OUT    = os.path.join(ASSETS, "share.png")

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
URL    = "https://haoyu-zhu.github.io/resume-editor/"     # 二维码扫出来就是这个
SHOWN  = "haoyu-zhu.github.io/resume-editor"              # 图上印出来给人手输的

# ---- 构图参数（CSS px，最后整张图会缩到 OUT_W 宽）----
PAPER_W, PAPER_H = 794, 1123      # A4 在 96dpi 下的像素尺寸
SHOT_H  = 900                     # 简历只取上面这么高，底部做渐隐暗示「还有」
PAD     = 26                      # 纸卡片到画布边缘
BANNER  = 196                     # 底部横幅高度（要装得下二维码）
SCALE   = 2                       # 渲染倍率，保证文字锐利
OUT_W   = 1000                    # 最终宽度，微信里够看又不至于太大

BG     = (236, 239, 243)          # 和编辑器的底色一致
ACCENT = (28, 90, 180)            # 默认主题色 #1c5ab4

# resume.css 的 :root 变量 <- sample.js 的 meta.vars（抄自 app.js 的 VARMAP）
VARMAP = {
    "base": ("--base", "pt"), "leading": ("--leading", ""),
    "secAbove": ("--sec-gap-above", "pt"), "titleGap": ("--title-line-gap", "pt"),
    "secBelow": ("--sec-gap-below", "pt"), "item": ("--item-gap", "pt"),
    "entry": ("--entry-gap", "pt"), "photo": ("--photo-w", "cm"),
    "padT": ("--page-mt", "cm"), "padB": ("--page-mb", "cm"), "padX": ("--page-mx", "cm"),
}


def furl(path):
    return "file:///" + os.path.abspath(path).replace("\\", "/")


def shoot_paper(tmp):
    """把示例简历渲染成一张纸的截图，不带任何编辑器界面。"""
    html = f"""<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="{furl(os.path.join(ASSETS, 'resume.css'))}">
<style>
  /* style.css 的全局 box-sizing:border-box 是纸宽成立的前提：
     少了它 .paper 变回 content-box，21cm 再加左右各 1cm 内边距就撑出视口，
     右边的日期会被切掉。这里只加载 resume.css，所以得补上。 */
  *{{box-sizing:border-box;}}
  html,body{{margin:0;padding:0;background:#fff;overflow:hidden;}}
  .paper{{margin:0 !important;box-shadow:none;}}
  /* render.js 把编辑器的控制按钮一起吐进 HTML，平时由 style.css 藏着。
     这里只加载 resume.css，所以得自己藏一遍，否则纸上全是 ＋ 和 ✕。 */
  .ctl,.addbar{{display:none !important;}}
</style>
<div class="paper"><div id="doc"></div></div>
<script src="{furl(os.path.join(ASSETS, 'photo.js'))}"></script>
<script src="{furl(os.path.join(ASSETS, 'sample.js'))}"></script>
<script src="{furl(os.path.join(ASSETS, 'render.js'))}"></script>
<script>
  var VARMAP = {json.dumps(VARMAP)};
  var d = window.SAMPLE;
  if (d.meta.photo == null) d.meta.photo = window.DEFAULT_PHOTO;
  var rs = document.documentElement.style;
  var v = (d.meta && d.meta.vars) || {{}};
  for (var k in v) if (VARMAP[k]) rs.setProperty(VARMAP[k][0], v[k] + VARMAP[k][1]);
  var t = (d.meta && d.meta.theme) || {{}};
  if (t.accent)     rs.setProperty("--accent", t.accent);
  if (t.accentDark) rs.setProperty("--accent-dark", t.accentDark);
  if (t.link)       rs.setProperty("--link", t.link);
  renderResume(d, document.getElementById("doc"));
</script>"""
    page = os.path.join(tmp, "render.html")
    with open(page, "w", encoding="utf-8") as f:
        f.write(html)

    shot = os.path.join(tmp, "paper.png")
    subprocess.run([
        CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
        f"--user-data-dir={os.path.join(tmp, 'profile')}",   # 每次换，否则静默失败
        f"--window-size={PAPER_W},{PAPER_H}",
        f"--force-device-scale-factor={SCALE}",
        "--default-background-color=FFFFFFFF",
        "--virtual-time-budget=4000",
        f"--screenshot={shot}", furl(page),
    ], check=True, capture_output=True, timeout=120)
    return Image.open(shot).convert("RGB")


def fade_bottom(img, h):
    """底部 h 像素渐隐到白，暗示下面还有内容。"""
    w = img.width
    mask = Image.new("L", (w, h))
    px = mask.load()
    for y in range(h):
        a = int(255 * (y / max(h - 1, 1)) ** 1.6)
        for x in range(w):
            px[x, y] = a
    img.paste(Image.new("RGB", (w, h), (255, 255, 255)),
              (0, img.height - h), mask)
    return img


def rounded(img, r):
    """给纸卡片切个圆角，连同下面那层阴影一起用。"""
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.width - 1, img.height - 1],
                                           radius=r, fill=255)
    out = Image.new("RGBA", img.size)
    out.paste(img, (0, 0), mask)
    return out


def qr_image(size):
    # error="q" 和 "m" 占同样多的模块，纠错等级白升一级，不要白不要
    q = segno.make(URL, error="q")
    tmp = os.path.join(tempfile.gettempdir(), "_share_qr.png")
    q.save(tmp, scale=10, border=2, dark="#1c5ab4", light="#ffffff")
    img = Image.open(tmp).convert("RGB").resize((size, size), Image.LANCZOS)
    os.remove(tmp)
    return img


def main():
    if not os.path.exists(CHROME):
        sys.exit("找不到 Chrome：" + CHROME)

    tmp = tempfile.mkdtemp(prefix="share-")
    try:
        paper = shoot_paper(tmp)
    finally:
        pass   # profile 目录留到最后统一删

    S = SCALE
    card = paper.crop((0, 0, PAPER_W * S, SHOT_H * S))
    card = fade_bottom(card, int(150 * S))
    card = rounded(card, int(10 * S))

    W = (PAPER_W + PAD * 2) * S
    H = (PAD + SHOT_H + PAD + BANNER) * S
    canvas = Image.new("RGB", (W, H), BG)

    # 纸下面垫一层很轻的阴影，让它看起来是一张纸而不是一块贴图
    sh = Image.new("RGBA", card.size, (150, 160, 175, 70))
    sh = rounded(sh.convert("RGB"), int(10 * S))
    canvas.paste(sh, (PAD * S, (PAD + 3) * S), sh)
    canvas.paste(card, (PAD * S, PAD * S), card)

    # ---- 底部横幅 ----
    top = (PAD + SHOT_H + PAD) * S
    d = ImageDraw.Draw(canvas)
    d.rectangle([0, top, W, H], fill=ACCENT)

    f_big = ImageFont.truetype(r"C:\Windows\Fonts\msyhbd.ttc", int(30 * S))
    f_sub = ImageFont.truetype(r"C:\Windows\Fonts\msyh.ttc",   int(17 * S))
    f_url = ImageFont.truetype(r"C:\Windows\Fonts\msyh.ttc",   int(16 * S))

    x = int(38 * S)
    d.text((x, top + int(48 * S)), "在浏览器里直接改简历",
           font=f_big, fill=(255, 255, 255))
    d.text((x, top + int(98 * S)), "所见即所得 · 不用注册 · 简历不上传",
           font=f_sub, fill=(207, 222, 245))
    d.text((x, top + int(132 * S)), SHOWN, font=f_url, fill=(168, 196, 238))

    # 150 CSS px 是量出来的下限：最终图里每个模块 4.8px，低于 4px 微信就认不出
    qs = int(150 * S)
    qr = qr_image(qs)
    qx, qy = W - qs - int(38 * S), top + (BANNER * S - qs) // 2
    d.rounded_rectangle([qx - int(7 * S), qy - int(7 * S),
                         qx + qs + int(7 * S), qy + qs + int(7 * S)],
                        radius=int(7 * S), fill=(255, 255, 255))
    canvas.paste(qr, (qx, qy))
    d.text((qx - int(96 * S), qy + qs // 2 - int(11 * S)), "长按识别 →",
           font=f_sub, fill=(207, 222, 245))

    canvas = canvas.resize((OUT_W, round(H * OUT_W / W)), Image.LANCZOS)
    # 降到 256 色再存：这张图几乎全是白底 + 少数几个蓝，量化后 685KB -> 210KB，
    # 肉眼看不出差别。必须是 PNG —— Chrome 的剪贴板只认 image/png，JPEG 写不进去。
    # dither 必须关：抖动会啃坏二维码的模块边缘，让微信认不出来。
    # 这张图本来就几乎全是平色，不抖也没有色带。
    canvas = canvas.quantize(colors=256, method=Image.MEDIANCUT,
                             dither=Image.NONE)
    canvas.save(OUT, optimize=True)
    shutil.rmtree(tmp, ignore_errors=True)
    print("写好了 %s  %dx%d  %.0f KB"
          % (OUT, canvas.width, canvas.height, os.path.getsize(OUT) / 1024))


if __name__ == "__main__":
    main()
