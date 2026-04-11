"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaudeProvider = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const utils_1 = require("../utils");
const ui_1 = require("../ui");
const HOME = require('os').homedir();
class ClaudeProvider {
    constructor() {
        this.name = 'claude';
        this.displayName = 'Claude Code';
        this.cliCommand = 'claude';
        this.homeDir = path.join(HOME, '.claude');
        this.projectDir = '.claude';
        this.settingsFileName = 'settings.json';
        this.instructionFileName = 'CLAUDE.md';
        this.skillsDir = path.join(HOME, '.claude', 'skills');
    }
    // --- Detection ---
    isInstalled() {
        try {
            (0, child_process_1.execFileSync)('which', [this.cliCommand], { stdio: 'pipe', encoding: 'utf-8' });
            return true;
        }
        catch {
            return fs.existsSync(this.homeDir);
        }
    }
    // --- Settings ---
    getSettingsPath() {
        return path.join(this.homeDir, this.settingsFileName);
    }
    getProjectSettingsPath(projectRoot) {
        return path.join(projectRoot, this.projectDir, 'settings.local.json');
    }
    readSettings() {
        return (0, utils_1.readJson)(this.getSettingsPath());
    }
    writeSettings(data) {
        (0, utils_1.writeJson)(this.getSettingsPath(), data);
    }
    // --- Permissions ---
    mergePermissions(intents) {
        const preset = this.loadPreset();
        const presetPerms = preset.permissions;
        const settings = this.readSettings() || {};
        settings.permissions = {
            allow: presetPerms?.allow || [],
            deny: presetPerms?.deny || [],
        };
        this.writeSettings(settings);
    }
    getCurrentPermissions() {
        const settings = this.readSettings();
        const perms = settings?.permissions || {};
        return { allow: perms.allow || [], deny: perms.deny || [] };
    }
    // --- Plugins ---
    enablePlugins(plugins) {
        const settings = this.readSettings() || {};
        const enabledPlugins = {};
        for (const p of plugins)
            enabledPlugins[p] = true;
        settings.enabledPlugins = enabledPlugins;
        const preset = this.loadPreset();
        if (preset.extraKnownMarketplaces) {
            settings.extraKnownMarketplaces = preset.extraKnownMarketplaces;
        }
        this.writeSettings(settings);
    }
    getEnabledPlugins() {
        const settings = this.readSettings();
        return Object.keys(settings?.enabledPlugins || {});
    }
    getAvailablePlugins() {
        const preset = this.loadPreset();
        return Object.keys(preset.enabledPlugins || {}).map(id => ({
            id,
            name: id.replace(/@.*$/, ''),
        }));
    }
    // --- Skills ---
    installSkill(skillDir, skillName, lang) {
        const destDir = path.join(this.skillsDir, skillName);
        const metaPath = path.join(skillDir, 'meta', 'claude.yaml');
        const bodyFile = lang === 'ko' ? 'SKILL.ko.md' : 'SKILL.md';
        const bodyPath = path.join(skillDir, bodyFile);
        const fallbackPath = path.join(skillDir, 'SKILL.md');
        const body = fs.existsSync(bodyPath)
            ? fs.readFileSync(bodyPath, 'utf-8')
            : fs.readFileSync(fallbackPath, 'utf-8');
        let content;
        if (fs.existsSync(metaPath)) {
            const meta = (0, utils_1.parseSimpleYaml)(fs.readFileSync(metaPath, 'utf-8'));
            content = this.buildSkillContent(body, meta);
        }
        else {
            content = body;
        }
        fs.mkdirSync(destDir, { recursive: true });
        fs.writeFileSync(path.join(destDir, 'SKILL.md'), content);
    }
    getInstalledSkills() {
        try {
            return fs.readdirSync(this.skillsDir, { withFileTypes: true })
                .filter(e => e.isDirectory())
                .map(e => e.name);
        }
        catch {
            return [];
        }
    }
    buildSkillContent(body, meta) {
        const lines = ['---'];
        for (const [key, val] of Object.entries(meta)) {
            const strVal = String(val);
            if (strVal.includes('\n')) {
                lines.push(`${key}: >`);
                for (const line of strVal.split('\n'))
                    lines.push(`  ${line}`);
            }
            else {
                lines.push(`${key}: ${strVal}`);
            }
        }
        lines.push('---', '');
        return lines.join('\n') + body;
    }
    getSkillMeta(skillName) {
        const metaPath = path.join(utils_1.PACKAGE_ROOT, 'user-skills', skillName, 'meta', 'claude.yaml');
        try {
            return (0, utils_1.parseSimpleYaml)(fs.readFileSync(metaPath, 'utf-8'));
        }
        catch {
            return null;
        }
    }
    // --- Instruction File ---
    getInstructionFilePath(scope) {
        if (scope === 'global')
            return path.join(this.homeDir, this.instructionFileName);
        return this.instructionFileName;
    }
    getInstructionTemplate() {
        const templatePath = path.join(utils_1.PACKAGE_ROOT, 'presets', 'claude-md.md');
        return fs.readFileSync(templatePath, 'utf-8').trim();
    }
    readCupBlock() {
        const filePath = this.getInstructionFilePath('global');
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const start = content.indexOf(CUP_START);
            const end = content.indexOf(CUP_END);
            if (start === -1 || end === -1)
                return null;
            return content.slice(start, end + CUP_END.length);
        }
        catch {
            return null;
        }
    }
    writeCupBlock(block) {
        const filePath = this.getInstructionFilePath('global');
        let content = '';
        try {
            content = fs.readFileSync(filePath, 'utf-8');
        }
        catch { }
        const start = content.indexOf(CUP_START);
        const end = content.indexOf(CUP_END);
        if (start !== -1 && end !== -1) {
            content = content.slice(0, start) + block + content.slice(end + CUP_END.length);
        }
        else {
            content = content ? content.trimEnd() + '\n\n' + block + '\n' : block + '\n';
        }
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content);
    }
    // --- Sessions ---
    listSessions(opts) {
        const projectsDir = path.join(this.homeDir, 'projects');
        if (!fs.existsSync(projectsDir))
            return [];
        const projects = fs.readdirSync(projectsDir, { withFileTypes: true }).filter(e => e.isDirectory());
        let cwd;
        try {
            cwd = (0, child_process_1.execFileSync)('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf-8' }).trim();
        }
        catch {
            cwd = process.cwd();
        }
        const cwdEncoded = cwd.replace(/\//g, '-');
        const sessions = [];
        for (const proj of projects) {
            const projPath = path.join(projectsDir, proj.name);
            const projName = proj.name.replace(/^-home-[^-]+-(Workspace-|Garage-)?/, '').replace(/^-/, '') || proj.name;
            if (opts.project) {
                if (!projName.toLowerCase().includes(opts.project.toLowerCase()))
                    continue;
            }
            else if (!opts.all) {
                if (!proj.name.includes(cwdEncoded.slice(1)))
                    continue;
            }
            let files;
            try {
                files = fs.readdirSync(projPath).filter(f => f.endsWith('.jsonl'));
            }
            catch {
                continue;
            }
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
                                if (content.startsWith('<local-command-caveat>') || content.startsWith('<command-'))
                                    continue;
                                firstMessage = content.replace(/<[^>]+>/g, '').trim().slice(0, 80);
                                break;
                            }
                        }
                        catch { }
                    }
                    sessions.push({ id: file.replace('.jsonl', ''), project: projName, date: stat.mtime, size: stat.size, firstMessage: firstMessage || '(empty)' });
                }
                catch { }
            }
        }
        sessions.sort((a, b) => b.date.getTime() - a.date.getTime());
        return sessions.slice(0, opts.limit || 10);
    }
    resumeSession(id, fork) {
        const args = ['--resume', id];
        if (fork)
            args.push('--fork-session');
        try {
            (0, child_process_1.execFileSync)(this.cliCommand, args, { stdio: 'inherit' });
        }
        catch (err) {
            if (err.status)
                process.exit(err.status);
        }
    }
    // --- Status Line ---
    installStatusLine() {
        const src = path.join(utils_1.PACKAGE_ROOT, 'statusline-command.sh');
        const dest = path.join(this.homeDir, 'statusline-command.sh');
        if (!fs.existsSync(src))
            return;
        fs.copyFileSync(src, dest);
        fs.chmodSync(dest, 0o755);
        const settings = this.readSettings() || {};
        if (!settings.statusLine) {
            settings.statusLine = { type: 'command', command: `bash ${dest}` };
            this.writeSettings(settings);
        }
    }
    hasStatusLine() {
        return fs.existsSync(path.join(this.homeDir, 'statusline-command.sh'));
    }
    // --- Backup ---
    backupSettings() {
        return (0, utils_1.backup)(this.getSettingsPath());
    }
    getBackupExcludes() {
        return ['*/plugins/cache/*', '*/plugins/marketplaces/*'];
    }
    // --- Init Steps ---
    getInitSteps() {
        const provider = this;
        const preset = this.loadPreset();
        const presetPerms = preset.permissions;
        const settingsPath = this.getSettingsPath();
        return [
            {
                label: 'Permissions (allow)',
                async execute(useDefaults) {
                    const allAllow = presetPerms?.allow || [];
                    let selected;
                    if (useDefaults) {
                        await (0, ui_1.progressLine)(`Applying ${allAllow.length} allow rules`, () => { });
                        selected = allAllow;
                    }
                    else {
                        console.log('');
                        const items = allAllow.map((r) => ({ name: r, desc: '' }));
                        selected = await (0, ui_1.checkbox)(items);
                        console.log(`  ${(0, ui_1.style)('\u2713', ui_1.C.green)} ${selected.length}/${allAllow.length} allow rules selected`);
                    }
                    const settings = (0, utils_1.readJson)(settingsPath) || {};
                    const perms = settings.permissions || {};
                    perms.allow = selected;
                    settings.permissions = perms;
                    (0, utils_1.writeJson)(settingsPath, settings);
                    return { ok: true, label: 'Allow rules', detail: `${selected.length} configured` };
                },
            },
            {
                label: 'Permissions (deny)',
                async execute(useDefaults) {
                    const allDeny = presetPerms?.deny || [];
                    let selected;
                    if (useDefaults) {
                        await (0, ui_1.progressLine)(`Applying ${allDeny.length} deny rules`, () => { });
                        selected = allDeny;
                    }
                    else {
                        console.log('');
                        const items = allDeny.map((r) => ({ name: r, desc: '' }));
                        selected = await (0, ui_1.checkbox)(items);
                        console.log(`  ${(0, ui_1.style)('\u2713', ui_1.C.green)} ${selected.length}/${allDeny.length} deny rules selected`);
                    }
                    const settings = (0, utils_1.readJson)(settingsPath) || {};
                    const perms = settings.permissions || {};
                    perms.deny = selected;
                    settings.permissions = perms;
                    (0, utils_1.writeJson)(settingsPath, settings);
                    return { ok: true, label: 'Deny rules', detail: `${selected.length} configured` };
                },
            },
            {
                label: 'Plugins',
                async execute(useDefaults) {
                    const allPlugins = Object.keys(preset.enabledPlugins || {});
                    let selected;
                    if (useDefaults) {
                        await (0, ui_1.progressLine)(`Enabling ${allPlugins.length} plugins`, () => { });
                        selected = allPlugins;
                    }
                    else {
                        console.log('');
                        const items = allPlugins.map(p => ({ name: p, desc: p.replace(/@.*$/, '') }));
                        selected = await (0, ui_1.checkbox)(items);
                        console.log(`  ${(0, ui_1.style)('\u2713', ui_1.C.green)} ${selected.length}/${allPlugins.length} plugins selected`);
                    }
                    const enabledPlugins = {};
                    for (const p of selected)
                        enabledPlugins[p] = true;
                    const settings = (0, utils_1.readJson)(settingsPath) || {};
                    settings.enabledPlugins = enabledPlugins;
                    settings.extraKnownMarketplaces = preset.extraKnownMarketplaces;
                    (0, utils_1.writeJson)(settingsPath, settings);
                    await (0, ui_1.progressLine)('Configuring marketplaces', () => { });
                    return { ok: true, label: 'Plugins', detail: `${selected.length} enabled` };
                },
            },
            {
                label: 'User Skills',
                async execute(useDefaults, lang) {
                    const skillsSrc = path.join(utils_1.PACKAGE_ROOT, 'user-skills');
                    const available = provider.getAvailableSkillsFromRepo();
                    if (available.length === 0)
                        return { ok: false, label: 'Skills', detail: 'no skills found' };
                    let selectedNames;
                    if (useDefaults) {
                        selectedNames = available.map(s => s.name);
                        await (0, ui_1.progressLine)(`Installing all ${available.length} skills (${lang})`, () => {
                            for (const name of selectedNames) {
                                provider.installSkill(path.join(skillsSrc, name), name, lang);
                            }
                        });
                    }
                    else {
                        console.log('');
                        selectedNames = await (0, ui_1.checkbox)(available);
                        for (const name of selectedNames) {
                            provider.installSkill(path.join(skillsSrc, name), name, lang);
                        }
                        console.log(`  ${(0, ui_1.style)('\u2713', ui_1.C.green)} ${selectedNames.length} skills installed (${lang})`);
                    }
                    return { ok: true, label: 'Skills', detail: `${selectedNames.length}/${available.length} installed` };
                },
            },
            {
                label: 'Status Line',
                async execute(useDefaults) {
                    const statuslineSrc = path.join(utils_1.PACKAGE_ROOT, 'statusline-command.sh');
                    if (!fs.existsSync(statuslineSrc))
                        return { ok: false, label: 'Status Line', detail: 'not available' };
                    let install = useDefaults;
                    if (!useDefaults) {
                        const exists = provider.hasStatusLine();
                        const q = exists ? 'Status line exists. Overwrite?' : 'Install custom status line?';
                        install = await (0, ui_1.ask)(q, true);
                    }
                    if (install) {
                        await (0, ui_1.progressLine)('Installing status line', () => provider.installStatusLine());
                        return { ok: true, label: 'Status Line', detail: 'installed' };
                    }
                    return { ok: false, label: 'Status Line', detail: 'skipped' };
                },
            },
            {
                label: 'CLAUDE.md',
                async execute(useDefaults) {
                    const template = provider.getInstructionTemplate();
                    const existing = provider.readCupBlock();
                    if (existing) {
                        if (existing.trim() === template.trim()) {
                            return { ok: true, label: 'CLAUDE.md', detail: 'up to date' };
                        }
                        let install = useDefaults;
                        if (!useDefaults)
                            install = await (0, ui_1.ask)('CLAUDE.md cup section has updates. Apply?', true);
                        if (install) {
                            provider.writeCupBlock(template);
                            return { ok: true, label: 'CLAUDE.md', detail: 'updated' };
                        }
                        return { ok: false, label: 'CLAUDE.md', detail: 'skipped' };
                    }
                    let install = useDefaults;
                    if (!useDefaults)
                        install = await (0, ui_1.ask)('Add claude-up section to CLAUDE.md?', true);
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
    getSyncKeys() {
        return {
            settingsKeys: ['permissions', 'enabledPlugins', 'extraKnownMarketplaces'],
            instructionFileKey: 'cup-claude-md.md',
        };
    }
    // --- Internal helpers ---
    loadPreset() {
        const presetPath = path.join(utils_1.PACKAGE_ROOT, 'presets', 'claude.json');
        const preset = (0, utils_1.readJson)(presetPath);
        if (!preset || !preset.permissions) {
            console.error('ERROR: claude.json is missing or invalid');
            process.exit(1);
        }
        return preset;
    }
    getAvailableSkillsFromRepo() {
        const skillsSrc = path.join(utils_1.PACKAGE_ROOT, 'user-skills');
        try {
            return fs.readdirSync(skillsSrc, { withFileTypes: true })
                .filter(e => e.isDirectory())
                .map(e => {
                let desc = '';
                const metaPath = path.join(skillsSrc, e.name, 'meta', 'claude.yaml');
                try {
                    const meta = (0, utils_1.parseSimpleYaml)(fs.readFileSync(metaPath, 'utf-8'));
                    if (meta.description)
                        desc = String(meta.description).trim().slice(0, 50);
                }
                catch { }
                return { name: e.name, desc: desc || '(no description)' };
            });
        }
        catch {
            return [];
        }
    }
}
exports.ClaudeProvider = ClaudeProvider;
// --- Constants ---
const CUP_START = '<!-- <cup>';
const CUP_END = '<!-- </cup> -->';
