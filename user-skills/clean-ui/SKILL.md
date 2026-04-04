---
name: clean-ui
description: >
  프론트엔드 UI 코드 품질 점검 — 하드코딩 색상, 디자인 토큰, 컴포넌트 패턴, 접근성,
  CSS 구조, 성능 등 UI 특화 정리. /simplify로는 잡지 못하는 UI 전문 체크.
  트리거: UI정리해, ui정리해, clean ui, 유아이정리해, 프론트정리해
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent
---

## Clean UI

Inspect and fix UI code quality in changed frontend files.
If the user says "전체" (all), target the entire frontend source.

---

### Step 1: Detect Frontend Source

```bash
ls -d frontend/src client/src src/app src/pages src/components 2>/dev/null
```

If no frontend source is found → print "No frontend source found." and exit.

---

### Step 2: Identify Target Files

```bash
git diff --name-only @{upstream}..HEAD 2>/dev/null
git diff --name-only
git diff --name-only --cached
git ls-files --others --exclude-standard
```

- Filter to `.tsx`, `.jsx`, `.ts`, `.css`, `.scss` files under the detected frontend directory
- Exclude: `dist/`, `node_modules/`, `.test.`, `.spec.`, `__tests__/`, `__stories__/`

---

### Step 3: UI-Specific Analysis

Read all target files and analyze from the angles below. Use Agent for parallel analysis.

#### A. Component Structure & Patterns

| # | Check | Why |
|---|-------|-----|
| 1 | **Single responsibility** | If one component handles data fetching, state management, and UI rendering all at once, split it. Use Container/Presentational pattern or custom hooks |
| 2 | **Component size** | Over 200 lines → suggest decomposing into sub-components |
| 3 | **Raw HTML** | Direct use of `<button>`, `<input>`, `<select>` → use the project's shared components if they exist. Exempt wrapper internals |
| 4 | **Inline sub-components** | Components defined inside render functions → recreated on every render, causing performance issues. Extract to file level |
| 5 | **Reusability** | Same or similar JSX block repeated in 2+ places → extract as a shared component. Exempt single-use patterns |
| 6 | **Props design** | Overuse of boolean props (`isLarge`, `isPrimary`, etc. — 3 or more) → consolidate into a variant/size enum |

#### B. CSS & Styling

| # | Check | Why |
|---|-------|-----|
| 7 | **Hardcoded colors** | Direct use of hex/rgb/rgba/hsl → use CSS variables (`var(--color-*)`) or theme tokens. Name by semantic meaning (error, primary — not red) |
| 8 | **Magic numbers** | Literal values like `padding: 24px`, `gap: 12px` → use design tokens or spacing variables. Maintain a consistent 4px/8px grid |
| 9 | **Inline styles** | `style={{}}` that could be CSS classes → move to classes. Only allow inline styles for truly dynamic values (e.g. computed widths) |
| 10 | **CSS selector depth** | Nesting 3+ levels deep (`.a .b .c .d`) → flatten selectors. Deep nesting hurts both maintainability and performance |
| 11 | **Unused styles** | CSS classes defined but never referenced → remove. Dead CSS only bloats the bundle |
| 12 | **Class naming** | Names based on appearance (`.red-box`) → name by purpose (`.error-container`). Visual appearance changes; purpose stays stable |

#### C. Accessibility (a11y)

| # | Check | Why |
|---|-------|-----|
| 13 | **Color contrast** | Text/background contrast below 4.5:1 → fails WCAG AA. Large text requires 3:1 |
| 14 | **Alt text** | `<img>` tags without alt → screen reader users receive no information |
| 15 | **Semantic HTML** | `<div onClick>` → `<button>`. Use native interactive elements for clickable targets. Ensures keyboard navigation |
| 16 | **Form labels** | `<input>` missing a linked `<label>` or `aria-label` → assistive technology cannot identify the field's purpose |
| 17 | **Focus management** | Missing focus trap in modals/dropdowns; `outline: none` with no alternative focus indicator |

#### D. Performance

| # | Check | Why |
|---|-------|-----|
| 18 | **Inline function/object props** | `onClick={() => ...}` or `style={{ ... }}` passed as child props → creates a new reference on every render, causing unnecessary re-renders (React 19 compiler helps, but being explicit is clearer) |
| 19 | **List key** | `key={index}` → use a stable unique ID. Index keys cause incorrect re-renders when item order changes |
| 20 | **Image optimization** | `<img>` without width/height → causes CLS (Cumulative Layout Shift). Use next/image or specify explicit dimensions |
| 21 | **Conditional rendering** | Heavy components conditionally rendered with `&&` → mounted/unmounted every time. Consider `display: none` or lazy loading if toggled frequently |

---

### Framework-Specific Checks

**React (19+):**
- useEffect is a last resort — use server components or libraries for data fetching
- Use the `use()` hook to consume Promises/Context directly — remove unnecessary useEffect + useState patterns
- Check Server/Client Component boundaries — using browser APIs without `'use client'` causes errors

**Vue:**
- Missing key on v-for
- Unnecessary recomputation due to not using computed properties

**Tailwind projects:**
- Use utility classes where possible instead of custom CSS
- Excessive `@apply` → component extraction may be a better solution

**CSS Modules / Styled Components:**
- Unused style definitions
- If there are many dynamic styles, consider CSS variables + data attributes instead of CSS-in-JS

---

### Step 4: Report Findings

```
## UI Analysis Results

Frontend: {detected directory}
Scope: {N} files

### Findings ({total count})

#### A. Component Structure ({N})
- `file:line` — description [must|should|nice]

#### B. CSS & Styling ({N})
...

#### C. Accessibility ({N})
...

#### D. Performance ({N})
...

(Omit categories with 0 findings)
```

---

### Step 5: Apply Fixes

- Proceed with fixes immediately after the report
- If a `[must]` fix requires a file structure change, confirm with the user first
- **Do not alter rendered output** — only improve code quality, never change functionality
- Keep accessibility fixes visually minimal (add aria attributes, replace with semantic tags, etc.)
- Verify the build after fixes

---

### Step 6: Fix Summary

```
## UI Cleanup Complete

Fixed: {N} / Skipped: {M}
Build: ✅ passed

### Changes
- `file` — summary of changes
```

---

### Notes

- No over-abstraction — do not extract single-use patterns into components
- Do not commit — only apply fixes; let the user commit separately
- Exclude showcase/Storybook files from duplication checks — repetition is intentional there
- Keep accessibility fixes within bounds that don't break the existing design
