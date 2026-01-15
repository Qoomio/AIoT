#!/usr/bin/env python3
"""
AIoT Python Project with Camera Integration

✨ System packages (libcamera) are automatically installed when the project is created.
Make sure uv sync has completed before running the project.
"""

from picamera2 import Picamera2
import time
import os

def main():
    # Save in the same directory as this script
    save_dir = os.path.dirname(os.path.abspath(__file__))
    os.makedirs(save_dir, exist_ok=True)

    picam2 = Picamera2()
    picam2.configure(picam2.create_still_configuration())
    picam2.start()
    time.sleep(2)

    file_path = os.path.join(save_dir, "capture.jpg")
    picam2.capture_file(file_path)
    picam2.close()

    print(f"Photo saved successfully: {file_path}")

if __name__ == "__main__":
    main()