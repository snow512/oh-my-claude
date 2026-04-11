import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { readJson, writeJson, backup, copyDirRecursive, parseSimpleYaml, PACKAGE_ROOT } from '../utils';
import { progressLine, ask, checkbox, C, style } from '../ui';
import type { CheckboxItem } from '../ui';
import type { Provider, ProviderName, PermissionIntents, PluginInfo, SessionInfo, SessionOpts, SyncKeys, InitStep, StepResult } from './types';

const HOME = require('os').homedir();

export class ClaudeProvider implements Provider {
  readonly name: ProviderName = 'claude';
  readonly displayName = 'Claude Code';
  readonly cliCommand = 'claude';
  readonly homeDir = path.join(HOME, '.claude');
  readonly projectDir = '.claude';
  readonly settingsFileName = 'settings.json';
  readonly instructionFileName = 'CLAUDE.md';
  readonly skillsDir = path.join(HOME, '.claude', 'skills');

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
    return path.join(projectRoot, this.projectDir, 'settings.local.json');
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
    const presetPerms = preset.permissions as { allow?: string[]; deny?: string[] } | undefined;
    const settings = this.readSettings() || {};
    settings.permissions = {
      allow: presetPerms?.allow || [],
      deny: presetPerms?.deny || [],
    };
    this.writeSettings(settings);
  }

  getCurrentPermissions(): { allow: string[]; deny: string[] } {
    const settings = this.readSettings();
    const perms = (settings?.permissions as { allow?: string[]; deny?: string[] }) || {};
    return { allow: perms.allow || [], deny: perms.deny || [] };
  }

  // --- Plugins ---

  enablePlugins(plugins: string[]): void {
    const settings = this.readSettings() || {};
    const enabledPlugins: Record<string, boolean> = {};
    for (const p of plugins) enabledPlugins[p] = true;
    settings.enabledPlugins = enabledPlugins;

    const preset = this.loadPreset();
    if (preset.extraKnownMarketplaces) {
      settings.extraKnownMarketplaces = preset.extraKnownMarketplaces;
    }
    this.writeSettings(settings);
  }

  getEnabledPlugins(): string[] {
    const settings = this.readSettings();
    return Object.keys((settings?.enabledPlugins as Record<string, boolean>) || {});
  }

  getAvailablePlugins(): PluginInfo[] {
    const preset = this.loadPreset();
    return Object.keys(preset.enabledPlugins || {}).map(id => ({
      id,
      name: id.replace(/@.*$/, ''),
    }));
  }

  // --- Skills ---

  installSkill(skillDir: string, skillName: string, lang: string): void {
    const destDir = path.join(this.skillsDir, skillName);
    const metaPath = path.join(skillDir, 'meta', 'claude.yaml');
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
      content = body;
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
    const metaPath = path.join(PACKAGE_ROOT, 'user-skills', skillName, 'meta', 'claude.yaml');
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
    const templatePath = path.join(PACKAGE_ROOT, 'presets', 'claude-md.md');
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
    const projectsDir = path.join(this.homeDir, 'projects');
    if (!fs.existsSync(projectsDir)) return [];

    const projects = fs.readdirSync(projectsDir, { withFileTypes: true }).filter(e => e.isDirectory());

    let cwd: string;
    try { cwd = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf-8' }).trim(); }
    catch { cwd = process.cwd(); }
    const cwdEncoded = cwd.replace(/\//g, '-');

    const sessions: SessionInfo[] = [];

    for (const proj of projects) {
      const projPath = path.join(projectsDir, proj.name);
      const projName = proj.name.replace(/^-home-[^-]+-(Workspace-|Garage-)?/, '').replace(/^-/, '') || proj.name;

      if (opts.project) { if (!projName.toLowerCase().includes(opts.project.toLowerCase())) continue; }
      else if (!opts.all) { if (!proj.name.includes(cwdEncoded.slice(1))) continue; }

      let files: string[];
      try { files = fs.readdirSync(projPath).filter(f => f.endsWith('.jsonl')); }
      catch { continue; }

      for (const file of files) {
        const filePath = path.join(projPath, file);
        try {
          const stat = fs.statSync(filePath);
          const fd = fs.openSync(filePath, 'r');
          const buf = Buffer.alloc(4000);
          fs.readSync(fd, buf, 0, 4000, 0);
          fs.closeSync(fd);

          let firstMessage = '';
          for (const line of buf.toString('utf-8').split('\n')) {
            try {
              const obj = JSON.parse(line);
              if (obj.type === 'user' && obj.message?.content) {
                const content = typeof obj.message.content === 'string' ? obj.message.content : JSON.stringify(obj.message.content);
                if (content.startsWith('<local-command-caveat>') || content.startsWith('<command-')) continue;
                firstMessage = content.replace(/<[^>]+>/g, '').trim().slice(0, 80);
                break;
              }
            } catch {}
          }

          sessions.push({ id: file.replace('.jsonl', ''), project: projName, date: stat.mtime, size: stat.size, firstMessage: firstMessage || '(empty)' });
        } catch {}
      }
    }

    sessions.sort((a, b) => b.date.getTime() - a.date.getTime());
    return sessions.slice(0, opts.limit || 10);
  }

  resumeSession(id: string, fork?: boolean): void {
    const args = ['--resume', id];
    if (fork) args.push('--fork-session');
    try { execFileSync(this.cliCommand, args, { stdio: 'inherit' }); }
    catch (err: unknown) { if ((err as { status?: number }).status) process.exit((err as { status: number }).status); }
  }

  // --- Status Line ---

  installStatusLine(): void {
    const src = path.join(PACKAGE_ROOT, 'statusline-command.sh');
    const dest = path.join(this.homeDir, 'statusline-command.sh');
    if (!fs.existsSync(src)) return;
    fs.copyFileSync(src, dest);
    fs.chmodSync(dest, 0o755);
    const settings = this.readSettings() || {};
    if (!settings.statusLine) {
      settings.statusLine = { type: 'command', command: `bash ${dest}` };
      this.writeSettings(settings);
    }
  }

  hasStatusLine(): boolean {
    return fs.existsSync(path.join(this.homeDir, 'statusline-command.sh'));
  }

  // --- Backup ---

  backupSettings(): string | null {
    return backup(this.getSettingsPath());
  }

  getBackupExcludes(): string[] {
    return ['*/plugins/cache/*', '*/plugins/marketplaces/*'];
  }

  // --- Init Steps ---

  getInitSteps(): InitStep[] {
    const provider = this;
    const preset = this.loadPreset();
    const presetPerms = preset.permissions as { allow?: string[]; deny?: string[] } | undefined;
    const settingsPath = this.getSettingsPath();

    return [
      {
        label: 'Permissions (allow)',
        async execute(useDefaults: boolean): Promise<StepResult> {
          const allAllow = presetPerms?.allow || [];
          let selected: string[];
          if (useDefaults) {
            await progressLine(`Applying ${allAllow.length} allow rules`, () => {});
            selected = allAllow;
          } else {
            console.log('');
            const items: CheckboxItem[] = allAllow.map((r: string) => ({ name: r, desc: '' }));
            selected = await checkbox(items);
            console.log(`  ${style('\u2713', C.green)} ${selected.length}/${allAllow.length} allow rules selected`);
          }
          const settings = readJson(settingsPath) || {};
          const perms = (settings.permissions as Record<string, unknown>) || {};
          perms.allow = selected;
          settings.permissions = perms;
          writeJson(settingsPath, settings);
          return { ok: true, label: 'Allow rules', detail: `${selected.length} configured` };
        },
      },
      {
        label: 'Permissions (deny)',
        async execute(useDefaults: boolean): Promise<StepResult> {
          const allDeny = presetPerms?.deny || [];
          let selected: string[];
          if (useDefaults) {
            await progressLine(`Applying ${allDeny.length} deny rules`, () => {});
            selected = allDeny;
          } else {
            console.log('');
            const items: CheckboxItem[] = allDeny.map((r: string) => ({ name: r, desc: '' }));
            selected = await checkbox(items);
            console.log(`  ${style('\u2713', C.green)} ${selected.length}/${allDeny.length} deny rules selected`);
          }
          const settings = readJson(settingsPath) || {};
          const perms = (settings.permissions as Record<string, unknown>) || {};
          perms.deny = selected;
          settings.permissions = perms;
          writeJson(settingsPath, settings);
          return { ok: true, label: 'Deny rules', detail: `${selected.length} configured` };
        },
      },
      {
        label: 'Plugins',
        async execute(useDefaults: boolean): Promise<StepResult> {
          const allPlugins = Object.keys(preset.enabledPlugins || {});
          let selected: string[];
          if (useDefaults) {
            await progressLine(`Enabling ${allPlugins.length} plugins`, () => {});
            selected = allPlugins;
          } else {
            console.log('');
            const items: CheckboxItem[] = allPlugins.map(p => ({ name: p, desc: p.replace(/@.*$/, '') }));
            selected = await checkbox(items);
            console.log(`  ${style('\u2713', C.green)} ${selected.length}/${allPlugins.length} plugins selected`);
          }
          const enabledPlugins: Record<string, boolean> = {};
          for (const p of selected) enabledPlugins[p] = true;
          const settings = readJson(settingsPath) || {};
          settings.enabledPlugins = enabledPlugins;
          settings.extraKnownMarketplaces = preset.extraKnownMarketplaces;
          writeJson(settingsPath, settings);
          await progressLine('Configuring marketplaces', () => {});
          return { ok: true, label: 'Plugins', detail: `${selected.length} enabled` };
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
        label: 'Status Line',
        async execute(useDefaults: boolean): Promise<StepResult> {
          const statuslineSrc = path.join(PACKAGE_ROOT, 'statusline-command.sh');
          if (!fs.existsSync(statuslineSrc)) return { ok: false, label: 'Status Line', detail: 'not available' };

          let install = useDefaults;
          if (!useDefaults) {
            const exists = provider.hasStatusLine!();
            const q = exists ? 'Status line exists. Overwrite?' : 'Install custom status line?';
            install = await ask(q, true);
          }
          if (install) {
            await progressLine('Installing status line', () => provider.installStatusLine!());
            return { ok: true, label: 'Status Line', detail: 'installed' };
          }
          return { ok: false, label: 'Status Line', detail: 'skipped' };
        },
      },
      {
        label: 'CLAUDE.md',
        async execute(useDefaults: boolean): Promise<StepResult> {
          const template = provider.getInstructionTemplate();
          const existing = provider.readCupBlock();

          if (existing) {
            if (existing.trim() === template.trim()) {
              return { ok: true, label: 'CLAUDE.md', detail: 'up to date' };
            }
            let install = useDefaults;
            if (!useDefaults) install = await ask('CLAUDE.md cup section has updates. Apply?', true);
            if (install) {
              provider.writeCupBlock(template);
              return { ok: true, label: 'CLAUDE.md', detail: 'updated' };
            }
            return { ok: false, label: 'CLAUDE.md', detail: 'skipped' };
          }

          let install = useDefaults;
          if (!useDefaults) install = await ask('Add claude-up section to CLAUDE.md?', true);
          if (install) {
            provider.writeCupBlock(template);
            return { ok: true, label: 'CLAUDE.md', detail: 'installed' };
          }
          return { ok: false, label: 'CLAUDE.md', detail: 'skipped' };
        },
      },
    ];
  }

  // --- Sync ---

  getSyncKeys(): SyncKeys {
    return {
      settingsKeys: ['permissions', 'enabledPlugins', 'extraKnownMarketplaces'],
      instructionFileKey: 'cup-claude-md.md',
    };
  }

  // --- Internal helpers ---

  private loadPreset(): Record<string, unknown> {
    const presetPath = path.join(PACKAGE_ROOT, 'presets', 'claude.json');
    const preset = readJson(presetPath);
    if (!preset || !(preset as Record<string, unknown>).permissions) {
      console.error('ERROR: claude.json is missing or invalid');
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
          const metaPath = path.join(skillsSrc, e.name, 'meta', 'claude.yaml');
          try {
            const meta = parseSimpleYaml(fs.readFileSync(metaPath, 'utf-8'));
            if (meta.description) desc = String(meta.description).trim().slice(0, 50);
          } catch {}
          return { name: e.name, desc: desc || '(no description)' };
        });
    } catch { return []; }
  }
}

// --- Constants ---

const CUP_START = '<!-- <cup>';
const CUP_END = '<!-- </cup> -->';
