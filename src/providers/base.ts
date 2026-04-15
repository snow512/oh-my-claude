import * as fs from 'fs';
import * as path from 'path';
import { parseSimpleYaml, PACKAGE_ROOT } from '../utils';
import type { CheckboxItem } from '../ui';
import type { ProviderName, SessionInfo, SessionOpts } from './types';

// --- Shared constants ---

export const CUP_START = '<!-- <cup>';
export const CUP_END = '<!-- </cup> -->';

export const CUP_SECURITY_START = '<!-- <cup-security>';
export const CUP_SECURITY_END = '<!-- </cup-security> -->';

// --- Shared helpers ---

/** Build a SKILL.md content by prepending YAML frontmatter from meta to the body. */
export function buildSkillContent(body: string, meta: Record<string, unknown>): string {
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

/** Read available skills from user-skills/ using the given provider meta file. */
export function getAvailableSkillsFromRepo(providerName: ProviderName): CheckboxItem[] {
  const skillsSrc = path.join(PACKAGE_ROOT, 'user-skills');
  try {
    return fs.readdirSync(skillsSrc, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => {
        let desc = '';
        const metaPath = path.join(skillsSrc, e.name, 'meta', `${providerName}.yaml`);
        try {
          const meta = parseSimpleYaml(fs.readFileSync(metaPath, 'utf-8'));
          if (meta.description) desc = String(meta.description).trim().slice(0, 50);
        } catch {}
        return { name: e.name, desc: desc || '(no description)' };
      });
  } catch { return []; }
}

/** Extract the cup-managed block from an instruction file. */
export function readCupBlockFromFile(filePath: string): string | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const start = content.indexOf(CUP_START);
    const end = content.indexOf(CUP_END);
    if (start === -1 || end === -1) return null;
    return content.slice(start, end + CUP_END.length);
  } catch { return null; }
}

/** Insert or replace the cup-managed block in an instruction file. */
export function writeCupBlockToFile(filePath: string, block: string): void {
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

/** Read the cup-security block from an instruction file. */
export function readSecurityBlockFromFile(filePath: string): string | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const start = content.indexOf(CUP_SECURITY_START);
    const end = content.indexOf(CUP_SECURITY_END);
    if (start === -1 || end === -1) return null;
    return content.slice(start, end + CUP_SECURITY_END.length);
  } catch { return null; }
}

/** Insert or replace the cup-security block in an instruction file. */
export function writeSecurityBlockToFile(filePath: string, block: string): void {
  let content = '';
  try { content = fs.readFileSync(filePath, 'utf-8'); } catch {}

  const start = content.indexOf(CUP_SECURITY_START);
  const end = content.indexOf(CUP_SECURITY_END);

  if (start !== -1 && end !== -1) {
    content = content.slice(0, start) + block + content.slice(end + CUP_SECURITY_END.length);
  } else {
    content = content ? content.trimEnd() + '\n\n' + block + '\n' : block + '\n';
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

/** Remove the cup-security block from an instruction file (keeps the rest). */
export function removeSecurityBlockFromFile(filePath: string): void {
  let content: string;
  try { content = fs.readFileSync(filePath, 'utf-8'); } catch { return; }

  const start = content.indexOf(CUP_SECURITY_START);
  const end = content.indexOf(CUP_SECURITY_END);
  if (start === -1 || end === -1) return;

  const cleaned = (content.slice(0, start) + content.slice(end + CUP_SECURITY_END.length))
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd() + '\n';

  fs.writeFileSync(filePath, cleaned);
}

/** List simple file-based sessions from a directory (best-effort for Gemini/Codex). */
export function listSimpleSessions(
  historyDir: string,
  projectLabel: string,
  extensions: string[],
  firstMessage: string,
  opts: SessionOpts,
): SessionInfo[] {
  if (!fs.existsSync(historyDir)) return [];

  const sessions: SessionInfo[] = [];
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
  } catch {}

  sessions.sort((a, b) => b.date.getTime() - a.date.getTime());
  return sessions.slice(0, opts.limit || 10);
}

/** Read a skill body (lang override + fallback). */
export function readSkillBody(skillDir: string, lang: string): string {
  const bodyFile = lang === 'ko' ? 'SKILL.ko.md' : 'SKILL.md';
  const bodyPath = path.join(skillDir, bodyFile);
  const fallbackPath = path.join(skillDir, 'SKILL.md');
  return fs.existsSync(bodyPath)
    ? fs.readFileSync(bodyPath, 'utf-8')
    : fs.readFileSync(fallbackPath, 'utf-8');
}

/** Install a skill: read body + meta, build frontmatter, write to destination. */
export function installSkillWithMeta(
  skillDir: string,
  destDir: string,
  lang: string,
  metaFileName: string,
  fallbackMetaFileName?: string,
): void {
  const body = readSkillBody(skillDir, lang);
  const metaPath = path.join(skillDir, 'meta', metaFileName);

  let content: string;
  if (fs.existsSync(metaPath)) {
    const meta = parseSimpleYaml(fs.readFileSync(metaPath, 'utf-8'));
    content = buildSkillContent(body, meta);
  } else if (fallbackMetaFileName) {
    const fallbackPath = path.join(skillDir, 'meta', fallbackMetaFileName);
    if (fs.existsSync(fallbackPath)) {
      const meta = parseSimpleYaml(fs.readFileSync(fallbackPath, 'utf-8'));
      content = buildSkillContent(body, meta);
    } else {
      content = body;
    }
  } else {
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
