## Design Discipline

- **Block incremental patches on structural problems.** 버그나 변경 요청이 들어오면 작은 수정으로 우회하기 전에 먼저 판단한다 — "이게 국부 수정으로 충분한가, 아니면 데이터 모델/식별(identity)/소유권(ownership) 수준의 재설계가 필요한가?" 근본 원인이 데이터 모델에 있으면 2 줄 patch 는 거의 항상 반대 방향의 새 bug 를 만든다. 예: state fingerprint 로 entity 를 매칭하다가 동일 state 공존 시 깨진 사례 — explicit `id` 필드로 근본 재설계해야 해결.
- **식별(identity) 은 반드시 explicit.** state 로부터 derive 하지 않는다. 동일한 state 를 가질 수 있는 두 entity 가 있다면 id 필드가 있어야 한다.
- 수정 작업 시작 전 이 질문에 답하고 진행: (1) 새 entity/필드 추가인가 기존 구조 우회인가 (2) 동일 상태가 중복 저장되는가 (3) 식별이 explicit 인가 derivable 인가.
