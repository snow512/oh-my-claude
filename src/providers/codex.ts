import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { readJson, writeJson, backup, parseSimpleYaml, PACKAGE_ROOT } from '../utils';
import { progressLine, ask, checkbox, C, style } from '../ui';
import type { CheckboxItem } from '../ui';
import type { Provider, ProviderName, PermissionIntents, PluginInfo, SessionInfo, SessionOpts, SyncKeys, InitStep, StepResult } from './types';

let TOML: { parse: (s: string) => Record<string, unknown>; stringify: (o: Record<string, unknown>) => string } | null = null;
try { TOML = require('smol-toml'); } catch {}

const HOME = require('os').homedir();

export class CodexProvider implements Provider {
  readonly name: ProviderName = 'codex';
  readonly displayName = 'Codex CLI';
  readonly cliCommand = 'codex';
  readonly homeDir = path.join(HOME, '.codex');
  readonly projectDir = '.codex';
  readonly settingsFileName = 'config.toml';
  readonly instructionFileName = 'AGENTS.md';
  readonly skillsDir = path.join(HOME, '.agents', 'skills');

  // --- Detection ---

  isInstalled(): boolean {
    try {
      execFileSync('which', [this.cliCommand], { stdio: 'pipe', encoding: 'utf-8' });
      return true;
    } catch {
      return fs.existsSync(this.homeDir);
    }
  }

  // --- Settings ---

  getSettingsPath(): string {
    return path.join(this.homeDir, this.settingsFileName);
  }

  getProjectSettingsPath(projectRoot: string): string {
    return path.join(projectRoot, this.projectDir, this.settingsFileName);
  }

  readSettings(): Record<string, unknown> | null {
    if (!TOML) return readJson(this.getSettingsPath()); // fallback
    try {
      const content = fs.readFileSync(this.getSettingsPath(), 'utf-8');
      return TOML.parse(content) as Record<string, unknown>;
    } catch { return null; }
  }

  writeSettings(data: Record<string, unknown>): void {
    fs.mkdirSync(path.dirname(this.getSettingsPath()), { recursive: true });
    if (TOML) {
      fs.writeFileSync(this.getSettingsPath(), TOML.stringify(data) + '\n');
    } else {
      // Fallback: write as JSON if TOML not available
      writeJson(this.getSettingsPath(), data);
    }
  }

  // --- Permissions ---

  mergePermissions(intents: PermissionIntents): void {
    const preset = this.loadPreset();
    const settingsPreset = preset.settings as Record<string, unknown> | undefined;
    if (settingsPreset) {
      const current = this.readSettings() || {};
      for (const [key, val] of Object.entries(settingsPreset)) {
        current[key] = val;
      }
      this.writeSettings(current);
    }
  }

  getCurrentPermissions(): { allow: string[]; deny: string[] } {
    const settings = this.readSettings();
    const policy = settings?.approval_policy;
    const allow = typeof policy === 'string' ? [policy] : [];
    // Codex relies on sandbox for deny
    return { allow, deny: ['(sandbox enforced)'] };
  }

  // --- Plugins ---

  enablePlugins(plugins: string[]): void {
    const settings = this.readSettings() || {};
    const pluginsObj: Record<string, Record<string, boolean>> = {};
    for (const p of plugins) {
      pluginsObj[p] = { enabled: true };
    }
    settings.plugins = pluginsObj;
    this.writeSettings(settings);
  }

  getEnabledPlugins(): string[] {
    const settings = this.readSettings();
    const plugins = settings?.plugins as Record<string, Record<string, boolean>> | undefined;
    if (!plugins) return [];
    return Object.entries(plugins)
      .filter(([, v]) => v.enabled)
      .map(([k]) => k);
  }

  getAvailablePlugins(): PluginInfo[] {
    return [];
  }

  // --- Skills ---

