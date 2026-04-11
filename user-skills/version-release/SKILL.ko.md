## 버전 관리 & CHANGELOG

시맨틱 버저닝(SemVer)에 따라 버전을 관리하고 CHANGELOG.md를 생성/갱신한다.

---

### 버전 정책 (SemVer)

#### 베타 (0.x.x) — 아직 정식 출시 전

| 변경 유형 | 버전 변경 | 예시 |
|----------|----------|------|
| 버그 수정, 사소한 변경 | **patch** ↑ | 0.1.0 → 0.1.1 |
| 새 기능 추가 | **minor** ↑ | 0.1.3 → 0.2.0 |
| 호환성 깨지는 변경 | **minor** ↑ | 0.2.1 → 0.3.0 |

베타에서는 breaking change도 minor로 올린다 — 0.x.x 자체가 "API 불안정"을 의미하므로.

#### 정식 (1.x.x+) — 안정 버전

| 변경 유형 | 버전 변경 | 예시 |
|----------|----------|------|
| 버그 수정 | **patch** ↑ | 1.2.3 → 1.2.4 |
| 새 기능 (하위 호환) | **minor** ↑ | 1.2.4 → 1.3.0 |
| 호환성 깨지는 변경 | **major** ↑ | 1.3.0 → 2.0.0 |

#### 정식 출시 (0.x → 1.0.0)

"버전업해" 시 현재 0.x.x이고 사용자가 "정식 출시" 또는 "1.0 릴리즈"라고 하면 1.0.0으로 올린다.

---

### 모드 1: 버전업해

`package.json` (또는 `Cargo.toml`, `pyproject.toml` 등)의 버전을 올린다.

1. **현재 버전 확인**: 프로젝트 설정 파일에서 버전 읽기
2. **변경 내용 분석**: 마지막 버전 태그 이후 커밋 로그 확인
   ```bash
   git log $(git describe --tags --abbrev=0 2>/dev/null || echo "HEAD~10")..HEAD --oneline
   ```
3. **버전 결정**:
   - 기본: **minor** 올림
   - 커밋에 `fix:` 만 있으면 → **patch** 제안
   - breaking change 감지 시 (`feat!:`, `BREAKING CHANGE`) → **major** 올릴지 사용자에게 확인
   - 사용자가 "패치만", "메이저로" 등 명시하면 그대로
4. **버전 파일 수정**: package.json, Cargo.toml 등
5. **CHANGELOG.md 갱신** (아래 형식)
6. **git tag 생성**: `v{버전}`

---

### 모드 2: 체인지로그 / 릴리즈노트

CHANGELOG.md를 생성하거나 갱신한다.

1. **커밋 로그 수집**: 마지막 태그 이후 커밋들
2. **카테고리 분류**: Conventional Commits prefix 기준
3. **CHANGELOG.md 갱신**

#### CHANGELOG.md 형식 (Keep a Changelog)

```markdown
# Changelog

## [1.3.0] - 2026-04-04

### Added
- 새 기능 설명

### Changed
- 변경된 동작 설명

### Fixed
- 버그 수정 설명

### Removed
- 제거된 기능

## [1.2.4] - 2026-03-28
...
```

**커밋 prefix → 카테고리 매핑:**

| prefix | 카테고리 |
|--------|---------|
| `feat:` | Added |
| `fix:` | Fixed |
| `refactor:`, `perf:` | Changed |
| `docs:` | (CHANGELOG에 포함하지 않음) |
| `chore:`, `style:`, `test:` | (CHANGELOG에 포함하지 않음) |
| `feat!:`, `BREAKING CHANGE` | Changed (breaking) |

docs, chore, style, test는 사용자에게 영향이 없으므로 CHANGELOG에서 제외한다.

---

### merge-branch 연동

`/merge-branch`에서 qa/main으로 PR 생성 시 이 스킬이 자동 호출된다:

1. 버전을 올리고 CHANGELOG.md를 갱신
2. 변경 사항을 커밋에 포함
3. PR 본문에 CHANGELOG 내용을 포함

---

### commit-push 연동 (패치 자동 올림)

`.claude/settings.local.json`의 `skills.version-release.autoPatch`가 `true`이면
`/commit-push` 시 패치 버전을 자동으로 올린다.

기본값은 `false` — 처음 "버전업해" 실행 시 자동 패치를 활성화할지 물어본다.

---

### 주의사항

- CHANGELOG.md가 없으면 새로 생성
- 기존 CHANGELOG.md가 있으면 최상단에 새 버전 섹션 추가 (기존 내용 보존)
- git tag가 이미 있으면 덮어쓰지 않음
- 버전 파일이 없는 프로젝트 (순수 스크립트 등)는 CHANGELOG.md만 갱신
