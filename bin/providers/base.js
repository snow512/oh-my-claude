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
exports.CUP_SECURITY_END = exports.CUP_SECURITY_START = exports.CUP_END = exports.CUP_START = void 0;
exports.buildSkillContent = buildSkillContent;
exports.getAvailableSkillsFromRepo = getAvailableSkillsFromRepo;
exports.readCupBlockFromFile = readCupBlockFromFile;
exports.writeCupBlockToFile = writeCupBlockToFile;
exports.readSecurityBlockFromFile = readSecurityBlockFromFile;
exports.writeSecurityBlockToFile = writeSecurityBlockToFile;
exports.removeSecurityBlockFromFile = removeSecurityBlockFromFile;
exports.listSimpleSessions = listSimpleSessions;
exports.readSkillBody = readSkillBody;
exports.installSkillWithMeta = installSkillWithMeta;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const utils_1 = require("../utils");
// --- Shared constants ---
exports.CUP_START = '<!-- <cup>';
exports.CUP_END = '<!-- </cup> -->';
exports.CUP_SECURITY_START = '<!-- <cup-security>';
exports.CUP_SECURITY_END = '<!-- </cup-security> -->';
// --- Shared helpers ---
/** Build a SKILL.md content by prepending YAML frontmatter from meta to the body. */
function buildSkillContent(body, meta) {
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
/** Read available skills from user-skills/ using the given provider meta file. */
function getAvailableSkillsFromRepo(providerName) {
    const skillsSrc = path.join(utils_1.PACKAGE_ROOT, 'user-skills');
    try {
        return fs.readdirSync(skillsSrc, { withFileTypes: true })
            .filter(e => e.isDirectory())
            .map(e => {
            let desc = '';
            const metaPath = path.join(skillsSrc, e.name, 'meta', `${providerName}.yaml`);
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
/** Extract the cup-managed block from an instruction file. */
function readCupBlockFromFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const start = content.indexOf(exports.CUP_START);
        const end = content.indexOf(exports.CUP_END);
        if (start === -1 || end === -1)
            return null;
        return content.slice(start, end + exports.CUP_END.length);
    }
    catch {
        return null;
    }
}
/** Insert or replace the cup-managed block in an instruction file. */
function writeCupBlockToFile(filePath, block) {
    let content = '';
    try {
        content = fs.readFileSync(filePath, 'utf-8');
    }
    catch { }
    const start = content.indexOf(exports.CUP_START);
    const end = content.indexOf(exports.CUP_END);
    if (start !== -1 && end !== -1) {
        content = content.slice(0, start) + block + content.slice(end + exports.CUP_END.length);
    }
    else {
        content = content ? content.trimEnd() + '\n\n' + block + '\n' : block + '\n';
    }
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
}
/** Read the cup-security block from an instruction file. */
function readSecurityBlockFromFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const start = content.indexOf(exports.CUP_SECURITY_START);
        const end = content.indexOf(exports.CUP_SECURITY_END);
        if (start === -1 || end === -1)
            return null;
        return content.slice(start, end + exports.CUP_SECURITY_END.length);
    }
    catch {
        return null;
    }
}
/** Insert or replace the cup-security block in an instruction file. */
function writeSecurityBlockToFile(filePath, block) {
    let content = '';
    try {
        content = fs.readFileSync(filePath, 'utf-8');
    }
    catch { }
    const start = content.indexOf(exports.CUP_SECURITY_START);
    const end = content.indexOf(exports.CUP_SECURITY_END);
    if (start !== -1 && end !== -1) {
        content = content.slice(0, start) + block + content.slice(end + exports.CUP_SECURITY_END.length);
    }
    else {
        content = content ? content.trimEnd() + '\n\n' + block + '\n' : block + '\n';
    }
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
}
/** Remove the cup-security block from an instruction file (keeps the rest). */
function removeSecurityBlockFromFile(filePath) {
    let content;
    try {
        content = fs.readFileSync(filePath, 'utf-8');
    }
    catch {
        return;
    }
    const start = content.indexOf(exports.CUP_SECURITY_START);
    const end = content.indexOf(exports.CUP_SECURITY_END);
    if (start === -1 || end === -1)
        return;
    const cleaned = (content.slice(0, start) + content.slice(end + exports.CUP_SECURITY_END.length))
        .replace(/\n{3,}/g, '\n\n')
        .trimEnd() + '\n';
    fs.writeFileSync(filePath, cleaned);
}
/** List simple file-based sessions from a directory (best-effort for Gemini/Codex). */
function listSimpleSessions(historyDir, projectLabel, extensions, firstMessage, opts) {
    if (!fs.existsSync(historyDir))
        return [];
    const sessions = [];
    try {
        const files = fs.readdirSync(historyDir).filter(f => extensions.some(ext => f.endsWith(ext)));
        for (const file of files) {
            const filePath = path.join(historyDir, file);
            const stat = fs.statSync(filePath);
            sessions.push({
                id: file.replace(new RegExp(`(${extensions.join('|').replace(/\./g, '\\.')})$`), ''),
                project: projectLabel,
                date: stat.mtime,
                size: stat.size,
                firstMessage,
            });
        }
    }
    catch { }
    sessions.sort((a, b) => b.date.getTime() - a.date.getTime());
    return sessions.slice(0, opts.limit || 10);
}
/** Read a skill body (lang override + fallback). */
function readSkillBody(skillDir, lang) {
    const bodyFile = lang === 'ko' ? 'SKILL.ko.md' : 'SKILL.md';
    const bodyPath = path.join(skillDir, bodyFile);
    const fallbackPath = path.join(skillDir, 'SKILL.md');
    return fs.existsSync(bodyPath)
        ? fs.readFileSync(bodyPath, 'utf-8')
        : fs.readFileSync(fallbackPath, 'utf-8');
}
/** Install a skill: read body + meta, build frontmatter, write to destination. */
function installSkillWithMeta(skillDir, destDir, lang, metaFileName, fallbackMetaFileName) {
    const body = readSkillBody(skillDir, lang);
    const metaPath = path.join(skillDir, 'meta', metaFileName);
    let content;
    if (fs.existsSync(metaPath)) {
        const meta = (0, utils_1.parseSimpleYaml)(fs.readFileSync(metaPath, 'utf-8'));
        content = buildSkillContent(body, meta);
    }
    else if (fallbackMetaFileName) {
        const fallbackPath = path.join(skillDir, 'meta', fallbackMetaFileName);
        if (fs.existsSync(fallbackPath)) {
            const meta = (0, utils_1.parseSimpleYaml)(fs.readFileSync(fallbackPath, 'utf-8'));
            content = buildSkillContent(body, meta);
        }
        else {
            content = body;
        }
    }
    else {
        content = body;
    }
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(path.join(destDir, 'SKILL.md'), content);
    const scriptsSrc = path.join(skillDir, 'scripts');
    if (fs.existsSync(scriptsSrc) && fs.statSync(scriptsSrc).isDirectory()) {
        const scriptsDst = path.join(destDir, 'scripts');
        fs.rmSync(scriptsDst, { recursive: true, force: true });
        fs.cpSync(scriptsSrc, scriptsDst, { recursive: true });
        for (const entry of fs.readdirSync(scriptsDst, { withFileTypes: true })) {
            if (entry.isFile() && entry.name.endsWith('.sh')) {
                fs.chmodSync(path.join(scriptsDst, entry.name), 0o755);
            }
        }
    }
}
