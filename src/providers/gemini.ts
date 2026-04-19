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
  readGuidanceBlockFromFile,
  writeGuidanceBlockToFile,
  removeGuidanceBlockFromFile,
  listInstalledGuidanceInFile,
} from './base';

export class GeminiProvider implements Provider {
  readonly name: ProviderName = 'gemini';
  readonly displayName = 'Gemini CLI';
  readonly cliCommand = 'gemini';
  readonly homeDir = path.join(HOME_DIR, '.gemini');
  readonly projectDir = '.gemini';
  readonly settingsFileName = 'settings.json';
  readonly instructionFileName = 'GEMINI.md';
  readonly skillsDir = path.join(HOME_DIR, '.gemini', 'skills');

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
    installSkillWithMeta(skillDir, destDir, lang, 'gemini.yaml', 'claude.yaml');
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
    return readCupBlockFromFile(this.getInstructionFilePath('global'));
  }

  writeCupBlock(block: string): void {
    writeCupBlockToFile(this.getInstructionFilePath('global'), block);
  }

  // --- Sessions ---

  listSessions(opts: SessionOpts): SessionInfo[] {
    // Gemini CLI session history location TBD — best-effort scan
    return listSimpleSessions(
      path.join(this.homeDir, 'history'),
      'gemini',
      ['.json', '.jsonl'],
      '(gemini session)',
      opts,
    );
  }

  resumeSession(_id: string, _fork?: boolean): void {
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
        if (typeof val === 'number' || typeof val === 'boolean') {
          toml += `${key} = ${val}\n`;
        } else {
          // Escape backslash and double-quote for TOML basic strings
          const escaped = String(val).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
          toml += `${key} = "${escaped}"\n`;
        }
      }
      toml += '\n';
    }

    fs.writeFileSync(path.join(policyDir, 'cup-deny.toml'), toml);
  }

  getAvailableSkillsFromRepo(): CheckboxItem[] {
    return getAvailableSkillsFromRepo(this.name);
  }

  // --- Security ---

  applySecurityLevel(config: SecurityLevelConfig): void {
    const geminiConfig = config.providers.gemini;
    if (!geminiConfig?.policies) return;
    this.writePolicies(geminiConfig.policies);
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

  // --- Guidance ---

  readGuidanceBlock(category: string): string | null {
    return readGuidanceBlockFromFile(this.getInstructionFilePath('global'), category);
  }

  writeGuidanceBlock(category: string, block: string): void {
    writeGuidanceBlockToFile(this.getInstructionFilePath('global'), category, block);
  }

  removeGuidanceBlock(category: string): void {
    removeGuidanceBlockFromFile(this.getInstructionFilePath('global'), category);
  }

  listInstalledGuidance(): string[] {
    return listInstalledGuidanceInFile(this.getInstructionFilePath('global'));
  }
}
