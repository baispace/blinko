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
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
