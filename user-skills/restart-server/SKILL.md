## Restart / Stop Dev Server

Restart or stop the development server for the current project.
Auto-detects the project type and handles it accordingly.

- "restart server" → stop + start
- "stop server" → stop only

### Bundled Scripts

- `scripts/detect-project.sh` — detects project type, ports, and directory structure
- `scripts/stop-by-port.sh` — gracefully stops then force-kills processes on specified ports
- `scripts/check-ports.sh` — checks which ports are in LISTEN state

---

### Step 1: Detect Project

```bash
${CLAUDE_SKILL_ROOT}/scripts/detect-project.sh
```

This script outputs the project type (Docker, full-stack, single, Python, Go, etc.), ports, and directories.

---

### Step 2: Stop Existing Processes

Try in priority order:

1. **`stop.sh` exists** → run `./stop.sh`
2. **Docker** → run `docker compose down` or `docker compose stop`
3. **Port-based**:
   ```bash
   ${CLAUDE_SKILL_ROOT}/scripts/stop-by-port.sh <port1> <port2> ...
   ```

If in "stop server" mode, finish here.

---

### Step 3: Start Server

Branch based on project type.

#### A. Script-based (`server.sh` / `client.sh` exist)

```bash
./server.sh &   # background
sleep 5
./client.sh &   # background
```

#### B. Node.js (package.json-based)

| Project Type | Command |
|-------------|---------|
| Full-stack (root dev uses concurrently) | `npm run dev` |
| Full-stack (split) | Backend: `npm run start:dev` or `npm run dev`, Frontend: `npm run dev` |
| Frontend only | `npm run dev` |
| Backend only | `npm run start:dev` or `npm run dev` |
| Single server | `npm start` or `node server.js` |

#### C. Python

| Framework | Command |
|-----------|---------|
| Django | `python manage.py runserver` |
| Flask | `flask run` or `python app.py` |
| FastAPI | `uvicorn main:app --reload` |

#### D. Go

```bash
go run .
```

#### E. Docker

```bash
docker compose up -d
```

For Docker + local server combinations, bring up Docker (DB, etc.) first, then start the server.

---

### Step 4: Verify Startup

```bash
${CLAUDE_SKILL_ROOT}/scripts/check-ports.sh <port1> <port2> ...
```

```
Server restart complete!
- Backend: port XXXX ✓
- Frontend: port XXXX ✓
```

---

### Step 5: Offer to Create Missing Scripts

If this is a full-stack project but `server.sh`, `client.sh`, or `stop.sh` are missing:

> "This project has no server management scripts. Generate them automatically for next time?"

If the user agrees, generate scripts tailored to the project structure:
- Reflect detected port numbers, directory paths, and Docker usage
- Include PID file management
- Apply `chmod +x` to make them executable

---

### Notes

- For projects that require Docker (DB, etc.), start Docker first.
- On port conflicts: graceful kill first, then force kill.
- CLI-only projects (`bin/` structure) have no server — print an informational message only.
