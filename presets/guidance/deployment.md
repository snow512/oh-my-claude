## Deployment Safety

- **Production 배포는 반드시 사용자의 명시적 지시가 있을 때만 수행한다.** 자동으로 production 머지, 배포 command(`vercel deploy`, `git push origin master`, `npm publish` 등) 를 실행하지 않는다.
- 중간 단계 branch (develop / staging / qa 등) 머지·푸시는 사용자 요청 시 진행 가능하지만, **production 배포는 매번 별도 확인** 필요. 프로젝트별 branch 이름과 배포 runbook(런북) 은 project CLAUDE.md 또는 `docs/` 참고.
