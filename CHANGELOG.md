# Changelog

## [0.1.0-beta] - 2026-04-05

### Added
- Interactive CLI installer with 6-step wizard (permissions, plugins, skills, statusline)
- 11 CLI commands: init, install, project-init, update, sessions, resume, status, doctor, clone, backup, restore
- 13 user skills: branch-sync, clean-code, clean-ui, commit-push, doc-structure, enhance, merge-branch, project-sync, ralph-loop-run, restart-server, security-audit, setup-workspace, version-release
- i18n support: English (default) + Korean skill translations
- System locale auto-detection for skill language
- Interactive checkbox selector with arrow keys (zero dependencies)
- Braille dot spinner animation
- Box-drawing banner UI
- Smart update with change detection (only update what changed)
- Session management: list and resume sessions across projects
- Individual component installation (omc install skills/plugins/permissions/statusline)
- Environment clone, backup (.tar.gz), and restore
- Configuration diagnostics (omc doctor)
- Custom status line support
- CLI options: --yes, --force, --lang, --output, --json, --verbose, --fork
- `omc` alias for `claude-up`
- TypeScript source with strict mode
- Unit tests (29 tests, node:test)
- Zero runtime dependencies (Node.js built-in modules only)
