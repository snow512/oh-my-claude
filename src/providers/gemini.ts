import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { readJson, writeJson, backup, parseSimpleYaml, PACKAGE_ROOT } from '../utils';
import { progressLine, ask, checkbox, C, style } from '../ui';
import type { CheckboxItem } from '../ui';
import type { Provider, ProviderName, PermissionIntents, PluginInfo, SessionInfo, SessionOpts, SyncKeys, InitStep, StepResult } from './types';

const HOME = require('os').homedir();

export class GeminiProvider implements Provider {
  readonly name: ProviderName = 'gemini';
  readonly displayName = 'Gemini CLI';
  readonly cliCommand = 'gemini';
  readonly homeDir = path.join(HOME, '.gemini');
  readonly projectDir = '.gemini';
  readonly settingsFileName = 'settings.json';
  readonly instructionFileName = 'GEMINI.md';
  readonly skillsDir = path.join(HOME, '.gemini', 'skills');

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
    return readJson(this.getSettingsPath());
  }

  writeSettings(data: Record<string, unknown>): void {
    writeJson(this.getSettingsPath(), data);
  }

  // --- Permissions ---

  mergePermissions(intents: PermissionIntents): void {
    const preset = this.loadPreset();

    // Write settings (tools.allowed)
    const settingsPreset = preset.settings as Record<string, unknown> | undefined;
    if (settingsPreset) {
      const current = this.readSettings() || {};
      for (const [key, val] of Object.entries(settingsPreset)) {
        current[key] = val;
      }
      this.writeSettings(current);
    }

    // Write policies (deny rules as TOML)
    const policies = preset.policies as Array<Record<string, unknown>> | undefined;
    if (policies && policies.length > 0) {
      this.writePolicies(policies);
    }
  }

  getCurrentPermissions(): { allow: string[]; deny: string[] } {
    const settings = this.readSettings();
    const tools = (settings?.tools as Record<string, unknown>) || {};
    const allowed = (tools.allowed as string[]) || [];

    // Read policies for deny rules
    const deny: string[] = [];
    const policyDir = path.join(this.homeDir, 'policies');
    try {
      const cupPolicy = path.join(policyDir, 'cup-deny.toml');
      if (fs.existsSync(cupPolicy)) {
        const content = fs.readFileSync(cupPolicy, 'utf-8');
        const patterns = content.match(/argsPattern\s*=\s*"([^"]+)"/g) || [];
        for (const p of patterns) {
          const m = p.match(/"([^"]+)"/);
          if (m) deny.push(m[1]);
        }
      }
    } catch {}

    return { allow: allowed, deny };
  }

  // --- Plugins / Extensions ---

  enablePlugins(plugins: string[]): void {
    // Gemini uses extensions, managed via `gemini extensions install`
    // We store the list in settings for reference
    const settings = this.readSettings() || {};
    settings.cupExtensions = plugins;
    this.writeSettings(settings);
  }

  getEnabledPlugins(): string[] {
    const settings = this.readSettings();
    return (settings?.cupExtensions as string[]) || [];
  }

  getAvailablePlugins(): PluginInfo[] {
    // Gemini extensions are installed separately; no preset list for now
    return [];
  }

  // --- Skills ---

  installSkill(skillDir: string, skillName: string, lang: string): void {
    const destDir = path.join(this.skillsDir, skillName);
    const metaPath = path.join(skillDir, 'meta', 'gemini.yaml');
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
      // Fallback to claude meta if gemini not available
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
    const metaPath = path.join(PACKAGE_ROOT, 'user-skills', skillName, 'meta', 'gemini.yaml');
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
    const templatePath = path.join(PACKAGE_ROOT, 'presets', 'gemini-md.md');
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
    // Gemini CLI session history location TBD
    // Check common paths
    const historyDir = path.join(this.homeDir, 'history');
    if (!fs.existsSync(historyDir)) return [];

    // Best-effort: list files if they exist
    const sessions: SessionInfo[] = [];
    try {
      const files = fs.readdirSync(historyDir).filter(f => f.endsWith('.json') || f.endsWith('.jsonl'));
      for (const file of files.slice(0, opts.limit || 10)) {
        const filePath = path.join(historyDir, file);
        const stat = fs.statSync(filePath);
        sessions.push({
          id: file.replace(/\.(json|jsonl)$/, ''),
          project: 'gemini',
          date: stat.mtime,
          size: stat.size,
          firstMessage: '(gemini session)',
        });
      }
    } catch {}

    sessions.sort((a, b) => b.date.getTime() - a.date.getTime());
    return sessions.slice(0, opts.limit || 10);
  }

  resumeSession(id: string, fork?: boolean): void {
    // Gemini CLI resume support TBD
    console.log(`  ${style('⚠', C.yellow)} Gemini CLI session resume not yet supported`);
  }

  // --- Backup ---

  backupSettings(): string | null {
    return backup(this.getSettingsPath());
  }

  getBackupExcludes(): string[] {
    return ['*/extensions/*/node_modules/*'];
  }

  // --- Init Steps ---

  getInitSteps(): InitStep[] {
    const provider = this;
    const preset = this.loadPreset();
    const settingsPreset = preset.settings as Record<string, unknown> | undefined;
    const policies = preset.policies as Array<Record<string, unknown>> | undefined;

    return [
      {
        label: 'Settings',
        async execute(useDefaults: boolean): Promise<StepResult> {
          if (!settingsPreset) return { ok: false, label: 'Settings', detail: 'no preset' };

          if (useDefaults) {
            await progressLine('Applying Gemini settings', () => {
              const current = provider.readSettings() || {};
              for (const [key, val] of Object.entries(settingsPreset)) {
                current[key] = val;
              }
              provider.writeSettings(current);
            });
          } else {
            const doIt = await ask('Apply Gemini settings?', true);
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
        label: 'Policies (deny)',
        async execute(useDefaults: boolean): Promise<StepResult> {
          if (!policies || policies.length === 0) return { ok: false, label: 'Policies', detail: 'none' };

          if (useDefaults) {
            await progressLine(`Applying ${policies.length} deny policies`, () => {
              provider.writePolicies(policies);
            });
          } else {
            const doIt = await ask(`Apply ${policies.length} deny policies?`, true);
            if (!doIt) return { ok: false, label: 'Policies', detail: 'skipped' };
            provider.writePolicies(policies);
          }
          return { ok: true, label: 'Policies', detail: `${policies.length} rules` };
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
        label: 'GEMINI.md',
        async execute(useDefaults: boolean): Promise<StepResult> {
          const template = provider.getInstructionTemplate();
          const existing = provider.readCupBlock();

          if (existing) {
            if (existing.trim() === template.trim()) {
              return { ok: true, label: 'GEMINI.md', detail: 'up to date' };
            }
            let install = useDefaults;
            if (!useDefaults) install = await ask('GEMINI.md cup section has updates. Apply?', true);
            if (install) {
              provider.writeCupBlock(template);
              return { ok: true, label: 'GEMINI.md', detail: 'updated' };
            }
            return { ok: false, label: 'GEMINI.md', detail: 'skipped' };
          }

          let install = useDefaults;
          if (!useDefaults) install = await ask('Add claude-up section to GEMINI.md?', true);
          if (install) {
            provider.writeCupBlock(template);
            return { ok: true, label: 'GEMINI.md', detail: 'installed' };
          }
          return { ok: false, label: 'GEMINI.md', detail: 'skipped' };
        },
      },
    ];
  }

  // --- Sync ---

  getSyncKeys(): SyncKeys {
    return {
      settingsKeys: ['general', 'tools', 'security'],
      instructionFileKey: 'cup-gemini-md.md',
    };
  }

  // --- Internal ---

  private loadPreset(): Record<string, unknown> {
    const presetPath = path.join(PACKAGE_ROOT, 'presets', 'gemini.json');
    const preset = readJson(presetPath);
    if (!preset) {
      console.error('ERROR: gemini.json is missing or invalid');
      process.exit(1);
    }
    return preset as Record<string, unknown>;
  }

  private writePolicies(policies: Array<Record<string, unknown>>): void {
    const policyDir = path.join(this.homeDir, 'policies');
    fs.mkdirSync(policyDir, { recursive: true });

    let toml = '# Generated by claude-up — deny rules for destructive commands\n\n';
    for (const rule of policies) {
      toml += '[[rules]]\n';
      for (const [key, val] of Object.entries(rule)) {
        if (typeof val === 'number') toml += `${key} = ${val}\n`;
        else toml += `${key} = "${val}"\n`;
      }
      toml += '\n';
    }

    fs.writeFileSync(path.join(policyDir, 'cup-deny.toml'), toml);
  }

  getAvailableSkillsFromRepo(): CheckboxItem[] {
    const skillsSrc = path.join(PACKAGE_ROOT, 'user-skills');
    try {
      return fs.readdirSync(skillsSrc, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => {
          let desc = '';
          const metaPath = path.join(skillsSrc, e.name, 'meta', 'gemini.yaml');
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
