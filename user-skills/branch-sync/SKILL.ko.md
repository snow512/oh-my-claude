## 브랜치 동기화

현재 브랜치와 대상 브랜치 사이의 커밋을 동기화한다.

---

### 동기화 모드

| 트리거 | 모드 | 동작 |
|--------|------|------|
| "싱크해", "디벨롭에 싱크해" | **양방향** | 대상 → 현재 + 현재 → 대상 |
| "디벨롭 가져와", "당겨와" | **가져오기** | 대상 → 현재만 |
| "디벨롭에 보내", "푸시해" | **보내기** | 현재 → 대상만 (→ merge-branch 호출) |

---

### 대상 브랜치 결정

1. 사용자가 명시 → 그대로 ("디벨롭에 싱크해" → `develop`)
2. 미지정 → 자동 감지:
   ```bash
   # develop/dev가 있으면 develop, 없으면 main
   git branch -a | grep -qE '(develop|dev)$' && echo develop || echo main
   ```

---

### 실행 순서 (양방향)

#### 1단계: 사전 검사

```bash
git status --porcelain
```

미커밋 변경이 있으면:
> "미커밋 변경이 있습니다. 커밋 후 싱크할까요, stash 후 싱크할까요?"
- 커밋 → `/commit-push` (커밋만 모드) 호출
- stash → `git stash` 후 싱크 완료 뒤 `git stash pop`

#### 2단계: 대상 브랜치 → 현재 브랜치 (가져오기)

```bash
git fetch origin
git merge origin/<대상> --no-edit
```

충돌 발생 시:
```
⚠️ 충돌 발생 — 대상에서 가져오는 중
충돌 파일:
- src/app.ts
- src/config.ts

자동 해결을 시도할까요, 아니면 중단할까요?
```
- 중단 → `git merge --abort` 후 종료
- 시도 → 충돌 해결 시도 (실패하면 abort)

#### 3단계: 현재 브랜치 → 대상 브랜치 (보내기)

```bash
git push origin <현재브랜치>

git checkout <대상>
git pull origin <대상>
git merge <현재브랜치> --no-edit
git push origin <대상>
git checkout <현재브랜치>
```

충돌 시 동일하게 처리.

#### 4단계: 결과 보고

```
✅ 브랜치 동기화 완료

<현재브랜치> ↔ <대상>

가져온 커밋: {N}개
  - abc1234 feat: 로그인 추가 (by 홍길동)
  - ...

보낸 커밋: {M}개
  - def5678 fix: 결제 버그 (by 나)
  - ...
```

---

### 실행 순서 (가져오기만)

1단계 + 2단계만 수행. 3단계 건너뜀.

---

### 주의사항

- 양방향 싱크 중 2단계(가져오기)에서 충돌이 해결 안 되면 3단계(보내기)는 수행하지 않음
- main/master 브랜치로 보내는 건 양방향이라도 한 번 더 확인
- force push는 하지 않음
- rebase가 아닌 merge 방식 — 커밋 히스토리 보존
