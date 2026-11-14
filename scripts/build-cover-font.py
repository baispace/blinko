"""把可变 Noto Sans SC 实例化成静态字重，给封面文字层用。

为什么必须这么做：

  封面标题在页面上是 DOM 文字（@font-face + font-weight），
  服务端导出的分享图是 sharp 画的。
  sharp 的文字渲染走 Pango + fontconfig —— 在没有 fontconfig 配置的机器上
  （不少精简版 Linux 镜像就是），fontfile 会被静默忽略，
  导出的图用系统兜底字体，和页面上的字完全不是一回事。

  静态实例没有这个问题：浏览器和 Pango 拿到的是同一份字形；
  再进一步，服务端直接用 opentype.js 把字形转成路径交给 sharp，
  就不依赖 fontconfig 了。

用法（仓库根目录执行）：

    python3 -m pip install fonttools
    python3 scripts/build-cover-font.py

产物在 app/public/fonts/cover/ —— 浏览器 @font-face 与服务端导出共用这两份静态字库。
可变源字体放在 assets/fonts/ 下，不进 public：它只是生成静态实例的原料，
没有人会直接加载它。
"""

from __future__ import annotations

import os
import sys

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

SRC = os.path.join("assets", "fonts", "NotoSansSC-Variable.ttf")
OUT_DIR = os.path.join("app", "public", "fonts", "cover")
# 标题用 Black，副标题用 Medium —— 与页面 .ink-cover-text 的两档字重一一对应。
WEIGHTS = {"Black": 900, "Medium": 500}


def main() -> int:
    if not os.path.exists(SRC):
        print(f"找不到源字体：{SRC}", file=sys.stderr)
        return 1
    for label, weight in WEIGHTS.items():
        dst = os.path.join(OUT_DIR, f"NotoSansSC-{label}.ttf")
        font = TTFont(SRC)
        if "fvar" not in font:
            print("源字体不是可变字体，直接复制即可。", file=sys.stderr)
            with open(SRC, "rb") as src, open(dst, "wb") as out:
                out.write(src.read())
            continue
        static = instancer.instantiateVariableFont(
            font, {"wght": weight}, updateFontNames=True, inplace=True
        )
        static.save(dst)
        size = os.path.getsize(dst) / 1024 / 1024
        print(f"已生成 {dst}（{size:.1f} MB, wght={weight}）")
    build_browser_slices()
    return 0


# ---------------------------------------------------------------------------
# 浏览器用的分片字库
#
# 为什么要有分片：
#   完整的一份 Noto Sans SC 有 3 万多字、10 MB 出头。封面大字只要几个字，
#   浏览器却要整份拉下来 —— 首屏最重的一项就是它（实测 10.5 MB）。
#
# 做法与 Google Fonts 的中文分片一致：按 unicode-range 把字库切成若干片，
# 页面声明全部片，浏览器只下载「含有用到的字」的那几片。
# 一个标题通常落在 1–2 片里，下载量从 10 MB 降到几百 KB。
#
# 服务端导出的分享图仍然用完整 TTF —— 它不受带宽限制，而且要保证
# 任何字都能画出来。
# ---------------------------------------------------------------------------

SLICE_DIR = "slices"
# 每片一百二十个字左右：一片约 40 KB。
#
# 一屏上出现的封面大字通常十几个字，它们在码位上离得很远 ——
# 一片多大，就决定了首屏要为字体花多少：每片 40 KB 时十几个字约 600 KB，
# 每片 130 KB 时就是 1.4 MB。
# 片数多换来的代价是 CSS 里多几行 unicode-range（每片一行，仍然只有几十 KB）。
SLICE_SIZE = 120


def build_browser_slices():
    """把两档字重各切成若干 WOFF2 片，并生成对应的 @font-face 样式。"""
    try:
        from fontTools import subset
    except ImportError:
        print("缺少 fontTools.subset，跳过分片字库。", file=sys.stderr)
        return

    out_dir = os.path.join(OUT_DIR, SLICE_DIR)
    os.makedirs(out_dir, exist_ok=True)
    variable = TTFont(SRC)
    cmap = set(variable.getBestCmap().keys())
    latin = sorted(c for c in cmap if not (0x4E00 <= c <= 0x9FFF))
    # 按码位切：每片是一段连续区间，unicode-range 只需写一条，
    # CSS 不会因为字多而膨胀。
    cjk = sorted(c for c in cmap if 0x4E00 <= c <= 0x9FFF)

    # 常用 ASCII（标题里的数字与拉丁字母）单独一片：
    # 剩下的非汉字有几千个，混在一起会做成一个 3 MB 的巨片 ——
    # 只要标题里有个数字，整片就得下载。
    ascii_common = [c for c in latin if 0x20 <= c <= 0x7E]
    latin_rest = [c for c in latin if not (0x20 <= c <= 0x7E)]

    slices = [ascii_common]
    for index in range(0, len(latin_rest), SLICE_SIZE):
        slices.append(latin_rest[index : index + SLICE_SIZE])
    for index in range(0, len(cjk), SLICE_SIZE):
        slices.append(cjk[index : index + SLICE_SIZE])

    css = [
        "/* 由 scripts/build-cover-font.py 生成，请勿手改。",
        " * 封面文字层用的中文字库分片：浏览器按 unicode-range 只下载用到的片。 */",
    ]
    total = 0
    for label, weight in WEIGHTS.items():
        # 静态实例只做一次：可变字体实例化很慢，分片有上百个。
        static_path = os.path.join(out_dir, f".static-{label}.ttf")
        font = TTFont(SRC)
        if "fvar" in font:
            instancer.instantiateVariableFont(
                font, {"wght": weight}, updateFontNames=True, inplace=True
            )
        font.save(static_path)
        for index, chunk in enumerate(slices):
            if not chunk:
                continue
            name = f"NotoSansSC-{label}-{index}.woff2"
            path = os.path.join(out_dir, name)
            static = TTFont(static_path)
            options = subset.Options()
            options.flavor = "woff2"
            options.layout_features = ["*"]
            options.notdef_outline = True
            options.drop_tables = []
            subsetter = subset.Subsetter(options=options)
            subsetter.populate(unicodes=chunk)
            subsetter.subset(static)
            static.save(path)
            size = os.path.getsize(path)
            total += size
            # 一段连续码位写成一条区间；不连续时才逐个列。
            ranges = []
            start = previous = chunk[0]
            for code in chunk[1:] + [None]:
                if code is not None and code == previous + 1:
                    previous = code
                    continue
                ranges.append(
                    f"U+{start:04X}"
                    if start == previous
                    else f"U+{start:04X}-{previous:04X}"
                )
                if code is not None:
                    start = previous = code
            css.append(
                "@font-face{font-family:'Ink Cover Sans';"
                f"src:url('/fonts/cover/{SLICE_DIR}/{name}') format('woff2');"
                f"font-weight:{weight};font-style:normal;font-display:swap;"
                f"unicode-range:{','.join(ranges)};}}"
            )
            print(f"  分片 {name}（{size / 1024:.0f} KB, {len(chunk)} 字）")
        os.remove(static_path)

    css_path = os.path.join(OUT_DIR, "cover-sans.css")
    with open(css_path, "w", encoding="utf-8") as out:
        out.write("\n".join(css) + "\n")
    print(f"已生成 {css_path}（分片合计 {total / 1024 / 1024:.1f} MB）")


if __name__ == "__main__":
    raise SystemExit(main())
