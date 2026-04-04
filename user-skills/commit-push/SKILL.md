---
name: commit-push
model: sonnet
description: >
  현재 변경사항을 커밋하고 푸시. 커밋 전에 프로젝트에 맞는 린터를 자동 실행하여 깨끗한 코드만 커밋.
  트리거: 커밋 푸쉬해, 커푸, 커밋해, 커밋만해, commit, push
allowed-tools: Bash, Read, Glob, Grep, Edit, Write
---

## Commit & Push

Commit and push the current changes.
Automatically run the appropriate linter for the project before committing to ensure only clean code is committed.

### Modes

- **Commit + Push** (default): "커푸", "커밋 푸쉬해" → commit, then push
- **Commit only**: "커밋해", "커밋만해" → commit only, no push

---

### Step 1: Check Status

```bash
git status
git diff --stat
git diff --stat --cached
git log --oneline -5
```

If there are no changes → print "Nothing to commit." and exit.

---

### Step 2: Detect Project & Run Linter

If any source code files are among the changed files, run the linter for that project.

**If no linter config exists:**
First check `skills.commit-push.linterDeclined` in `.claude/settings.local.json`.
If the user has previously declined, skip without asking again.

If this is the first time, ask whether to install. If they agree, install and run. If they decline, record in `settings.local.json`:
```json
{ "skills": { "commit-push": { "linterDeclined": true } } }
```

**Detection:**

```bash
# Extract changed source files
CHANGED=$(git diff --name-only HEAD; git diff --name-only --cached; git ls-files --others --exclude-standard)

# Check linter configs
ls .eslintrc* eslint.config.* 2>/dev/null    # ESLint (JS/TS)
ls pyproject.toml setup.cfg .flake8 2>/dev/null  # Python linters
ls .golangci.yml 2>/dev/null                  # Go
```

**Linter execution rules:**

| Project type | Linter | Run condition |
|--------------|--------|---------------|
| JS/TS (ESLint config present) | `npx eslint <files>` | When `.ts`, `.tsx`, `.js`, `.jsx` files changed |
| Python (ruff/flake8 config present) | `ruff check <files>` or `flake8 <files>` | When `.py` files changed |
| Go (golangci-lint config present) | `golangci-lint run <files>` | When `.go` files changed |

**Full-stack projects:** If multiple directories have independent linter configs, run each separately. Pass only the changed files within that directory.

**Linter result handling:**
- Errors → try `--fix` (or the linter's auto-fix option) → re-validate
- If unfixable errors remain → report to the user and **abort the commit**
- Warnings only → auto-fix and proceed
- Clean → pass

---

### Step 3: Update Docs (projects with a docs/ folder)

If a `docs/` folder exists, call the `doc-structure` skill in mode 2 (update docs).
Analyze whether the changed code affects the documentation and update it if needed.
Updated doc files will be included in the commit.

Skip this step if there is no `docs/` folder.

---

### Step 4: Commit

Analyze the changes and write a commit message.

**Commit message rules:**
- Conventional Commits prefix: `fix:`, `feat:`, `refactor:`, `docs:`, `chore:`, `style:`, `test:`, etc.
- Keep it concise (1–2 lines)
- If the scope of changes is broad, list the key changes in the body
- Include `Co-Authored-By: Claude <noreply@anthropic.com>`

**Commit message language:**
- Follow the language used in the project's existing commit log (check with `git log --oneline -10`)
- Korean if existing commits are in Korean, English if they are in English

**Staging:**
- Add changed files explicitly by name with `git add`
- Do not use `git add -A` — prevents accidentally including unintended files
- Also stage any files auto-fixed by the linter's `--fix`

```bash
git add <file1> <file2> ...
git commit -m "$(cat <<'EOF'
feat: commit message here

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Step 5: Push (Commit + Push mode)

If not in "commit only" mode, run `git push`.

```bash
git push
```

If no remote or upstream is configured:
```bash
git push -u origin $(git rev-parse --abbrev-ref HEAD)
```

---

### Notes

- Never commit sensitive files: `.env`, `.env.*`, credentials, secrets, etc.
- Commit lock files (`package-lock.json`, `yarn.lock`, etc.) if they have changes
- Skip linting if no linter config exists (do not force installation)
- Never force push
- If a pre-commit hook fails, diagnose and fix the root cause (never use --no-verify)
