## Documentation & Doc Update

Operates in two modes.

---

### Mode 1: Document (문서화해)

Analyze the source and generate documentation under the `docs/` folder.

1. **Analyze the project**: Read the directory structure, config files, and source code to determine the project type.
2. **Check existing docs**: Read `docs/` if it exists; create it if it doesn't.
3. **Generate docs**: Only create documents that are actually relevant to the project.

**Document types (generate only where applicable):**

| Document | When to generate | Contents |
|----------|-----------------|----------|
| `architecture.md` | Always | Project structure, tech stack, key modules, data flow |
| `setup.md` | Always | Installation, env vars, how to run, dependencies |
| `api.md` | When REST/GraphQL API exists | Endpoints, request/response, authentication |
| `database.md` | When DB/ORM exists | Schema, table relationships (ER), migrations, seeds |
| `deployment.md` | When Docker/CI-CD exists | Deployment methods, per-environment config, scripts |
| `components.md` | When frontend exists | Key components, page structure, state management |

4. **Report results**: Print the list of created/updated documents.

---

### Mode 2: Update Docs (문서정리해 / 문서업데이트 / 문서최신화)

Update existing documentation based on code changes.

1. **Identify changes**:
   ```bash
   git diff --name-only HEAD
   git diff --name-only --cached
   ```
2. **Read existing docs**: Read documents under `docs/`.
3. **Analyze impact**: Map changed files to their corresponding documents.

| Change type | Document to update |
|------------|-------------------|
| API routes / controllers | `api.md` |
| DB schema / migrations / entities | `database.md` |
| package.json / docker / CI | `setup.md`, `deployment.md` |
| Component / page additions or deletions | `components.md` |
| Directory structure changes | `architecture.md` |
| No impact | Print "No doc update needed" and exit |

4. **Update docs**: Make minimal edits to only the affected sections.
5. **Report results**: Summarize which documents were modified and what changed.

---

### Integration with commit-push

Called automatically by the `/commit-push` skill just before committing (Mode 2).
Any modified doc files are included in the same commit.
Skipped for projects that have no `docs/` folder.

---

### Plan Documents

When entering plan mode (EnterPlanMode) or when the user explicitly asks to plan/design, write the plan to `docs/plans/`.

- File naming: `docs/plans/YYYY-MM-DD-<topic>.md`
- Include: goal, approach, steps, file impact, risks
- If a design spec is produced by a brainstorming skill, save it to `docs/specs/YYYY-MM-DD-<topic>-design.md`
- Plans and specs are committed along with the implementation

---

### Notes

- Preserve the existing documents' style and language.
- If "update docs" is triggered in a project with no existing docs, prompt: "Run 'document' first."
- Do not touch `README.md` — that is the user's domain.
- Do not create empty documents — omit a document if there is nothing to write.
