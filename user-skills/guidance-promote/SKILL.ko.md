## Guidance Promote

프로젝트의 instruction file (`CLAUDE.md` / `GEMINI.md` / `AGENTS.md`) 에 쓰여 있는 LLM 지침 중 **특정 프로젝트에 국한되지 않고 앞으로 모든 프로젝트에 적용하고 싶은 rule** 을 user (global) 영역으로 승격(promote) 하는 skill.

트리거: `promote guidance`, `지침승격해`, `이거 글로벌에 올려`, `user guidance 로 옮겨`.

---

### 언제 사용

- 사용자가 프로젝트 instruction file 에 방금 rule 을 쓰고 "이거 모든 프로젝트에 적용해줘" 라고 할 때.
- 프로젝트 rule 이 명백히 generic(도메인/스택/사람에 종속되지 않음) 해서 사용자가 승격을 요청할 때.
- 동일한 rule 이 여러 repo 에 반복 등장 → 한 번에 promote.

### 사용하지 말 것

- Rule 이 프로젝트 경로, 스택, branch 이름, 사람, 도메인 언어를 참조 → project-local 유지.
- 사용자가 rule 을 실험 중 → 승격은 프로젝트 쪽에서 rule 을 제거하므로 신중.

---

### Flow

1. **현재 프로젝트의 instruction file 읽기** (`CLAUDE.md` / `GEMINI.md` / `AGENTS.md`). 없으면 중단하고 사용자에게 알림.
2. **Candidate 식별**:
   - `<!-- <cup...> -->` marker 바깥의 rule (사용자가 직접 쓴 것).
   - 일반적으로 phrasing 된 rule (프로젝트 이름/branch/스택-specific 경로 없음).
   - 사용자에게 어느 rule 을 승격할지 **반드시 확인** — silent promotion 금지.
3. **Target category 선택**: rule 을 `language | scope | design | deployment | commit` 중 하나로 매핑. 적당한 게 없으면 새 category id 생성 (kebab-case, 한 단어 권장: `testing`, `review`, `ui`, …).
4. **변경 preview** 를 사용자에게 표시:
   - 이동할 block 의 정확한 내용.
   - Target user instruction file (`~/.claude/CLAUDE.md` / `~/.gemini/GEMINI.md` / `~/.codex/AGENTS.md`).
   - 선택된 category 와 marker.
   - 편집 전 확인 요청.
5. **Promotion 적용** (확인 후에만):
   - Target category 가 cup-managed preset (`presets/guidance/<id>.md`) 에 이미 존재: 사용자 instruction file 의 기존 block 에 append. 경고: `cup guidance init --categories=<id>` 돌리면 preset 으로 reset 된다는 점 알림. cup repo 소유자라면 `presets/guidance/<id>.md` 를 직접 수정하는 걸 권장.
   - 새 category: `<!-- <cup-guidance-<id>> --> … <!-- </cup-guidance-<id>> -->` marker 로 감싸서 user instruction file 에 append. `cup guidance list` 에서 `? <id> (unknown category)` 로 표시됨을 알림.
   - Project instruction file 에서 승격된 block 제거.
6. **Report**:
   - Source file, destination file, category, 이동된 text.
   - 검증용 `cup guidance list` 실행 권장.

---

### Preset-backed vs ad-hoc category

| Case | 동작 |
|------|------|
| Target id 가 `presets/guidance/index.json` 에 있음 | 기존 managed block 에 append; `cup guidance init` 으로 해당 category 돌리면 reset 됨 경고. cup repo 소유자에게 `presets/guidance/<id>.md` 직접 수정 권장. |
| Target id 가 신규 | User instruction file 에 새 `<cup-guidance-<id>>` block append. `cup guidance list` 에 `? <id> (unknown category)` 로 노출. |

---

### Multi-provider

사용자가 여러 provider 를 설치한 경우(`which claude|gemini|codex` 또는 `~/.claude/` `~/.gemini/` `~/.codex/` 존재로 detect), 어느 provider instruction file 로 이동할지 묻기 — rule 이 provider-agnostic 이면 "all installed" 로 확인.

### Safety

- 비밀정보(secret), 토큰, 개인정보, repo-specific 경로가 포함된 rule 은 promote 금지.
- User instruction file 편집 전 timestamp backup 생성 (예: `~/.claude/CLAUDE.md.bak.<timestamp>`).
- Project instruction file 이 git 관리 중이면 uncommitted 상태로 남겨 사용자가 review/commit 수동으로 하도록.
