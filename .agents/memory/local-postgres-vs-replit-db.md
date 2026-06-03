---
name: Local Postgres vs Replit-managed DB
description: The WMS backend runs its own local Postgres; executeSql/database skill hits a different DB
---

The backend connects to a **local** Postgres via `DATABASE_URL`, started by
`start.sh`. This is NOT the same database that the `executeSql`
code-execution callback or the `database` skill query — those hit the
Replit-managed Postgres.

**Why:** Running `executeSql("SELECT ... FROM skus")` returned 0 rows while the
app clearly had data, because they point at different databases.

**How to apply:** To inspect/modify the app's real data, use
`psql "$DATABASE_URL" -c "..."` in bash, not `executeSql`. Verify which DB you
are hitting before concluding a table is empty.

Also note: this isolated environment had `seed_locked=1` in `app_meta` and an
empty `skus` table, so seed_data() does not repopulate SKUs. The packaging
backfill block runs on every startup regardless of `seed_locked`, so it still
fills NULL packaging on any pre-existing SKUs.
