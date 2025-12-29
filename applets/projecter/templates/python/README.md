# Python Hello World Project

This is a simple Python Hello World project created with the Projecter applet.

## Getting Started with uv

[uv](https://github.com/astral-sh/uv) is a fast Python package manager and project manager.

### ✨ Pre-configured Setup

This project is **already set up** with uv! The virtual environment (`.venv`) has been created automatically when you created the project. You can start coding right away!

### Running the Project

Simply click the **▶️ Play button** in the editor, or run:
```bash
uv run main.py
```

That's it! No need to activate the virtual environment manually - `uv run` handles everything automatically.

### Installing Dependencies

When you add dependencies to `pyproject.toml` in the `dependencies` array, run:
```bash
uv sync
```

This will install all dependencies into the virtual environment automatically.

## Installing Dependencies

### Using uv (Recommended)

Add dependencies to `pyproject.toml` in the `dependencies` array, then run:
```bash
uv sync
```

### Using pip (Alternative)

```bash
pip install -r requirements.txt
```

## Project Structure

- `main.py` - Main entry point for your application
- `pyproject.toml` - Project configuration and dependencies (uv format)
- `.python-version` - Python version specification for uv
- `requirements.txt` - Traditional pip dependencies (if needed)

## Next Steps

- Edit `main.py` to add your code
- Add dependencies to `pyproject.toml` as needed
- Consider adding unit tests in a `tests/` directory
- Use type hints and docstrings for better code documentation