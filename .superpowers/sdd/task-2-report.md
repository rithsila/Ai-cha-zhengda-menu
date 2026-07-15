# Task 2 Report — C1: server-side PIN auth for admin routes

## Status: BLOCKED (all code work complete and verified; git commit could not be created)

## What was done

Followed the brief in `.superpowers/sdd/task-2-brief.md` exactly, using TDD (test written and run to red before implementation).

### Step 1–4: API auth (apps/api)

- Created `apps/api/tests/auth.test.ts` verbatim from the brief (7 assertions: 3 for `POST /api/auth/staff-login`, 3 for `requireManager`-guarded routes via `/api/config` and `/api/analytics/sales`, plus the pre-existing `GET /` test in `app.test.ts`).
- Ran `npm test` — confirmed 5 of 7 new assertions failed as expected (404 on the missing login route, 200 on the then-unprotected `/api/config` and `/api/analytics/sales`).
- Implemented in `apps/api/src/app.ts`:
  - `import type { Request, Response, NextFunction } from 'express';` added to the top-level imports.
  - `staffPin()`, `managerPin()`, `requireManager` middleware, and `POST /api/auth/staff-login` added near the top of `createApp()`, right after `app.use(cors())`.
  - `requireManager` applied to: `PUT /api/config`, `POST /api/rewards`, `PUT /api/rewards/:id`, `DELETE /api/rewards/:id`, `GET /api/analytics/sales`, `PUT /api/users/:telegramUserId/points`.
- Re-ran `npm test` — all 7 tests pass.

### Step 5: Staff frontend (apps/staff)

- `apps/staff/src/App.tsx`:
  - `StaffLogin`: removed the `VITE_STAFF_PIN` client-side check; `handleSubmit` now POSTs to `http://localhost:4000/api/auth/staff-login` with `{ pin, role: 'staff' }` and calls `onLogin()` only on a 200 response.
  - `ManagerLogin`: prop changed to `{ onLogin }: { onLogin: (pin: string) => void }`; removed the `VITE_MANAGER_PIN` check; `handleSubmit` POSTs with `role: 'manager'` and calls `onLogin(pin)` on success.
  - `App`: replaced the `isManagerAuthenticated` boolean state with `managerPin` string state; render logic now does `managerPin ? <ManagerDashboard managerPin={managerPin} /> : <ManagerLogin onLogin={setManagerPin} />`.
- `apps/staff/src/components/ManagerDashboard.tsx`:
  - Signature changed to `ManagerDashboard({ managerPin }: { managerPin: string })`.
  - Analytics fetch now sends `'x-manager-pin': managerPin` header.
  - `handleSavePoints` fetch now sends `'x-manager-pin': managerPin` header alongside `Content-Type`.
  - **Deviation from the brief's literal snippet**: instead of leaving `fetchDashboardData` as a standalone function declared outside `useEffect` and only editing the dependency array, I moved the function body inside the `useEffect` callback. Rationale: `fetchDashboardData` now closes over `managerPin`, and it isn't called from anywhere else in the component (verified by search), so inlining it avoids a stale-closure/exhaustive-deps hazard without changing behavior. The dependency array is `[managerPin]` as instructed. Flagging this as a suggestion-level deviation per the "mention, don't silently change" scope rule — happy to revert to the literal standalone-function form if preferred.

### Step 6: Env examples

- `apps/api/.env.example`: appended the `STAFF_PIN` / `MANAGER_PIN` block verbatim from the brief.
- `apps/staff/.env.example`: replaced entire contents with the brief's verbatim two-line note (PINs moved to API server).

### Step 7: Verification

