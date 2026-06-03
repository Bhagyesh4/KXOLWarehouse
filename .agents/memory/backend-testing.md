---
name: backend testing (pytest + hermetic FastAPI)
description: How to install pytest and run hermetic in-process tests of the FastAPI backend without Postgres/auth.
---

# Installing pytest
- `installLanguagePackages({language:"python", packages:["pytest"]})` FAILS: uv tries to write into the read-only nix store (`Permission denied`).
- Working install: `PIP_USER=0 pip install --target=/home/runner/workspace/.pythonlibs/lib/python3.11/site-packages <pkg>` — that's where the other backend deps (fastapi, asyncpg, …) live.
- Plain `pip install --target ...` errors with "Can not combine '--user' and '--target'"; set `PIP_USER=0` to disable the implicit --user.

# Hermetic FastAPI tests (no live DB / no seeded auth)
**Why:** the app's startup event seeds the DB and `get_user`/endpoints hit asyncpg; both need a live Postgres + JWT, which we don't want in unit tests.
**How to apply:**
- Use `TestClient(server.app)` WITHOUT the `with` context manager — the `with` form runs lifespan/startup (DB seeding) and will fail. Plain construction skips startup/shutdown.
- Override auth: `server.app.dependency_overrides[server.get_user] = fake_get_user`. `require_role(...)` depends on `get_user`, so overriding `get_user` satisfies role checks too.
- Stub the DB: monkeypatch `db.get_pool` (server imports it as `_db`) to return a fake pool whose `acquire()` is an async context manager yielding a fake conn implementing `fetchrow`/`execute`.
- `_validate_sku_fields` runs before any DB call, so validation-failure tests never touch the pool.
- `bags_per_pallet` is an int pydantic field: a decimal value → HTTP 422 (parsing), while zero/negative ints → HTTP 400 (validator). Assert the distinct codes.
- Backend tests need `backend/` on sys.path (server does `import db`); conftest inserts it.
