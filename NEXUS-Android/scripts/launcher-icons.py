"""Render the Android monogram and legacy launcher icons; requires Pillow."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
res = root / 'android/app/src/main/res'
background, gold = '#182126', '#d8ad63'
points = [(32,31),(44,31),(64,60),(64,31),(76,31),(76,77),(64,77),(44,48),(44,77),(32,77)]
path = 'M32 31H44L64 60V31H76V77H64L44 48V77H32Z'
for suffix, color in [('foreground', gold), ('monochrome', '#FFFFFFFF')]:
    (res / f'drawable/nexus_launcher_{suffix}.xml').write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<vector xmlns:android="http://schemas.android.com/apk/res/android" '
        'android:width="108dp" android:height="108dp" '
        'android:viewportWidth="108" android:viewportHeight="108">\n'
        f'    <path android:fillColor="{color}" android:pathData="{path}"/>\n'
        '</vector>\n', encoding='utf-8')

def render(size, round_icon=False, monochrome=False):
    scale = 6
    im = Image.new('RGBA', (size*scale, size*scale))
    draw = ImageDraw.Draw(im)
    bounds = (0,0,size*scale-1,size*scale-1)
    fill = '#c4d7c4' if monochrome else background
    if round_icon:
        draw.ellipse(bounds, fill=fill)
    else:
        draw.rounded_rectangle(bounds, radius=size*scale*.23, fill=fill)
    # Adaptive icons expose the central 72dp of their 108dp layers.
    draw.polygon([((x-18)/72*size*scale,(y-18)/72*size*scale) for x,y in points],
                 fill=background if monochrome else gold)
    return im.resize((size,size), Image.Resampling.LANCZOS)

for density, size in [('mdpi',48),('hdpi',72),('xhdpi',96),('xxhdpi',144),('xxxhdpi',192)]:
    for round_icon, suffix in [(False,''),(True,'_round')]:
        render(size,round_icon).save(res/f'mipmap-{density}/nexus_launcher{suffix}.png')

if __name__ == '__main__':
    print('Rendered adaptive monogram and 10 legacy icons.')
