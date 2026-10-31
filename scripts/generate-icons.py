"""アプリアイコン（PNG）生成スクリプト。

favicon.svg と同一のモチーフ（菱形 + RI）を、PWA の manifest 用に複数サイズへ
ラスタライズする。配色は docs/design-guide.md のトークン（--ak-*）と一致させる。

  - 背景   : --ak-bg-surface   #141D22
  - 菱形枠 : --ak-accent       #C4AD70
  - RI文字 : --ak-accent-strong #E8D49B

生成物:
  assets/apple-touch-icon.png   180x180（iOS ホーム画面）
  assets/icon-192.png           192x192（any）
  assets/icon-512.png           512x512（any）
  assets/icon-maskable-192.png  192x192（maskable）
  assets/icon-maskable-512.png  512x512（maskable）

使い方: python scripts/generate-icons.py
（Pillow が必要: pip install pillow）
"""

from pathlib import Path

from PIL import Image, ImageDraw

BG = (0x14, 0x1D, 0x22)          # #141D22
ACCENT = (0xC4, 0xAD, 0x70)      # #C4AD70
ACCENT_STRONG = (0xE8, 0xD4, 0x9B)  # #E8D49B

OUT_DIR = Path(__file__).resolve().parent.parent / "assets"

# 64x64 の favicon.svg 座標系を基準に、任意サイズへスケーリングして描画する。
DIAMOND = [(32, 8), (52, 32), (32, 56), (12, 32)]
MARK_TRIANGLE = [(22, 42), (32, 19), (42, 42)]
MARK_BAR = [(26, 33), (38, 33)]


def draw_emblem(draw, size):
    """size ピクセル四方の正方形に、菱形枠と RI モチーフを描く。"""

    def point(x, y):
        return (x / 64.0 * size, y / 64.0 * size)

    diamond_stroke = max(1, round(size * 2 / 64))
    mark_stroke = max(1, round(size * 3 / 64))

    # 菱形枠（閉じた多角形として描画）
    draw.line(
        [point(x, y) for (x, y) in DIAMOND] + [point(*DIAMOND[0])],
        fill=ACCENT,
        width=diamond_stroke,
        joint="curve",
    )
    # RI モチーフ（上向き三角形 + 横棒）
    draw.line(
        [point(x, y) for (x, y) in MARK_TRIANGLE],
        fill=ACCENT_STRONG,
        width=mark_stroke,
        joint="curve",
    )
    draw.line(
        [point(x, y) for (x, y) in MARK_BAR],
        fill=ACCENT_STRONG,
        width=mark_stroke,
    )


def make_icon(size, filename, supersample=4):
    """supersample 倍で描画後 LANCZOS 縮小し、滑らかなエッジを得る。"""
    canvas = size * supersample
    image = Image.new("RGB", (canvas, canvas), BG)
    draw = ImageDraw.Draw(image)
    draw_emblem(draw, canvas)
    image = image.resize((size, size), Image.LANCZOS)
    image.save(OUT_DIR / filename)
    print(f"generated {OUT_DIR / filename} ({size}x{size})")


def make_favicon_assets():
    """favicon.svg と同じ菱形/RI意匠を favicon.png / favicon.ico へ出力する。"""
    supersample = 4
    canvas = 64 * supersample
    image = Image.new("RGB", (canvas, canvas), BG)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((0, 0, canvas - 1, canvas - 1), radius=10 * supersample, fill=BG)
    draw_emblem(draw, canvas)
    favicon = image.resize((32, 32), Image.Resampling.LANCZOS)
    favicon.save(OUT_DIR / "favicon.png")
    favicon.save(OUT_DIR / "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
    print(f"generated {OUT_DIR / 'favicon.png'} (32x32)")
    print(f"generated {OUT_DIR / 'favicon.ico'} (16/32/48)")


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    make_favicon_assets()
    make_icon(180, "apple-touch-icon.png")

    make_icon(192, "icon-192.png")
    make_icon(512, "icon-512.png")
    make_icon(192, "icon-maskable-192.png")
    make_icon(512, "icon-maskable-512.png")


if __name__ == "__main__":
    main()
