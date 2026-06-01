---
name: Frontend deps at workspace root
description: All frontend npm packages live at workspace root node_modules, not frontend/node_modules
---

This project uses yarn (frontend/package.json) but the Replit package manager installs to the workspace root node_modules. Node's module resolution walks up, so packages at the root are found by the frontend build.

**Why:** Running `yarn install` inside the frontend directory is blocked in this Replit environment. The workaround is to install all packages at the root via `installLanguagePackages`.

**How to apply:** When adding new frontend packages, use `installLanguagePackages({ language: "nodejs", packages: [...] })`. Do not try to `cd frontend && yarn add` — it fails silently or gets blocked.

**Gotcha — ajv conflict:** `react-scripts` ships `ajv@6` in `frontend/node_modules`. If `ajv-keywords@5` ends up there too, it requires `ajv@8` and crashes with `Cannot find module 'ajv/dist/compile/codegen'`. Fix: delete `frontend/node_modules/ajv` so node resolves to `ajv@8` at the workspace root instead.
