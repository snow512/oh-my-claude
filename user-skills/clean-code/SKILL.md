---
name: clean-code
description: >
  코드 정리 — 프로젝트 유형을 자동 감지하여 린팅, 중복 제거, 버그헌팅, 보안 점검 등 클린코드 작업을 수행.
  TS/JS 프로젝트는 ESLint 자동 실행, /simplify로 중복 코드 제거까지 포함.
  트리거: 코드정리해, 코드 정리해, clean code, 린트해, eslint해
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent, Skill
---

## Clean Code

Run clean-code tasks against unpushed commits or unstaged changed files.
If the user says "전체" (all), target the entire project.

---

### Step 1: Project Detection

Check the following from the project root to identify the tech stack.

```bash
# Project root
git rev-parse --show-toplevel

# Check package manager & config files
ls package.json tsconfig.json .eslintrc* eslint.config.* pyproject.toml Cargo.toml go.mod 2>/dev/null
```

**Detection matrix:**

| File / Directory | Result |
|-----------------|--------|
| `tsconfig.json` | TypeScript |
| `package.json` + `.ts`/`.tsx` files | TypeScript (may mix JS) |
| `package.json` + `.js`/`.jsx` only | JavaScript |
| `.eslintrc*` or `eslint.config.*` | ESLint config present |
| `frontend/` + `backend/` | Full-stack (detect each independently) |
| `pyproject.toml` or `requirements.txt` | Python |
| `Cargo.toml` | Rust |
| `go.mod` | Go |

For full-stack projects, detect and process frontend and backend independently.

**Build/lint command detection:**

Check the `scripts` section of `package.json` for available commands.

```bash
# Check lint command
node -e "const p=require('./package.json'); console.log(Object.keys(p.scripts||{}).filter(s=>s.match(/lint|eslint/)).join(','))"

# Check build command
node -e "const p=require('./package.json'); console.log(Object.keys(p.scripts||{}).filter(s=>s.match(/^build$/)).join(','))"

# Check test command
node -e "const p=require('./package.json'); console.log(Object.keys(p.scripts||{}).filter(s=>s.match(/^test$/)).join(','))"
```

---

### Step 2: Identify Target Files

```bash
# Files changed in unpushed commits
git diff --name-only @{upstream}..HEAD 2>/dev/null || git diff --name-only origin/$(git rev-parse --abbrev-ref HEAD)..HEAD 2>/dev/null

# Unstaged / staged changed files
git diff --name-only
git diff --name-only --cached

# Untracked files
git ls-files --others --exclude-standard
```

- Merge all results, **deduplicate** → final target file list
- Exclude: `.env`, `*lock*`, `dist/`, `build/`, `node_modules/`, `.next/`, images, fonts, and other binaries
- If the user says **"전체"**: target everything under `src/` (or the appropriate source directory for the project)

---

### Step 3: Run Linter

Check for a linter configuration and run it.

**If no linter config exists:**

First check `skills.clean-code.linterDeclined` in `.claude/settings.local.json`.
If the user has previously declined, skip the linter step without asking again.

If this is the first time, ask the user:
> "No linter config found for this project. Would you like to install one? (Sets up a sensible default for the project type)"

If the user agrees:
- JS/TS: run `npm init @eslint/config@latest`
- Python: `pip install ruff` + create `ruff.toml`
- Run the linter after installation

If the user declines:
- Record in `.claude/settings.local.json` to avoid asking again:
  ```json
  { "skills": { "clean-code": { "linterDeclined": true } } }
  ```
- Skip the linter step

**Full-stack projects:**
If frontend and backend each have their own linter, run them independently.

```bash
# Extract changed TS/JS files
CHANGED_FILES=$(echo "$ALL_FILES" | grep -E '\.(ts|tsx|js|jsx)$')

# Run ESLint in the appropriate directory
npx eslint $CHANGED_FILES
```

