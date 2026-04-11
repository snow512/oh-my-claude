## Ralph Loop Execution

When the user says "ralph loop" followed by a task description, automatically determine the iteration count and completion condition, then invoke the `/ralph-loop` command from the ralph-loop plugin.

---

### Step 1: Analyze the Task

Extract the task from the user's input and determine the scale and completion condition using the criteria below.

#### Auto-determine Iteration Count

| Task Scale | Criteria | Iterations |
|-----------|----------|-----------|
| **Small** | Single file, simple edit, one bug | 5 |
| **Medium** | Multiple files, one feature, refactoring | 10 |
| **Large** | Full code review, large-scale improvement, multiple features | 20 |

If the user specifies a count explicitly, use it as-is ("just 5 times" → 5).

#### Auto-set Completion Condition (completion-promise)

Extract the done criteria from the task description:

| Task Type | Auto-generated Completion Condition |
|-----------|-------------------------------------|
| Code review / improvement | "Done when all findings are fixed and the build passes" |
| Bug fix | "Done when the bug no longer reproduces and tests pass" |
| Writing tests | "Done when coverage target is met or all critical paths have tests" |
| UI improvement | "Done when all identified UI issues are fixed and the build passes" |
| Feature implementation | "Done when the feature works and basic tests pass" |
| Performance improvement | "Done when the target metric is reached or no further gains are possible" |

---

### Step 2: Execute

```
/ralph-loop "<task description>" --max-iterations <count> --completion-promise "<completion condition>"
```

---

### Examples

**Input:** "ralph loop improve the display component"
```
/ralph-loop "improve the display component" --max-iterations 10 --completion-promise "Done when code quality, accessibility, and performance of the display component are all improved and the build passes"
```

**Input:** "ralph loop review and improve the entire codebase"
```
/ralph-loop "review and improve the entire codebase" --max-iterations 20 --completion-promise "Done when all findings are fixed and the build/tests pass"
```

**Input:** "ralph loop just 5 times, fix the login bug"
```
/ralph-loop "fix the login bug" --max-iterations 5 --completion-promise "Done when the login bug is fixed and no longer reproduces"
```

---

### Notes

- If the task description is unclear, ask the user once for clarification before running.
- If the completion condition is met mid-run, the loop exits early (ralph-loop plugin behavior).
- Use "cancel ralph" (`/cancel-ralph`) to stop the loop at any time.
