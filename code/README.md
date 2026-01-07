# AIoT Python Project

A Python template for AIoT (Artificial Intelligence of Things) projects with camera integration and computer vision capabilities.

## 🚀 Getting Started

### ✨ What Happens When You Create This Project

When you create an AIoT project, the following happens automatically:

1. **Project files are created** - `main.py`, `pyproject.toml`, and other files
2. **System packages are installed** - `libcamera` and related packages are automatically installed (Linux/Raspberry Pi only)
3. **Virtual environment is created** - `.venv` folder is automatically set up
4. **Python packages are installed** - `picamera2` and other dependencies are installed automatically

You're all set! Just click the **▶️ Play button** to run your code.

### Running the Project

Simply click the **▶️ Play button** in the editor, or run:
```bash
uv run main.py
```

### First Time Setup (if .venv doesn't exist)

AIoT projects need access to system packages like `libcamera`. Create the venv and enable system packages:
```bash
uv venv
echo "include-system-site-packages = true" >> .venv/pyvenv.cfg
```

Then `uv run` will have access to system packages like `libcamera` and `picamera2`.

## 🎯 Features

### 1. Camera Integration
- Raspberry Pi camera support
- Photo capture functionality
- Automatic image saving

### 2. Ready to Extend
- Add AI/ML features easily
- Object detection ready
- Face recognition ready

## 📝 Next Steps

1. Edit `main.py` to add your code
2. Add more dependencies to `pyproject.toml` as needed
3. Click the **▶️ Play button** to run your code

---

**Happy Coding! 🚀**