**ESLint result handling:**
- If there are errors → try `npx eslint --fix` → re-validate
- If unfixable errors remain → report to the user
- If only warnings → fix with `npx eslint --fix`
- 0 errors, 0 warnings → pass

**Framework-specific ESLint notes:**
- **React/Next.js**: `react-hooks/exhaustive-deps` warnings are often intentional — understand the context before acting
- **NestJS**: DI patterns can trigger false `no-unused-vars` warnings — understand the pattern before fixing
- **Monorepo**: Root and package-level ESLint configs may differ — run against the nearest config file

---

### Step 4: Code Analysis

**Read all target files** and analyze from the following angles.
Use the Agent tool for parallel analysis to improve efficiency.

#### Checklist

| # | Category | What to check |
|---|----------|---------------|
| 1 | **Bug hunting** | Unhandled null/undefined, off-by-one errors, missing async error handling, race conditions, memory leaks (unremoved event listeners), potential infinite loops |
| 2 | **Conventions** | Naming consistency, file/function structure, import order, unnecessary comments, coding style uniformity |
| 3 | **Preventive fixes** | Insufficient type safety (`any` overuse), missing boundary checks, absent optional chaining, missing empty array/object guards |
| 4 | **Log coverage** | Missing error logs in catch blocks, absent debug info at critical branch points |
| 5 | **Performance** | Unnecessary re-renders, N+1 query patterns, missing pagination for large datasets |
| 6 | **Security** | XSS possibilities, SQL injection, exposed sensitive data, missing auth/authz |

**Framework-specific additional checks:**

- **React/Next.js**: useEffect dependency arrays, missing key props, unnecessary re-renders, Server/Client Component confusion
- **NestJS**: Missing Guards/Interceptors, DTO validation not applied, circular dependencies
- **Express/Fastify**: Middleware order, missing error handlers, unwrapped async handlers
- **Python**: Missing type hints, bare except, mutable default arguments
- **General**: Hardcoded env vars, magic numbers/strings

---

### Step 5: Report Findings

```
## Code Analysis Results

Project: {project type} ({detected stack})
Scope: {N} files

### ESLint (if applicable)
- errors: {N} ({M} auto-fixed)
- warnings: {N}

### Findings ({total count})

#### 🐛 Bug Hunting ({N})
- `file:line` — description [critical|warning|info]

#### 📐 Conventions ({N})
...

(Omit categories with 0 findings)
```

---

### Step 6: Apply Fixes

- Proceed with fixes immediately after the report — no user confirmation needed
- However, if there are `[critical]` issues, notify the user and confirm the fix approach first
- **Do not change behavior** — only improve code quality (functionality must remain identical)

---

### Step 7: Deduplicate with /simplify

After fixes are applied, invoke the `/simplify` skill for additional cleanup.
Three review agents (code reuse, code quality, efficiency) run in parallel and fix any issues found.

What `/simplify` finds:
- Duplicate logic → extract into shared utilities
- Remove unnecessary wrappers/abstractions
- Merge copy-paste code
- Improve inefficient patterns

---

### Step 8: Build & Test Verification

Run the commands appropriate for the detected project.

```bash
# Build (use detected command)
npm run build    # or detected build script

# Test (if available)
npm test         # or detected test script
```

If build or tests fail → revert the changes and report the cause.

---

### Step 9: Fix Summary

```
## Code Cleanup Complete

Project: {project type}
Fixed: {N} / Skipped: {M}
ESLint: ✅ {N} auto-fixed
/simplify: ✅ {N} improved
Build: ✅ passed
Tests: ✅ {passed}/{total} passed

### Changes
- `file` — summary of changes
```

---

### Notes

- **No behavior changes** — never make a fix that alters how the code behaves
- **No heavy refactoring** — do not restructure files or introduce large abstractions
- **Do not commit** — only apply fixes; let the user commit separately
- **Roll back on build/test failure** — if changes break anything, revert them
- Skip the ESLint step if no ESLint config exists (do not force installation)
- Skip false positives from `/simplify`
