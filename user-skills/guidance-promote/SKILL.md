## Guidance Promote

Promote project-level LLM guidance to user (global) level when a rule written in the project's `CLAUDE.md` / `GEMINI.md` / `AGENTS.md` turns out to be broadly useful — not specific to one project — and should apply to every future session.

Triggers: `promote guidance`, `지침승격해`, `이거 글로벌에 올려`, `user guidance 로 옮겨`.

---

### When to use

- The user just wrote a rule in a project's instruction file and says "actually this applies everywhere" / "앞으로 모든 프로젝트에서 이렇게 해줘".
- You notice a project instruction that is clearly generic (not tied to the project's domain / stack / people) and the user asks to lift it.
- A project rule keeps showing up across multiple repos — time to promote once.

### When NOT to use

- The rule references project-specific paths, stacks, branch names, people, or domain language → keep it project-local.
- The user is only experimenting with a rule — promotion is irreversible from the project's perspective (the rule leaves the project file).

---

### Flow

1. **Read the current project instruction file** (`CLAUDE.md` in repo root, or `GEMINI.md` / `AGENTS.md` depending on the provider the user mentioned). If none exists, stop and tell the user.
2. **Identify candidates**:
   - Rules outside any `<!-- <cup...> -->` marker (manually written by the user).
   - Rules that are phrased generically (no project name, no branch name, no stack-specific path).
   - Ask the user which rules to promote — do NOT promote silently.
3. **Pick a target category**: map the rule to one of `language | scope | design | deployment | commit` when possible. If none fits, create a new category id (kebab-case, one-word preferred: `testing`, `review`, `ui`, …).
4. **Preview the change** to the user:
   - Show the exact block that will move.
   - Show the target user instruction file (`~/.claude/CLAUDE.md`, `~/.gemini/GEMINI.md`, or `~/.codex/AGENTS.md`).
   - Show the chosen category and marker.
   - Ask confirmation before editing.
5. **Apply the promotion** (only after confirmation):
   - If the target category already exists as a cup-managed preset (`presets/guidance/<id>.md`): append the rule to the existing block in the user's instruction file so the next `cup guidance init` doesn't overwrite it. Warn the user that running `cup guidance init --categories=<id>` would reset the block to the preset.
   - If it's a brand-new category: wrap the content in `<!-- <cup-guidance-<id>> --> … <!-- </cup-guidance-<id>> -->` markers and append to the user instruction file. Tell the user they can later add a matching preset under `presets/guidance/` if they want `cup` to own it.
   - Remove the promoted block from the project instruction file.
6. **Report**:
   - Source file, destination file, category, and the moved text.
   - Suggest running `cup guidance list` to verify.

---

### Preset-backed vs ad-hoc categories

| Case | Behavior |
|------|----------|
| Target id is in `presets/guidance/index.json` | Append to existing managed block; warn that `cup guidance init` on that category resets the block. Recommend editing `presets/guidance/<id>.md` in the repo instead if the user owns the cup repo. |
| Target id is new | Append a new `<cup-guidance-<id>>` block to the user instruction file. It will show up in `cup guidance list` as `? <id> (unknown category)`. |

---

### Multi-provider awareness

If the user has multiple providers installed (detect via `which claude`, `which gemini`, `which codex`, or existence of `~/.claude/`, `~/.gemini/`, `~/.codex/`), ask which provider's instruction file the rule should go to — or confirm "all installed" if the rule is provider-agnostic.

### Safety

- Never promote a rule that contains secrets, tokens, personal names, or repo-specific paths.
- Always create a timestamped backup of the user instruction file before editing (e.g. copy to `~/.claude/CLAUDE.md.bak.<timestamp>`).
- If the project instruction file is under version control, leave the edit uncommitted so the user can review and commit manually.