  installSkill(skillDir: string, skillName: string, lang: string): void {
    const destDir = path.join(this.skillsDir, skillName);
    const metaPath = path.join(skillDir, 'meta', 'codex.yaml');
    const bodyFile = lang === 'ko' ? 'SKILL.ko.md' : 'SKILL.md';
    const bodyPath = path.join(skillDir, bodyFile);
    const fallbackPath = path.join(skillDir, 'SKILL.md');

    const body = fs.existsSync(bodyPath)
      ? fs.readFileSync(bodyPath, 'utf-8')
      : fs.readFileSync(fallbackPath, 'utf-8');

    let content: string;
    if (fs.existsSync(metaPath)) {
      const meta = parseSimpleYaml(fs.readFileSync(metaPath, 'utf-8'));
      content = this.buildSkillContent(body, meta);
    } else {
      const claudeMetaPath = path.join(skillDir, 'meta', 'claude.yaml');
      if (fs.existsSync(claudeMetaPath)) {
        const meta = parseSimpleYaml(fs.readFileSync(claudeMetaPath, 'utf-8'));
        content = this.buildSkillContent(body, meta);
      } else {
        content = body;
      }
    }

    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(path.join(destDir, 'SKILL.md'), content);
  }

  getInstalledSkills(): string[] {
    try {
      return fs.readdirSync(this.skillsDir, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name);
    } catch { return []; }
  }

  buildSkillContent(body: string, meta: Record<string, unknown>): string {
    const lines: string[] = ['---'];
    for (const [key, val] of Object.entries(meta)) {
      const strVal = String(val);
      if (strVal.includes('\n')) {
        lines.push(`${key}: >`);
        for (const line of strVal.split('\n')) lines.push(`  ${line}`);
      } else {
        lines.push(`${key}: ${strVal}`);
      }
    }
    lines.push('---', '');
    return lines.join('\n') + body;
  }

  getSkillMeta(skillName: string): Record<string, unknown> | null {
    const metaPath = path.join(PACKAGE_ROOT, 'user-skills', skillName, 'meta', 'codex.yaml');
    try {
      return parseSimpleYaml(fs.readFileSync(metaPath, 'utf-8'));
    } catch { return null; }
  }

  // --- Instruction File ---

  getInstructionFilePath(scope: 'global' | 'project'): string {
    if (scope === 'global') return path.join(this.homeDir, this.instructionFileName);
    return this.instructionFileName;
  }

  getInstructionTemplate(): string {
    const templatePath = path.join(PACKAGE_ROOT, 'presets', 'agents-md.md');
    return fs.readFileSync(templatePath, 'utf-8').trim();
  }

