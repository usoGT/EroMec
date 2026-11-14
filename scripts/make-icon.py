# EroMec uygulama simgesini (build/icon.png ve build/icon.ico) üretir.
# Çizim src/renderer/components/Logo.tsx ile aynıdır (64 birimlik ızgara, 8 kat büyütülmüş).
from PIL import Image, ImageDraw
import os

S = 512
k = S / 64
RED = (220, 38, 38, 255)
BLACK = (10, 10, 10, 255)
WHITE = (255, 255, 255, 255)

img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle([1 * k, 1 * k, 63 * k, 63 * k], radius=13 * k, fill=BLACK, outline=RED, width=int(2 * k))
for (x, y, w, h) in [(14, 13, 9, 38), (14, 13, 33, 8), (14, 28, 22, 8), (14, 43, 33, 8)]:
    d.rounded_rectangle([x * k, y * k, (x + w) * k, (y + h) * k], radius=1.5 * k, fill=RED)
hexagon = [(50, 25.5), (55.6, 28.75), (55.6, 35.25), (50, 38.5), (44.4, 35.25), (44.4, 28.75)]
d.polygon([(x * k, y * k) for x, y in hexagon], fill=WHITE)
d.ellipse([(50 - 2.6) * k, (32 - 2.6) * k, (50 + 2.6) * k, (32 + 2.6) * k], fill=BLACK)

os.makedirs('build', exist_ok=True)
img.save('build/icon.png')
img.save('build/icon.ico', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
os.makedirs('src/renderer/public', exist_ok=True)
img.resize((64, 64), Image.LANCZOS).save('src/renderer/public/favicon.png')
print('ok')
