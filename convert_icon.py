from PIL import Image
import os

try:
    img = Image.open("icon.jpg")
    # Resize to 128x128 for standard usage
    img = img.resize((128, 128), Image.Resampling.LANCZOS)
    img.save("icon.png", "PNG")
    print("SUCCESS: Converted icon.jpg to icon.png (128x128)")
except Exception as e:
    print(f"ERROR: {e}")
