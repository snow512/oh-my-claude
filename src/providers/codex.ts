import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { readJson, writeJson, backup, parseSimpleYaml, PACKAGE_ROOT, HOME_DIR } from '../utils';
import { progressLine, ask, checkbox, C, style } from '../ui';
import type { CheckboxItem } from '../ui';
import type { Provider, ProviderName, PermissionIntents, PluginInfo, SessionInfo, SessionOpts, SyncKeys, InitStep, StepResult, SecurityLevelConfig } from './types';
import {
  buildSkillContent,
  getAvailableSkillsFromRepo,
  readCupBlockFromFile,
  writeCupBlockToFile,
  installSkillWithMeta,
  listSimpleSessions,
  readSecurityBlockFromFile,
  writeSecurityBlockToFile,
  removeSecurityBlockFromFile,
} from './base';

let TOML: { parse: (s: string) => Record<string, unknown>; stringify: (o: Record<string, unknown>) => string } | null = null;
try { TOML = require('smol-toml'); } catch {}

export class CodexProvider implements Provider {
  readonly name: ProviderName = 'codex';
  readonly displayName = 'Codex CLI';
  readonly cliCommand = 'codex';
  readonly homeDir = path.join(HOME_DIR, '.codex');
  readonly projectDir = '.codex';
  readonly settingsFileName = 'config.toml';
  readonly instructionFileName = 'AGENTS.md';
  readonly skillsDir = path.join(HOME_DIR, '.agents', 'skills');

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
    installSkillWithMeta(skillDir, destDir, lang, 'codex.yaml', 'claude.yaml');
  }

  getInstalledSkills(): string[] {
    try {
      return fs.readdirSync(this.skillsDir, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name);
    } catch { return []; }
  }

  buildSkillContent(body: string, meta: Record<string, unknown>): string {
    return buildSkillContent(body, meta);
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
    return readCupBlockFromFile(this.getInstructionFilePath('global'));
  }

  writeCupBlock(block: string): void {
    writeCupBlockToFile(this.getInstructionFilePath('global'), block);
  }

  // --- Sessions ---

  listSessions(opts: SessionOpts): SessionInfo[] {
    return listSimpleSessions(
      path.join(this.homeDir, 'log'),
      'codex',
      ['.log', '.json'],
      '(codex session)',
      opts,
    );
  }

  resumeSession(_id: string, _fork?: boolean): void {
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
    return getAvailableSkillsFromRepo(this.name);
  }

  // --- Security ---

  applySecurityLevel(config: SecurityLevelConfig): void {
    const codexConfig = config.providers.codex;
    if (!codexConfig?.sandbox_mode) return;
    const settings = this.readSettings() || {};
    settings.sandbox_mode = codexConfig.sandbox_mode;
    this.writeSettings(settings);
  }

  readSecurityBlock(): string | null {
    return readSecurityBlockFromFile(this.getInstructionFilePath('global'));
  }

  writeSecurityBlock(content: string): void {
    writeSecurityBlockToFile(this.getInstructionFilePath('global'), content);
  }

  removeSecurityBlock(): void {
    removeSecurityBlockFromFile(this.getInstructionFilePath('global'));
  }
}
