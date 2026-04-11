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
exports.GeminiProvider = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const utils_1 = require("../utils");
const ui_1 = require("../ui");
const HOME = require('os').homedir();
class GeminiProvider {
    constructor() {
        this.name = 'gemini';
        this.displayName = 'Gemini CLI';
        this.cliCommand = 'gemini';
        this.homeDir = path.join(HOME, '.gemini');
        this.projectDir = '.gemini';
        this.settingsFileName = 'settings.json';
        this.instructionFileName = 'GEMINI.md';
        this.skillsDir = path.join(HOME, '.gemini', 'skills');
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
        return path.join(projectRoot, this.projectDir, this.settingsFileName);
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
        // Write settings (tools.allowed)
        const settingsPreset = preset.settings;
        if (settingsPreset) {
            const current = this.readSettings() || {};
            for (const [key, val] of Object.entries(settingsPreset)) {
                current[key] = val;
            }
            this.writeSettings(current);
        }
        // Write policies (deny rules as TOML)
        const policies = preset.policies;
        if (policies && policies.length > 0) {
            this.writePolicies(policies);
        }
    }
    getCurrentPermissions() {
        const settings = this.readSettings();
        const tools = settings?.tools || {};
        const allowed = tools.allowed || [];
        // Read policies for deny rules
        const deny = [];
        const policyDir = path.join(this.homeDir, 'policies');
        try {
            const cupPolicy = path.join(policyDir, 'cup-deny.toml');
            if (fs.existsSync(cupPolicy)) {
                const content = fs.readFileSync(cupPolicy, 'utf-8');
                const patterns = content.match(/argsPattern\s*=\s*"([^"]+)"/g) || [];
                for (const p of patterns) {
                    const m = p.match(/"([^"]+)"/);
                    if (m)
                        deny.push(m[1]);
                }
            }
        }
        catch { }
        return { allow: allowed, deny };
    }
    // --- Plugins / Extensions ---
    enablePlugins(plugins) {
        // Gemini uses extensions, managed via `gemini extensions install`
        // We store the list in settings for reference
        const settings = this.readSettings() || {};
        settings.cupExtensions = plugins;
        this.writeSettings(settings);
    }
    getEnabledPlugins() {
        const settings = this.readSettings();
        return settings?.cupExtensions || [];
    }
    getAvailablePlugins() {
        // Gemini extensions are installed separately; no preset list for now
        return [];
    }
    // --- Skills ---
    installSkill(skillDir, skillName, lang) {
        const destDir = path.join(this.skillsDir, skillName);
        const metaPath = path.join(skillDir, 'meta', 'gemini.yaml');
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
            // Fallback to claude meta if gemini not available
            const claudeMetaPath = path.join(skillDir, 'meta', 'claude.yaml');
            if (fs.existsSync(claudeMetaPath)) {
                const meta = (0, utils_1.parseSimpleYaml)(fs.readFileSync(claudeMetaPath, 'utf-8'));
                content = this.buildSkillContent(body, meta);
            }
            else {
                content = body;
            }
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
        const metaPath = path.join(utils_1.PACKAGE_ROOT, 'user-skills', skillName, 'meta', 'gemini.yaml');
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
        const templatePath = path.join(utils_1.PACKAGE_ROOT, 'presets', 'gemini-md.md');
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
        // Gemini CLI session history location TBD
        // Check common paths
        const historyDir = path.join(this.homeDir, 'history');
        if (!fs.existsSync(historyDir))
            return [];
        // Best-effort: list files if they exist
        const sessions = [];
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
        }
        catch { }
        sessions.sort((a, b) => b.date.getTime() - a.date.getTime());
        return sessions.slice(0, opts.limit || 10);
    }
    resumeSession(id, fork) {
        // Gemini CLI resume support TBD
        console.log(`  ${(0, ui_1.style)('⚠', ui_1.C.yellow)} Gemini CLI session resume not yet supported`);
    }
    // --- Backup ---
    backupSettings() {
        return (0, utils_1.backup)(this.getSettingsPath());
    }
    getBackupExcludes() {
        return ['*/extensions/*/node_modules/*'];
    }
    // --- Init Steps ---
    getInitSteps() {
        const provider = this;
        const preset = this.loadPreset();
        const settingsPreset = preset.settings;
        const policies = preset.policies;
        return [
            {
                label: 'Settings',
                async execute(useDefaults) {
                    if (!settingsPreset)
                        return { ok: false, label: 'Settings', detail: 'no preset' };
                    if (useDefaults) {
                        await (0, ui_1.progressLine)('Applying Gemini settings', () => {
                            const current = provider.readSettings() || {};
                            for (const [key, val] of Object.entries(settingsPreset)) {
                                current[key] = val;
                            }
                            provider.writeSettings(current);
                        });
                    }
                    else {
                        const doIt = await (0, ui_1.ask)('Apply Gemini settings?', true);
                        if (!doIt)
                            return { ok: false, label: 'Settings', detail: 'skipped' };
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
                async execute(useDefaults) {
                    if (!policies || policies.length === 0)
                        return { ok: false, label: 'Policies', detail: 'none' };
                    if (useDefaults) {
                        await (0, ui_1.progressLine)(`Applying ${policies.length} deny policies`, () => {
                            provider.writePolicies(policies);
                        });
                    }
                    else {
                        const doIt = await (0, ui_1.ask)(`Apply ${policies.length} deny policies?`, true);
                        if (!doIt)
                            return { ok: false, label: 'Policies', detail: 'skipped' };
                        provider.writePolicies(policies);
                    }
                    return { ok: true, label: 'Policies', detail: `${policies.length} rules` };
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
                label: 'GEMINI.md',
                async execute(useDefaults) {
                    const template = provider.getInstructionTemplate();
                    const existing = provider.readCupBlock();
                    if (existing) {
                        if (existing.trim() === template.trim()) {
                            return { ok: true, label: 'GEMINI.md', detail: 'up to date' };
                        }
                        let install = useDefaults;
                        if (!useDefaults)
                            install = await (0, ui_1.ask)('GEMINI.md cup section has updates. Apply?', true);
                        if (install) {
                            provider.writeCupBlock(template);
                            return { ok: true, label: 'GEMINI.md', detail: 'updated' };
                        }
                        return { ok: false, label: 'GEMINI.md', detail: 'skipped' };
                    }
                    let install = useDefaults;
                    if (!useDefaults)
                        install = await (0, ui_1.ask)('Add claude-up section to GEMINI.md?', true);
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
    getSyncKeys() {
        return {
            settingsKeys: ['general', 'tools', 'security'],
            instructionFileKey: 'cup-gemini-md.md',
        };
    }
    // --- Internal ---
    loadPreset() {
        const presetPath = path.join(utils_1.PACKAGE_ROOT, 'presets', 'gemini.json');
        const preset = (0, utils_1.readJson)(presetPath);
        if (!preset) {
            console.error('ERROR: gemini.json is missing or invalid');
            process.exit(1);
        }
        return preset;
    }
    writePolicies(policies) {
        const policyDir = path.join(this.homeDir, 'policies');
        fs.mkdirSync(policyDir, { recursive: true });
        let toml = '# Generated by claude-up — deny rules for destructive commands\n\n';
        for (const rule of policies) {
            toml += '[[rules]]\n';
            for (const [key, val] of Object.entries(rule)) {
                if (typeof val === 'number')
                    toml += `${key} = ${val}\n`;
                else
                    toml += `${key} = "${val}"\n`;
            }
            toml += '\n';
        }
        fs.writeFileSync(path.join(policyDir, 'cup-deny.toml'), toml);
    }
    getAvailableSkillsFromRepo() {
        const skillsSrc = path.join(utils_1.PACKAGE_ROOT, 'user-skills');
        try {
            return fs.readdirSync(skillsSrc, { withFileTypes: true })
                .filter(e => e.isDirectory())
                .map(e => {
                let desc = '';
                const metaPath = path.join(skillsSrc, e.name, 'meta', 'gemini.yaml');
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
exports.GeminiProvider = GeminiProvider;
const CUP_START = '<!-- <cup>';
const CUP_END = '<!-- </cup> -->';
