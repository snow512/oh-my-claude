## Parallel Workspace Management

Clone the same project into multiple directories and develop each independently in parallel.
Uses hard clone instead of git worktree — each workspace is a fully independent git repository.

### Bundled Scripts

This skill includes shell scripts in the `scripts/` directory:
- `scripts/create-workspace.sh` — clone + port assignment + env setup + dependency install
- `scripts/list-workspaces.sh` — list sibling workspaces sharing the same remote
- `scripts/detect-ports.sh` — extract port information from `.env` files

---

### Mode 1: Create Workspace

```bash
${CLAUDE_SKILL_ROOT}/scripts/create-workspace.sh <workspace-name> [branch-name] [port-offset]
```

Ask the user for a workspace name, and optionally a branch name.
Port offset is auto-detected based on the number of existing workspaces.

**What the script does:**
1. `git clone` from the same remote into a sibling directory
2. Create / check out the branch
3. Copy the original `.env` file and increment ports by the offset (base + N*10)
4. Append a workspace suffix to Docker container/volume names
5. Install dependencies (`npm install`, `pip install`, etc.)

**Before running:**
- Run `scripts/detect-ports.sh` first to understand the current port layout
- Confirm the name and port range with the user before proceeding

---

### Mode 2: List Workspaces

```bash
${CLAUDE_SKILL_ROOT}/scripts/list-workspaces.sh
```

Print a summary of each workspace: branch, uncommitted change count, and ports in use.

---

### Mode 3: Delete Workspace

Use "delete workspace" to clean up workspaces that are no longer needed.

1. Show the list with `scripts/list-workspaces.sh`
2. Ask the user to confirm which workspace to delete
3. Warn if there are uncommitted changes
4. Clean up Docker: `docker compose down -v`
5. Remove the directory

---

### Notes

- Never delete the original workspace.
- The `.env` file must be in `.gitignore`.
- Use distinct Docker container/volume names per workspace to avoid conflicts.
