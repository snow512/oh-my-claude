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
exports.CodexProvider = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const utils_1 = require("../utils");
const ui_1 = require("../ui");
const base_1 = require("./base");
let TOML = null;
try {
    TOML = require('smol-toml');
}
catch { }
class CodexProvider {
    constructor() {
        this.name = 'codex';
        this.displayName = 'Codex CLI';
        this.cliCommand = 'codex';
        this.homeDir = path.join(utils_1.HOME_DIR, '.codex');
        this.projectDir = '.codex';
        this.settingsFileName = 'config.toml';
        this.instructionFileName = 'AGENTS.md';
        this.skillsDir = path.join(utils_1.HOME_DIR, '.agents', 'skills');
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
        if (!TOML)
            return (0, utils_1.readJson)(this.getSettingsPath()); // fallback
        try {
            const content = fs.readFileSync(this.getSettingsPath(), 'utf-8');
            return TOML.parse(content);
        }
        catch {
            return null;
        }
    }
    writeSettings(data) {
        fs.mkdirSync(path.dirname(this.getSettingsPath()), { recursive: true });
        if (TOML) {
            fs.writeFileSync(this.getSettingsPath(), TOML.stringify(data) + '\n');
        }
        else {
            // Fallback: write as JSON if TOML not available
            (0, utils_1.writeJson)(this.getSettingsPath(), data);
        }
    }
    // --- Permissions ---
    mergePermissions(intents) {
        const preset = this.loadPreset();
        const settingsPreset = preset.settings;
        if (settingsPreset) {
            const current = this.readSettings() || {};
            for (const [key, val] of Object.entries(settingsPreset)) {
                current[key] = val;
            }
            this.writeSettings(current);
        }
    }
    getCurrentPermissions() {
        const settings = this.readSettings();
        const policy = settings?.approval_policy;
        const allow = typeof policy === 'string' ? [policy] : [];
        // Codex relies on sandbox for deny
        return { allow, deny: ['(sandbox enforced)'] };
    }
    // --- Plugins ---
    enablePlugins(plugins) {
        const settings = this.readSettings() || {};
        const pluginsObj = {};
        for (const p of plugins) {
            pluginsObj[p] = { enabled: true };
        }
        settings.plugins = pluginsObj;
        this.writeSettings(settings);
    }
    getEnabledPlugins() {
        const settings = this.readSettings();
        const plugins = settings?.plugins;
        if (!plugins)
            return [];
        return Object.entries(plugins)
            .filter(([, v]) => v.enabled)
            .map(([k]) => k);
    }
    getAvailablePlugins() {
        return [];
    }
    // --- Skills ---
    installSkill(skillDir, skillName, lang) {
        const destDir = path.join(this.skillsDir, skillName);
        (0, base_1.installSkillWithMeta)(skillDir, destDir, lang, 'codex.yaml', 'claude.yaml');
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
        return (0, base_1.buildSkillContent)(body, meta);
    }
    getSkillMeta(skillName) {
        const metaPath = path.join(utils_1.PACKAGE_ROOT, 'user-skills', skillName, 'meta', 'codex.yaml');
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
        const templatePath = path.join(utils_1.PACKAGE_ROOT, 'presets', 'agents-md.md');
        return fs.readFileSync(templatePath, 'utf-8').trim();
    }
    readCupBlock() {
        return (0, base_1.readCupBlockFromFile)(this.getInstructionFilePath('global'));
    }
    writeCupBlock(block) {
        (0, base_1.writeCupBlockToFile)(this.getInstructionFilePath('global'), block);
    }
    // --- Sessions ---
    listSessions(opts) {
        return (0, base_1.listSimpleSessions)(path.join(this.homeDir, 'log'), 'codex', ['.log', '.json'], '(codex session)', opts);
    }
    resumeSession(_id, _fork) {
        console.log(`  ${(0, ui_1.style)('⚠', ui_1.C.yellow)} Codex CLI session resume not yet supported`);
    }
    // --- Backup ---
    backupSettings() {
        return (0, utils_1.backup)(this.getSettingsPath());
    }
    getBackupExcludes() {
        return ['*/log/*'];
    }
    // --- Init Steps ---
    getInitSteps() {
        const provider = this;
        const preset = this.loadPreset();
        const settingsPreset = preset.settings;
        return [
            {
                label: 'Settings',
                async execute(useDefaults) {
                    if (!settingsPreset)
                        return { ok: false, label: 'Settings', detail: 'no preset' };
                    if (useDefaults) {
                        await (0, ui_1.progressLine)('Applying Codex settings', () => {
                            const current = provider.readSettings() || {};
                            for (const [key, val] of Object.entries(settingsPreset)) {
                                current[key] = val;
                            }
                            provider.writeSettings(current);
                        });
                    }
                    else {
                        const doIt = await (0, ui_1.ask)('Apply Codex settings?', true);
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
                label: 'AGENTS.md',
                async execute(useDefaults) {
                    const template = provider.getInstructionTemplate();
                    const existing = provider.readCupBlock();
                    if (existing) {
                        if (existing.trim() === template.trim()) {
                            return { ok: true, label: 'AGENTS.md', detail: 'up to date' };
                        }
                        let install = useDefaults;
                        if (!useDefaults)
                            install = await (0, ui_1.ask)('AGENTS.md cup section has updates. Apply?', true);
                        if (install) {
                            provider.writeCupBlock(template);
                            return { ok: true, label: 'AGENTS.md', detail: 'updated' };
                        }
                        return { ok: false, label: 'AGENTS.md', detail: 'skipped' };
                    }
                    let install = useDefaults;
                    if (!useDefaults)
                        install = await (0, ui_1.ask)('Add claude-up section to AGENTS.md?', true);
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
    getSyncKeys() {
        return {
            settingsKeys: ['approval_policy', 'plugins', 'features'],
            instructionFileKey: 'cup-agents-md.md',
        };
    }
    // --- Internal ---
    loadPreset() {
        const presetPath = path.join(utils_1.PACKAGE_ROOT, 'presets', 'codex.json');
        const preset = (0, utils_1.readJson)(presetPath);
        if (!preset) {
            console.error('ERROR: codex.json is missing or invalid');
            process.exit(1);
        }
        return preset;
    }
    getAvailableSkillsFromRepo() {
        return (0, base_1.getAvailableSkillsFromRepo)(this.name);
    }
    // --- Security ---
    applySecurityLevel(config) {
        const codexConfig = config.providers.codex;
        if (!codexConfig?.sandbox_mode)
            return;
        const settings = this.readSettings() || {};
        settings.sandbox_mode = codexConfig.sandbox_mode;
        this.writeSettings(settings);
    }
    readSecurityBlock() {
        return (0, base_1.readSecurityBlockFromFile)(this.getInstructionFilePath('global'));
    }
    writeSecurityBlock(content) {
        (0, base_1.writeSecurityBlockToFile)(this.getInstructionFilePath('global'), content);
    }
    removeSecurityBlock() {
        (0, base_1.removeSecurityBlockFromFile)(this.getInstructionFilePath('global'));
    }
}
exports.CodexProvider = CodexProvider;
