import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// --- Constants ---

export const PACKAGE_ROOT = path.resolve(__dirname, '..');
export const HOME_DIR = os.homedir();

// --- JSON I/O ---

export function readJson(filePath: string): Record<string, unknown> | null {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')); }
  catch { return null; }
}

export function writeJson(filePath: string, data: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

// --- File utilities ---

export function copyDirRecursive(src: string, dest: string): number {
  fs.mkdirSync(dest, { recursive: true });
  let count = 0;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) { count += copyDirRecursive(srcPath, destPath); }
    else { fs.copyFileSync(srcPath, destPath); count++; }
  }
  return count;
}

export function isDirChanged(srcDir: string, destDir: string): boolean {
  try {
    const srcEntries = fs.readdirSync(srcDir, { withFileTypes: true });
    for (const entry of srcEntries) {
      const srcPath = path.join(srcDir, entry.name);
      const destPath = path.join(destDir, entry.name);
      if (entry.isDirectory()) {
        if (isDirChanged(srcPath, destPath)) return true;
      } else {
        if (!fs.existsSync(destPath)) return true;
        const srcContent = fs.readFileSync(srcPath);
        const destContent = fs.readFileSync(destPath);
        if (!srcContent.equals(destContent)) return true;
      }
    }
    return false;
  } catch {
    return true;
  }
}

export function timestamp(): string {
  return new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

export function humanTimestamp(): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

export function backup(filePath: string): string | null {
  try {
    const bakPath = `${filePath}.bak.${timestamp()}`;
    fs.copyFileSync(filePath, bakPath);
    return bakPath;
  } catch { return null; }
}

// --- Simple YAML parser (key-value + multiline, no nested objects) ---

export function parseSimpleYaml(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  let currentKey = '';
  let multiline = false;
  let multilineValue = '';

  for (const line of content.split('\n')) {
    if (multiline) {
      if (line.startsWith('  ')) {
        multilineValue += (multilineValue ? '\n' : '') + line.slice(2);
        continue;
      } else {
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
      } else {
        result[currentKey] = val;
      }
    }
  }
  if (multiline && currentKey) result[currentKey] = multilineValue.trim();
  return result;
}