  readCupBlock(): string | null {
    const filePath = this.getInstructionFilePath('global');
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const start = content.indexOf(CUP_START);
      const end = content.indexOf(CUP_END);
      if (start === -1 || end === -1) return null;
      return content.slice(start, end + CUP_END.length);
    } catch { return null; }
  }

  writeCupBlock(block: string): void {
    const filePath = this.getInstructionFilePath('global');
    let content = '';
    try { content = fs.readFileSync(filePath, 'utf-8'); } catch {}

    const start = content.indexOf(CUP_START);
    const end = content.indexOf(CUP_END);

    if (start !== -1 && end !== -1) {
      content = content.slice(0, start) + block + content.slice(end + CUP_END.length);
    } else {
      content = content ? content.trimEnd() + '\n\n' + block + '\n' : block + '\n';
    }

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }

  // --- Sessions ---

  listSessions(opts: SessionOpts): SessionInfo[] {
    const logDir = path.join(this.homeDir, 'log');
    if (!fs.existsSync(logDir)) return [];

    const sessions: SessionInfo[] = [];
    try {
      const files = fs.readdirSync(logDir).filter(f => f.endsWith('.log') || f.endsWith('.json'));
      for (const file of files.slice(0, opts.limit || 10)) {
        const filePath = path.join(logDir, file);
        const stat = fs.statSync(filePath);
        sessions.push({
          id: file.replace(/\.(log|json)$/, ''),
          project: 'codex',
          date: stat.mtime,
          size: stat.size,
          firstMessage: '(codex session)',
        });
      }
    } catch {}

    sessions.sort((a, b) => b.date.getTime() - a.date.getTime());
    return sessions.slice(0, opts.limit || 10);
  }

  resumeSession(id: string, fork?: boolean): void {
    console.log(`  ${style('⚠', C.yellow)} Codex CLI session resume not yet supported`);
  }

  // --- Backup ---

  backupSettings(): string | null {
    return backup(this.getSettingsPath());
  }

  getBackupExcludes(): string[] {
    return ['*/log/*'];
  }

  // --- Init Steps ---

  getInitSteps(): InitStep[] {
    const provider = this;
    const preset = this.loadPreset();
    const settingsPreset = preset.settings as Record<string, unknown> | undefined;

    return [
      {
        label: 'Settings',
        async execute(useDefaults: boolean): Promise<StepResult> {
          if (!settingsPreset) return { ok: false, label: 'Settings', detail: 'no preset' };

          if (useDefaults) {
            await progressLine('Applying Codex settings', () => {
              const current = provider.readSettings() || {};
              for (const [key, val] of Object.entries(settingsPreset)) {
                current[key] = val;
              }
              provider.writeSettings(current);
            });
          } else {
            const doIt = await ask('Apply Codex settings?', true);
            if (!doIt) return { ok: false, label: 'Settings', detail: 'skipped' };
            const current = provider.readSettings() || {};
            for (const [key, val] of Object.entries(settingsPreset)) {
              current[key] = val;
            }
            provider.writeSettings(current);
          }
          return { ok: true, label: 'Settings', detail: 'configured' };
        },
      },
      {
        label: 'User Skills',
        async execute(useDefaults: boolean, lang: string): Promise<StepResult> {
          const skillsSrc = path.join(PACKAGE_ROOT, 'user-skills');
          const available = provider.getAvailableSkillsFromRepo();
          if (available.length === 0) return { ok: false, label: 'Skills', detail: 'no skills found' };

          let selectedNames: string[];
          if (useDefaults) {
            selectedNames = available.map(s => s.name);
            await progressLine(`Installing all ${available.length} skills (${lang})`, () => {
              for (const name of selectedNames) {
                provider.installSkill(path.join(skillsSrc, name), name, lang);
              }
            });
          } else {
            console.log('');
            selectedNames = await checkbox(available);
            for (const name of selectedNames) {
              provider.installSkill(path.join(skillsSrc, name), name, lang);
            }
            console.log(`  ${style('\u2713', C.green)} ${selectedNames.length} skills installed (${lang})`);
          }
          return { ok: true, label: 'Skills', detail: `${selectedNames.length}/${available.length} installed` };
        },
      },
      {
        label: 'AGENTS.md',
        async execute(useDefaults: boolean): Promise<StepResult> {
          const template = provider.getInstructionTemplate();
          const existing = provider.readCupBlock();

          if (existing) {
            if (existing.trim() === template.trim()) {
              return { ok: true, label: 'AGENTS.md', detail: 'up to date' };
            }
            let install = useDefaults;
            if (!useDefaults) install = await ask('AGENTS.md cup section has updates. Apply?', true);
            if (install) {
              provider.writeCupBlock(template);
              return { ok: true, label: 'AGENTS.md', detail: 'updated' };
            }
            return { ok: false, label: 'AGENTS.md', detail: 'skipped' };
          }

          let install = useDefaults;
          if (!useDefaults) install = await ask('Add claude-up section to AGENTS.md?', true);
          if (install) {
            provider.writeCupBlock(template);
            return { ok: true, label: 'AGENTS.md', detail: 'installed' };
          }
          return { ok: false, label: 'AGENTS.md', detail: 'skipped' };
        },
      },
    ];
  }

  // --- Sync ---

  getSyncKeys(): SyncKeys {
    return {
      settingsKeys: ['approval_policy', 'plugins', 'features'],
      instructionFileKey: 'cup-agents-md.md',
    };
  }

  // --- Internal ---

  private loadPreset(): Record<string, unknown> {
    const presetPath = path.join(PACKAGE_ROOT, 'presets', 'codex.json');
    const preset = readJson(presetPath);
    if (!preset) {
      console.error('ERROR: codex.json is missing or invalid');
      process.exit(1);
    }
    return preset as Record<string, unknown>;
  }

  getAvailableSkillsFromRepo(): CheckboxItem[] {
    const skillsSrc = path.join(PACKAGE_ROOT, 'user-skills');
    try {
      return fs.readdirSync(skillsSrc, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => {
          let desc = '';
          const metaPath = path.join(skillsSrc, e.name, 'meta', 'codex.yaml');
          try {
            const meta = parseSimpleYaml(fs.readFileSync(metaPath, 'utf-8'));
            if (meta.description) desc = String(meta.description).trim().slice(0, 50);
          } catch {}
          return { name: e.name, desc: desc || '(no description)' };
        });
    } catch { return []; }
  }
}

const CUP_START = '<!-- <cup>';
const CUP_END = '<!-- </cup> -->';
