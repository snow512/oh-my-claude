## Enhance & Improve

Actively modify existing source code to raise quality.
Operates in 3 modes, each with a different focus.

---

### Mode 1: Harden (보강해)

Improve the **robustness and completeness** of existing code. Keep the functionality intact — just make it more solid.

#### Review dimensions

| Dimension | Examples |
|-----------|---------|
| **Error handling** | Missing try/catch, unhelpful error messages, errors not surfaced to the user |
| **Edge cases** | Empty arrays, null, undefined, empty strings, 0, network failures, timeouts |
| **Data validation** | Unvalidated inputs, type mismatches, out-of-range values, no SQL/XSS protection |
| **Loading/error states** | No loading UI, blank screen on error, no retry mechanism |
| **Concurrency** | Race conditions, duplicate requests, unhandled optimistic updates |
| **Performance** | Bloated bundle size, unused code/packages (`depcheck`, `knip`), unoptimized images, N+1 queries, missing dynamic imports causing slow initial load |
| **Test coverage** | No tests for core logic, missing edge case tests |

#### Execution order

1. Read all current working code (uncommitted/unpushed changes).
2. Analyze against the dimensions above and identify weak spots.
3. **Fix immediately** — keep existing behavior, make it more robust.
4. Run tests — execute existing ones, and add tests for core logic if none exist.
5. Verify the build.
6. Report what was changed.

---

### Mode 2: Improve (개선해)

Improve the **usability and convenience** of the existing implementation. Focus on user experience, not code-level details.

#### Review dimensions

| Dimension | Examples |
|-----------|---------|
| **User flow** | Unnecessary clicks, non-intuitive navigation, no way to undo |
| **Feedback** | No save success/failure notification, no progress indicator, no explanation for disabled buttons |
| **Error messages** | Raw technical errors exposed, no guidance on how to fix |
| **Defaults** | User must type the same value every time, no memory of recent inputs |
| **Shortcuts / convenience** | No keyboard shortcut for frequently used features, no bulk operations |
| **Responsiveness** | Not mobile-friendly, layout breaks on small screens |

#### Execution order

1. Understand the project's key features and UI flow.
2. **Report the list of improvable items first.**
3. Only act on items the user selects — do not touch anything else.
4. Verify with tests and build after implementation.
5. Report what was changed.

---

### Mode 3: Unify UI (UI개선해)

Align frontend **design consistency and visual coherence**.
While `/clean-ui` focuses on code quality (hardcoded colors, accessibility, etc.),
this mode focuses on **consistency of what the user actually sees**.

#### Review dimensions

| Dimension | Examples |
|-----------|---------|
| **Spacing consistency** | Padding/margin varies page to page, inconsistent card gaps |
| **Typography consistency** | Different font sizes/weights per page, inconsistent heading styles |
| **Color consistency** | Same role, different colors (Button A uses `blue`, Button B uses `#3b82f6`) |
| **Component consistency** | Same function, different components used (Modal in one place, Dialog in another) |
| **Alignment** | Form label alignment mismatch, table header and cell alignment inconsistency |
| **State representation** | Success/error/warning colors differ by page, inconsistent empty state visuals |
| **Responsiveness** | Only certain pages are mobile-unfriendly, inconsistent breakpoints |

#### Execution order

1. Detect the frontend source and identify key pages/components.
2. Analyze the current usage of design tokens (colors, spacing, fonts, etc.).
3. **Report the list of inconsistencies first.**
4. Only act on items the user selects.
5. **Since these are visual changes**, clearly explain before and after for each fix.
6. Verify the build.
7. Report what was changed.

---

### Difference from /simplify, /clean-code, /clean-ui

| Skill | Role | Scope |
|-------|------|-------|
| `/simplify` | Reviewer | Reviews duplication/efficiency, then fixes |
| `/clean-code` | Linter | Style, linting, security |
| `/clean-ui` | UI linter | Code quality (accessibility, hardcoding, etc.) |
| **Harden** | **Fixer** | Error handling, edge cases, adding tests |
| **Improve** | **Product designer** | UX flow, convenience features, feedback |
| **Unify UI** | **Visual designer** | Visual consistency — spacing, colors, fonts |

---

### Notes

- **Only make changes that do not introduce side effects** — this is the top priority for all modes.
- **Harden**: Do not change existing behavior — only make it more robust.
- **Improve**: Always report the list first and let the user choose — never add features unilaterally.
- **Unify UI**: Always report the list first and let the user choose — design preferences are the user's domain.
- Build and test verification is mandatory after changes in all modes.
- Do not commit — only apply changes; let the user commit separately.
