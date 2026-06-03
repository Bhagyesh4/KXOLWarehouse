---
name: Python package install (pip into .pythonlibs, not uv)
description: How to add a Python dependency in this repl — uv fails, use pip + requirements.txt
---

Adding a Python package to the backend: do NOT rely on the package-management `installLanguagePackages({language:"python"})` tool. It runs `uv add`, which tries to write into the read-only Nix store and fails with `Permission denied (os error 13)` creating a dir under `/nix/store/.../site-packages`.

**How to apply:** Install with `pip install <pkg> -q --disable-pip-version-check` (it lands in `/home/runner/workspace/.pythonlibs/lib/python3.11/site-packages`, where all existing backend deps live) AND add the pinned line to `backend/requirements.txt`. `start.sh` runs `pip install -r backend/requirements.txt` on every boot, so requirements.txt is the source of truth that makes it persist.

**Why:** This project is not a real uv-managed project — `pyproject.toml` dependencies are empty; the running interpreter resolves packages from `.pythonlibs`, populated by pip via start.sh.
