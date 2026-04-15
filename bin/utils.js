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
exports.HOME_DIR = exports.PACKAGE_ROOT = void 0;
exports.readJson = readJson;
exports.writeJson = writeJson;
exports.copyDirRecursive = copyDirRecursive;
exports.isDirChanged = isDirChanged;
exports.timestamp = timestamp;
exports.humanTimestamp = humanTimestamp;
exports.backup = backup;
exports.parseSimpleYaml = parseSimpleYaml;
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
// --- Constants ---
exports.PACKAGE_ROOT = path.resolve(__dirname, '..');
exports.HOME_DIR = os.homedir();
// --- JSON I/O ---
function readJson(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
    catch {
        return null;
    }
}
function writeJson(filePath, data) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}
// --- File utilities ---
function copyDirRecursive(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    let count = 0;
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        if (entry.isSymbolicLink())
            continue;
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            count += copyDirRecursive(srcPath, destPath);
        }
        else {
            fs.copyFileSync(srcPath, destPath);
            count++;
        }
    }
    return count;
}
function isDirChanged(srcDir, destDir) {
    try {
        const srcEntries = fs.readdirSync(srcDir, { withFileTypes: true });
        for (const entry of srcEntries) {
            const srcPath = path.join(srcDir, entry.name);
            const destPath = path.join(destDir, entry.name);
            if (entry.isDirectory()) {
                if (isDirChanged(srcPath, destPath))
                    return true;
            }
            else {
                if (!fs.existsSync(destPath))
                    return true;
                const srcContent = fs.readFileSync(srcPath);
                const destContent = fs.readFileSync(destPath);
                if (!srcContent.equals(destContent))
                    return true;
            }
        }
        return false;
    }
    catch {
        return true;
    }
}
function timestamp() {
    return new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
}
function humanTimestamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}
function backup(filePath) {
    try {
        const bakPath = `${filePath}.bak.${timestamp()}`;
        fs.copyFileSync(filePath, bakPath);
        return bakPath;
    }
    catch {
        return null;
    }
}
// --- Simple YAML parser (key-value + multiline, no nested objects) ---
function parseSimpleYaml(content) {
    const result = {};
    let currentKey = '';
    let multiline = false;
    let multilineValue = '';
    for (const line of content.split('\n')) {
        if (multiline) {
            if (line.startsWith('  ')) {
                multilineValue += (multilineValue ? '\n' : '') + line.slice(2);
                continue;
            }
            else {
                result[currentKey] = multilineValue.trim();
                multiline = false;
            }
        }
        const match = line.match(/^(\S+):\s*(.*)$/);
        if (match) {
            currentKey = match[1];
            const val = match[2].trim();
            if (val === '>' || val === '|') {
                multiline = true;
                multilineValue = '';
            }
            else {
                result[currentKey] = val;
            }
        }
    }
    if (multiline && currentKey)
        result[currentKey] = multilineValue.trim();
    return result;
}
