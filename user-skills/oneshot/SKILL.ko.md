## One-shot Implementation

사용자 요구사항을 받아 **계획 → 구현 → 검증 → 커밋** 까지 자동으로 수행하는 원스탑 스킬.
이슈가 없을 때까지 품질 루프를 반복하여 완성도를 보장한다.

---

### Overall Flow

```
┌──────────┐   ┌──────────┐   ┌──────────────┐   ┌──────┐   ┌──────┐
│ 1. Plan  │─▶│ 2. Impl. │─▶│ 3. Quality   │─▶│ 4. Test │─▶│ 5. Commit │
│          │  │          │  │ Loop (반복)  │  │ Loop    │  │ & Push    │
└──────────┘   └──────────┘   └──────────────┘   └──────┘   └──────┘
                    ▲                 │               │
                    │                 ▼               ▼
                    └──────────fix & retry────────────┘
```

---

### Step 1: Plan (계획)

1. **요구사항 파악**
   - 사용자 입력을 분석하여 구현 목표 도출
   - 불명확한 부분이 있으면 질문 (모호하면 `AskUserQuestion` 사용)

2. **영향 범위 분석**
   - 관련 파일/컴포넌트/API 식별 (Grep, Glob, Agent Explore 활용)
   - 기존 코드 패턴 파악

3. **계획 문서 저장**
   - 경로: `docs/plans/YYYY-MM-DD-<topic>.md`
   - 포함 항목:
     - **Goal** — 한 줄 목표
     - **Architecture** — 접근 방식
     - **Files** — 생성/수정 대상
     - **Tasks** — 체크박스 형식의 작업 목록
     - **Risks** — 주의사항

4. **TaskCreate로 작업 목록 생성** — 각 Task를 tracking용으로 등록

5. **계획 요약 사용자에게 보고** — 간단히 한 문단 (full plan은 파일에 있음)
   - 심플한 작업이면 바로 Step 2로 진행
   - 복잡하거나 아키텍처 결정이 필요하면 `AskUserQuestion`으로 승인 요청

---

### Step 2: Implement (구현)

1. **TDD 우선** — 가능한 경우 테스트 먼저 작성
2. 각 Task를 순차 구현
3. 독립적인 Task는 `Agent`로 병렬 처리 가능 (단, 같은 파일을 건드리는 건 순차)
4. Task 완료 시 `TaskUpdate`로 상태 갱신
5. 코드 변경 시 기존 패턴/컨벤션 준수

---

### Step 3: Quality Loop (품질 루프) — 이슈 0건까지 반복

**반복 루프:**

```
iteration = 0
while iteration < 5:
    iteration += 1

    # A. ESLint
    run `npm run lint` (or project-specific)
    if errors exist → auto-fix → if still errors → 사용자 보고 후 중단

    # B. Bug Hunt (Agent로 병렬 분석)
    dispatch Explore agent with bug hunting prompt
    if critical/warning 발견 → 수정 → continue (루프 계속)

    # C. Clean UI (프론트엔드 변경이 있는 경우)
    invoke /clean-ui 스킬 로직
    if must/should 이슈 발견 → 수정 → continue

    # D. No issues found → break
    break

if iteration >= 5:
    사용자 보고: "5회 반복 후에도 이슈 잔존, 수동 검토 필요"
```

**세부 규칙:**
- **False positive 필터링**: 각 이슈는 실제 문제인지 재검토 (YAGNI, 이미 상위에서 처리된 경우 등은 스킵)
- **수정 원칙**: 동작 변경 금지, 코드 품질 개선만
- **빌드 검증**: 각 수정 후 `npm run build` 확인

---

### Step 4: Test Loop (테스트 루프) — 통과할 때까지 반복

1. **테스트 파일 존재 확인**
   - 관련 `__tests__/*.test.ts` 파일 탐색
   - 없으면 생성, 있으면 업데이트 (새로 추가된 기능 커버)

2. **테스트 실행**
   ```bash
   npm test   # 또는 프로젝트 테스트 명령
   ```

3. **실패 처리:**
   ```
   test_iteration = 0
   while tests fail and test_iteration < 3:
       test_iteration += 1
       원인 분석 → 코드/테스트 수정
       → Step 3 (Quality Loop) 재실행
       → 다시 테스트 실행

   if test_iteration >= 3:
       사용자 보고: "3회 시도 후에도 테스트 실패, 수동 디버깅 필요"
   ```

4. **통과 시 다음 단계**

---

### Step 5: Final Build Verification

```bash
npm run build
```
- 실패 시 Step 3부터 재실행
- 성공 시 커밋 준비

---

### Step 6: Commit & Push

1. **현재 브랜치 확인**
   ```bash
   git rev-parse --abbrev-ref HEAD
   ```
   - `develop`이 기본. 다른 브랜치면 사용자에게 확인.

2. **`/commit-push` 스킬 호출** — 커밋 메시지 자동 생성, 현재 브랜치에 푸시

3. **⚠️ 중요: 절대 자동으로 수행하지 않는 것**
   - `qa`, `master` 브랜치로의 머지/PR
   - `vercel deploy --prod` 등 프로덕션 배포
   - CLAUDE.md의 "배포는 사용자 명시적 지시에만" 규칙 준수

---

### Step 7: Report (최종 보고)

```
## One-shot 구현 완료

### Summary
- 구현 내용: {기능명}
- 계획 문서: `docs/plans/YYYY-MM-DD-<topic>.md`
- 수정 파일: N개
- 테스트: {passed}/{total} 통과
- Quality loop: {N}회 반복
- Test loop: {M}회 반복

### Changes
- `file1` — 변경 요약
- `file2` — 변경 요약

### Commit
- {commit_sha}: {commit_message}
- 푸시 브랜치: develop

### Next Steps
- QA 배포 필요 시: "qa에 PR해"
- 프로덕션 배포 필요 시: "마스터에 PR해"
```

---

### Rules & Guardrails

- **Plan 없이 코드 수정 금지** — 반드시 Step 1부터 시작
- **배포 자동 수행 금지** — qa/master 머지는 별도 사용자 지시 필수
- **무한 루프 방지** — Quality loop 최대 5회, Test loop 최대 3회
- **사용자 중단 존중** — "그만", "stop", "중단" 등의 키워드 감지 시 즉시 중단
- **False positive 재검토** — Agent가 찾은 이슈는 맹목적으로 수정하지 말고, 실제 버그/개선인지 판단
- **Progress Tracking** — TaskCreate/TaskUpdate로 진행 상황을 지속적으로 업데이트
- **기존 스킬 재사용** — `/clean-code`, `/clean-ui`, `/commit-push` 등을 적극 활용

---

### When NOT to Use

- 단순 오타 수정, 한 줄 변경 → `/enhance`나 직접 수정
- 탐색적 브레인스토밍 → `superpowers:brainstorming` 먼저
- 대규모 아키텍처 변경 → `superpowers:writing-plans`로 플랜 먼저 만들고 검토 후 진행

---

### Integration with Other Skills

- **writing-plans** (superpowers): 복잡한 작업은 이 스킬의 계획 엔진을 호출할 수도 있음
- **clean-code, clean-ui**: Quality loop에서 실제 로직 재사용
- **commit-push**: 최종 커밋 단계에서 호출
- **doc-structure**: `commit-push` 내부에서 자동 호출되어 docs도 함께 갱신
