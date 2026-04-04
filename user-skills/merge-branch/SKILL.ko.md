---
name: merge-branch
description: >
  현재 브랜치를 대상 브랜치에 머지 또는 PR 생성. develop은 직접 머지, main/qa는 PR.
  트리거: 머지해, 디벨롭에 머지해, qa에 PR해, 메인에 피알해, PR올려, merge, pull request
allowed-tools: Bash, Read
---

## 브랜치 머지 / PR 생성

현재 브랜치를 대상 브랜치에 통합한다.
대상 브랜치에 따라 **직접 머지** 또는 **PR 생성**으로 분기한다.

### 대상 브랜치 결정

1. 사용자가 명시하면 그대로 사용 ("메인에 머지해" → `main`, "디벨롭에 머지해" → `develop`)
2. 명시하지 않으면 자동 감지:
   ```bash
   git branch -a | grep -qE '(develop|dev)$' && echo develop || echo main
   ```

### 머지 vs PR 판단

| 대상 브랜치 | 기본 방식 | 이유 |
|-------------|----------|------|
| `main`, `master` | **PR 생성** | 보호 브랜치 — 직접 머지 금지 |
| `qa`, `staging`, `release` | **PR 생성** | 검증 브랜치 — 리뷰 필요 |
| `develop`, `dev` 및 기타 | **직접 머지** | 개발 브랜치 — 빠른 통합 |

사용자가 "PR올려"라고 하면 대상에 관계없이 PR을 생성한다.

**사용자가 "머지해"라고 했지만 대상이 PR 브랜치인 경우:**
> "{대상}은 PR로 통합하는 브랜치입니다. 그래도 직접 머지하시겠습니까?"

사용자가 동의하면 직접 머지를 수행한다. 거부하면 PR을 생성한다.

---

### 경로 A: 직접 머지 (develop 등)

1. **안전 검사**:
   - 현재 브랜치가 대상과 같으면 → 종료
   - 미커밋 변경 있으면 → `/commit-push` 호출

2. **대상 브랜치 최신화**:
   ```bash
   git checkout <대상>
   git pull origin <대상>
   ```

3. **머지**:
   ```bash
   git merge <브랜치명> --no-edit
   ```
   충돌 시 → 사용자에게 보고, `git merge --abort` 안내

4. **푸시**: `git push origin <대상>`

5. **브랜치 삭제** (로컬 + 리모트):
   ```bash
   git branch -d <브랜치명>
   git push origin --delete <브랜치명>
   ```

6. **결과 보고**:
   ```
   ✅ <브랜치명> → <대상> 머지 완료
   - 로컬/리모트 브랜치 삭제됨
   ```

---

### 경로 B: PR 생성 (main, qa 등)

1. **안전 검사**: 미커밋 변경 있으면 → `/commit-push` 호출

2. **버전 & CHANGELOG**: `version-release` 스킬 호출
   - 버전 올림 + CHANGELOG.md 갱신
   - 변경분을 커밋에 포함

3. **리모트 푸시**: 현재 브랜치를 리모트에 푸시
   ```bash
   git push -u origin <브랜치명>
   ```

4. **PR 생성**:
   ```bash
   gh pr create --base <대상> --title "<제목>" --body "<본문>"
   ```
   - 제목: 브랜치명과 커밋 로그 기반으로 자동 생성
   - 본문: CHANGELOG의 최신 버전 섹션 내용 포함

4. **결과 보고**:
   ```
   ✅ PR 생성 완료
   - <PR URL>
   - <브랜치명> → <대상>
   ```

---

### 주의사항

- 충돌 시 자동 해결하지 않고 사용자에게 보고
- `gh` CLI가 없으면 PR 생성 불가 → 설치 안내
- force push는 하지 않는다
