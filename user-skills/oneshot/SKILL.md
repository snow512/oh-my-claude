## One-shot Implementation

Take user requirements and run the full pipeline — **plan → implement → verify → commit** — automatically.
Repeat the quality loop until no issues remain to guarantee completeness.

---

### Overall Flow

```
┌──────────┐   ┌──────────┐   ┌──────────────┐   ┌──────┐   ┌──────┐
│ 1. Plan  │─▶│ 2. Impl. │─▶│ 3. Quality   │─▶│ 4. Test │─▶│ 5. Commit │
│          │  │          │  │ Loop (repeat)│  │ Loop    │  │ & Push    │
└──────────┘   └──────────┘   └──────────────┘   └──────┘   └──────┘
                    ▲                 │               │
                    │                 ▼               ▼
                    └──────────fix & retry────────────┘
```

---

### Step 1: Plan

1. **Parse requirements**
   - Analyze the user input to derive implementation goals
   - If anything is unclear, ask (use `AskUserQuestion` for ambiguity)

2. **Scope analysis**
   - Identify related files / components / APIs (use Grep, Glob, Agent Explore)
   - Understand existing code patterns

3. **Save the plan document**
   - Path: `docs/plans/YYYY-MM-DD-<topic>.md`
   - Required sections:
     - **Goal** — one-line objective
     - **Architecture** — approach
     - **Files** — to create / modify
     - **Tasks** — checklist of work items
     - **Risks** — things to watch out for

4. **TaskCreate the work list** — register each task for tracking

5. **Report plan summary to the user** — one short paragraph (the full plan is in the file)
   - Simple work → proceed directly to Step 2
   - Complex or architectural decisions → use `AskUserQuestion` for approval

---

### Step 2: Implement

1. **TDD first** — write tests before code when possible
2. Implement each task sequentially
3. Independent tasks can be dispatched in parallel via `Agent` (sequential for any that touch the same file)
4. Mark tasks complete with `TaskUpdate` as they finish
5. Follow existing patterns / conventions when making changes

---

### Step 3: Quality Loop — repeat until zero issues

**Loop:**

```
iteration = 0
while iteration < 5:
    iteration += 1

    # A. ESLint
    run `npm run lint` (or project-specific)
    if errors exist → auto-fix → if still errors → report and stop

    # B. Bug Hunt (parallel analysis via Agent)
    dispatch Explore agent with bug hunting prompt
    if critical / warning found → fix → continue (loop)

    # C. Clean UI (only if frontend changed)
    invoke /clean-ui skill logic
    if must / should issues found → fix → continue

    # D. No issues found → break
    break

if iteration >= 5:
    report to user: "5 iterations and issues remain, manual review needed"
```

**Rules:**
- **False positive filtering**: re-evaluate each reported issue (skip YAGNI, already-handled, etc.)
- **No behavior changes**: only code quality improvements
- **Build check**: run `npm run build` after each fix

---

### Step 4: Test Loop — repeat until passing

1. **Check for test files**
   - Look for related `__tests__/*.test.ts` files
   - Create if missing, update if present (cover new features)

2. **Run tests**
   ```bash
   npm test   # or the project's test command
   ```

3. **On failure:**
   ```
   test_iteration = 0
   while tests fail and test_iteration < 3:
       test_iteration += 1
       analyze cause → fix code / test
       → re-run Step 3 (Quality Loop)
       → re-run tests

   if test_iteration >= 3:
       report to user: "3 attempts and tests still fail, manual debugging needed"
   ```

4. **Passing → next step**

---

### Step 5: Final Build Verification

```bash
npm run build
```
- Failure → re-run from Step 3
- Success → prepare to commit

---

### Step 6: Commit & Push

1. **Check current branch**
   ```bash
   git rev-parse --abbrev-ref HEAD
   ```
   - `develop` is the default. Otherwise confirm with the user.

2. **Call the `/commit-push` skill** — auto-generates the commit message and pushes to the current branch

3. **⚠️ Important: NEVER do automatically**
   - Merge / PR into `qa`, `main`, `master` branches
   - Production deploys (`vercel deploy --prod`, etc.)
   - Follow the CLAUDE.md rule: "deploys only on explicit user instruction"

---

### Step 7: Final Report

```
## One-shot Implementation Complete

### Summary
- Feature: {name}
- Plan doc: `docs/plans/YYYY-MM-DD-<topic>.md`
- Modified files: N
- Tests: {passed}/{total} passing
- Quality loops: {N} iterations
- Test loops: {M} iterations

### Changes
- `file1` — change summary
- `file2` — change summary

### Commit
- {commit_sha}: {commit_message}
- Pushed branch: develop

### Next Steps
- QA deploy: "push to qa"
- Production deploy: "PR to main"
```

---

### Rules & Guardrails

- **No code changes without a plan** — always start from Step 1
- **No automatic deploys** — merges to qa/main require explicit user instruction
- **No infinite loops** — Quality loop max 5, Test loop max 3
- **Respect user interrupts** — stop immediately on "그만", "stop", "중단", etc.
- **Re-evaluate false positives** — don't blindly fix everything an Agent reports; judge whether it's a real bug/improvement
- **Progress tracking** — continuously update via TaskCreate / TaskUpdate
- **Reuse existing skills** — leverage `/clean-code`, `/clean-ui`, `/commit-push`, etc.

---

### When NOT to Use

- Single-line fixes, typos → use `/enhance` or edit directly
- Exploratory brainstorming → start with `superpowers:brainstorming`
- Large architectural changes → use `superpowers:writing-plans` to create a plan first, review, then proceed

---

### Integration with Other Skills

- **writing-plans** (superpowers): complex work may call this skill's plan engine
- **clean-code, clean-ui**: the Quality loop reuses their logic
- **commit-push**: called during the final commit step
- **doc-structure**: auto-called inside `commit-push` so docs stay in sync
