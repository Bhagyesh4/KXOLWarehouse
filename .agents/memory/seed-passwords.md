---
name: Seed password env vars
description: Why ADMIN/MANAGER/OPERATOR_PASSWORD must be Replit secrets, not plain env vars
---

The backend `seed_data()` runs on every startup and reads `ADMIN_PASSWORD`, `MANAGER_PASSWORD`, `OPERATOR_PASSWORD` from env. If these are missing (e.g. deleted from shared env vars), it hashes an empty string `""` and **updates** the existing user rows with that wrong hash, breaking login.

**Why:** These were originally plain env vars in `.replit` shared section. During migration, they were deleted (correctly — passwords shouldn't be plain env vars) but not re-added as secrets. The seeding logic then ran with empty strings.

**How to apply:** Always keep ADMIN_PASSWORD, MANAGER_PASSWORD, OPERATOR_PASSWORD as Replit secrets (not shared env vars). The seeding code at server.py line ~1547 will update hashes if they don't match — so secrets must match what's in the DB.
