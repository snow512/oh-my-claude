---
name: project-directives
description: >
  프로젝트 관리 매직 커맨드 — CLAUDE.md 지침 기록, 프로젝트 최신화, 코드 보강/개선, 브랜치 싱크.
  트리거: 지침에 기록해, 프로젝트 최신화해, 보강해, 개선해, 싱크해, sync
allowed-tools: Bash, Read, Glob, Grep, Edit, Write
user-invocable: false
---

## 매직 커맨드

---

### "지침에 기록해"

현재 대화에서 나온 규칙이나 결정사항을 `CLAUDE.md`에 기록한다.

1. `CLAUDE.md` 읽기 (없으면 생성)
2. 적절한 섹션에 지침 추가 (기존 구조 유지)
3. 중복 확인 — 이미 있는 내용이면 건너뜀

---

### "프로젝트 최신화해"

소스와 의존성을 최신 상태로 맞춘다.

```bash
# 소스 최신화
git pull -p

# 의존성 설치 (프로젝트 유형에 맞게)
```

| 프로젝트 유형 | 명령 |
|---|---|
| Node.js (루트) | `npm install` |
| 풀스택 (분리형) | 각 서브디렉토리에서 `npm install` |
| Python | `pip install -r requirements.txt` 또는 `poetry install` |
| Go | `go mod download` |
| Docker | `docker compose pull` |

---

### "보강해"

기존 구현을 보강하고 문제점을 수정한다.

1. 현재 작업 중인 코드를 분석하여 보강할 부분 파악
2. 수정 수행 — 기능 유지하면서 품질 개선
3. 테스트 실행하여 동작 확인
4. 결과 보고

"보강해"는 `코드정리해`와 다름 — 코드정리는 스타일/린팅 위주, 보강은 기능의 견고함과 완성도에 초점.

---

### "개선해"

기존 구현의 사용성을 높이거나 편의 기능을 추가한다.

1. 개선할 수 있는 부분을 분석하여 **목록으로 먼저 보고**
2. 사용자가 선택한 항목만 수행
3. 선택하지 않은 항목은 수행하지 않음

"개선해"는 코드 레벨이 아닌 **사용자 경험 레벨**의 개선 — UI 흐름, 에러 메시지, 편의 기능 등.

---

### "싱크해" / "{브랜치}에 싱크해"

현재 브랜치와 대상 브랜치를 양방향 머지로 동기화한다.

1. 미커밋 변경 있으면 → `/commit-push` 호출
2. 대상 브랜치를 현재 브랜치에 머지 (대상의 변경을 가져옴)
   ```bash
   git fetch origin
   git merge origin/<대상> --no-edit
   ```
3. 현재 브랜치를 대상에 머지 (내 변경을 보냄)
   ```bash
   git checkout <대상>
   git pull origin <대상>
   git merge <원래브랜치> --no-edit
   git push origin <대상>
   git checkout <원래브랜치>
   ```
4. 충돌 시 사용자에게 보고

대상 미지정 시 `develop` 또는 `dev` 브랜치를 자동 감지.
