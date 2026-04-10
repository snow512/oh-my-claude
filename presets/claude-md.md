
<!-- <omc> — managed by claude-up, do not edit manually -->

## claude-up Skills

Available skills (say the trigger phrase to use):

| Skill | Trigger (EN) | Trigger (KO) |
|-------|-------------|-------------|
| clean-code | clean code, lint | 코드정리해, 린트해 |
| clean-ui | clean ui | UI정리해 |
| commit-push | commit, push | 커푸, 커밋해 |
| doc-structure | document, update docs | 문서화해, 문서정리해 |
| enhance | harden, improve, unify UI | 보강해, 개선해, UI개선해 |
| merge-branch | merge, create PR | 머지해, PR올려 |
| branch-sync | sync, pull from | 싱크해, 가져와 |
| project-sync | pull, sync project | 최신화해, 풀해 |
| ralph-loop-run | ralph loop | 랄프루프해 |
| restart-server | restart server, stop | 서버재기동해, 서버내려 |
| security-audit | security audit | 보안점검해 |
| setup-workspace | setup workspace | 워크스페이스만들어 |
| version-release | bump version, changelog | 버전업해, 체인지로그 |

## Skill Settings

Skills store per-project memory in `.claude/settings.local.json`:
```json
{ "skills": { "skill-name": { "key": "value" } } }
```

## Commit Rules

- Conventional Commits: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`
- Include `Co-Authored-By: Claude <noreply@anthropic.com>`
- Follow the language of existing commit log

<!-- </omc> -->
