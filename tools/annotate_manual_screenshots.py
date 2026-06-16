from pathlib import Path
import json
from PIL import Image, ImageDraw, ImageFont

ROOT = Path.cwd()
ASSETS = ROOT / "manual_assets"
RAW = ASSETS / "raw"
ANNOTATED = ASSETS / "annotated"
META = ASSETS / "screenshots.json"

ANNOTATED.mkdir(parents=True, exist_ok=True)

try:
    FONT = ImageFont.truetype("arial.ttf", 26)
    FONT_SMALL = ImageFont.truetype("arial.ttf", 22)
except OSError:
    FONT = ImageFont.load_default()
    FONT_SMALL = ImageFont.load_default()

with META.open("r", encoding="utf-8") as fh:
    rows = json.load(fh)

for row in rows:
    image_path = Path(row["path"])
    output_path = ANNOTATED / row["fileName"]

    image = Image.open(image_path).convert("RGBA")
    overlay = Image.new("RGBA", image.size, (255, 255, 255, 0))
    draw = ImageDraw.Draw(overlay)

    for item in row["highlights"]:
      x = item["x"]
      y = item["y"]
      w = item["width"]
      h = item["height"]
      margin = 10
      box = [x - margin, y - margin, x + w + margin, y + h + margin]
      draw.rounded_rectangle(box, radius=18, outline=(255, 60, 60, 255), width=6, fill=(255, 235, 59, 80))

      bubble_size = 34
      bubble_x = x - 8
      bubble_y = y - 8
      draw.ellipse(
          [bubble_x, bubble_y, bubble_x + bubble_size, bubble_y + bubble_size],
          fill=(255, 60, 60, 255),
          outline=(255, 255, 255, 255),
          width=2,
      )
      draw.text((bubble_x + 10, bubble_y + 4), item["label"], fill=(255, 255, 255, 255), font=FONT_SMALL)

    final = Image.alpha_composite(image, overlay).convert("RGB")
    final.save(output_path, quality=95)