- `cd apps/api && npm test` → **7/7 passed** (2 test files: `app.test.ts`, `auth.test.ts`).
- `cd apps/staff && npm run build` → passed (`tsc -b && vite build`, `dist/` produced, no errors).
- `cd apps/staff && npm run lint` → passed (`oxlint`, exit code 0, no findings).
- Grepped the whole `apps/` tree for `VITE_STAFF_PIN`, `VITE_MANAGER_PIN`, `isManagerAuthenticated` — no stale references remain.
- Confirmed `apps/menu/src/components/AccountView.tsx` (out of scope) is untouched — `git status` shows it clean, no diff.

## Self-review notes

- Scope respected: only touched `apps/api/src/app.ts`, `apps/api/tests/auth.test.ts` (new), `apps/staff/src/App.tsx`, `apps/staff/src/components/ManagerDashboard.tsx`, `apps/api/.env.example`, `apps/staff/.env.example`. Did not touch `AccountView.tsx`, `CheckoutModal.tsx`, or any `apps/menu` files.
- `requireManager` compares `req.headers['x-manager-pin']` directly against `process.env.MANAGER_PIN || '9999'` — a plain string equality check as specified in the brief. This is not constant-time comparison, but the brief specifies this exact implementation and it matches the existing threat model (a shop-floor PIN gate, not a high-value secret) — flagging as a suggestion only, not changing it since it was specified verbatim.
- `POST /api/auth/staff-login` and `requireManager` have no rate limiting, so repeated PIN guesses over the network are possible. Same reasoning as above — out of scope for this task's literal spec, flagged as a suggestion for a follow-up task.
- Default PINs (`1234` / `9999`) are still hardcoded fallbacks when env vars are unset, exactly as specified in the brief — preserves current dev-mode behavior but is worth remembering before any real deployment.

## Blocker: git commit

Staged exactly the six files listed in the brief's Step 8:
```
git add apps/api/src/app.ts apps/api/tests/auth.test.ts apps/staff/src/App.tsx apps/staff/src/components/ManagerDashboard.tsx apps/api/.env.example apps/staff/.env.example
```
`git status --short` confirms these are staged (`M`/`A`) and nothing else.

Running `git commit -m "fix(security): verify staff/manager pins server-side and guard admin routes"` fails every time with:
```
error: 1Password: failed to fill whole buffer
fatal: failed to write commit object
```
This repo has global `commit.gpgsign=true` / `gpg.format=ssh` wired to the 1Password SSH agent. The 1Password desktop app is running, but the signing call fails outright on the first two attempts and then hangs (timed out after 2 minutes) on a third — consistent with it waiting on a Touch ID / biometric prompt that requires the user physically present at the machine, which this agent session cannot provide.

Per git safety rules, I did not use `--no-gpg-sign` or `-c commit.gpgsign=false` to work around this, since the user has not explicitly asked for that. **All six files remain staged** and the working tree is otherwise clean (verified with `git status`). No destructive action was taken.

**Action needed from the user**: unlock/authorize 1Password's SSH agent (e.g. approve the pending Touch ID/PIN prompt, or open 1Password and unlock the vault), then either run the commit above or ask me to retry it.

## Fix: handleSavePoints res.ok check

**Code Review Finding:** `handleSavePoints` in `apps/staff/src/components/ManagerDashboard.tsx` (lines 50–62) awaited the PUT `/api/users/:id/points` fetch but never checked `res.ok`. Since the route now returns 401 for wrong `x-manager-pin`, failures were reported as success.

**Fix Applied:** Captured response and branched on `res.ok`:
- If success: show `'Points updated!'`
- If failure: show `'Failed to update points. Please check your Manager PIN.'`
- Unchanged: all alert() calls remain (a later task replaces these with inline messages)

**Build & Lint:**
```
$ npm run build
✓ tsc -b && vite build passed (214 KB gzip)

$ npm run lint
✓ oxlint (no findings)
```

**Commit:** `7b22fbc fix(staff): report points-save failures instead of false success`

**Note on Earlier BLOCKED Status:** The earlier BLOCKED status in this report (lines 3–68) is now stale — both task commits exist: `76e87f5` (main task 2 work) and `7b22fbc` (this fix).
