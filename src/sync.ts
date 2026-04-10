import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as readline from 'readline';
import { Writable } from 'stream';
import { CLAUDE_DIR, PACKAGE_ROOT, readJson, writeJson, isDirChanged, backup } from './installer';
import { renderBanner, progressLine, ask, C, style } from './ui';
import type { Opts } from './installer';

// --- Types ---

interface AuthData { token: string; gistId?: string; }

interface SyncManifest {
  version: string;
  timestamp: string;
  skills: { installed: string[]; removed: string[]; modified: string[]; custom: string[]; };
  lang: string;
}

interface GistFile { content: string; }
interface GistPayload { description: string; public: boolean; files: Record<string, GistFile | null>; }
interface GistResponse { id: string; html_url: string; files: Record<string, { content: string }>; }

// --- Constants ---

const AUTH_PATH = path.join(CLAUDE_DIR, '.omc-auth');
const GIST_PREFIX = 'omc-skill--';
const MANIFEST_FILE = 'omc-manifest.json';
const SETTINGS_FILE = 'omc-settings.json';
const CLAUDE_MD_FILE = 'omc-claude-md.md';
const OMC_START = '<!-- <omc>';
const OMC_END = '<!-- </omc> -->';
const SYNC_SETTINGS_KEYS = ['permissions', 'enabledPlugins', 'extraKnownMarketplaces'];

function isValidSkillName(name: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(name) && !name.includes('..');
}

function readValidSkillNames(dir: string): string[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .filter(isValidSkillName);
  } catch { return []; }
}

function collectSkillContent(skillDir: string, name: string, dest: Record<string, string>): void {
  try {
    dest[`${GIST_PREFIX}${name}.md`] = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8');
  } catch {}
}

// --- Auth helpers ---

function loadAuth(): AuthData | null {
  try {
    const raw = fs.readFileSync(AUTH_PATH, 'utf-8');
    return JSON.parse(raw) as AuthData;
  } catch {
    return null;
  }
}

function saveAuth(data: AuthData): void {
  fs.mkdirSync(path.dirname(AUTH_PATH), { recursive: true });
  fs.writeFileSync(AUTH_PATH, JSON.stringify(data, null, 2) + '\n');
  fs.chmodSync(AUTH_PATH, 0o600);
}

// --- GitHub API client ---

function githubApi<T = GistResponse>(
  method: string,
  endpoint: string,
  token: string,
  body?: unknown
): Promise<T> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const options: https.RequestOptions = {
      hostname: 'api.github.com',
      path: endpoint,
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'claude-up',
        'X-GitHub-Api-Version': '2022-11-28',
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };

    const req = https.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => { chunks.push(chunk); });
      res.on('end', () => {
        const data = Buffer.concat(chunks).toString();
        const statusCode = res.statusCode ?? 0;
        if (statusCode >= 200 && statusCode < 300) {
          try {
            resolve(JSON.parse(data) as T);
          } catch {
            reject(new Error(`Failed to parse response: ${data}`));
          }
        } else {
          reject(new Error(`GitHub API error ${statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// --- Language detection ---

function detectLang(): string {
  try {
    const skillsDir = path.join(CLAUDE_DIR, 'skills');
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    const firstDir = entries.find(e => e.isDirectory());
    if (!firstDir) return 'en';
    const skillMd = path.join(skillsDir, firstDir.name, 'SKILL.md');
    const content = fs.readFileSync(skillMd, 'utf-8');
    if (/[\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F]/.test(content)) return 'ko';
    return 'en';
  } catch {
    return 'en';
  }
}

// --- Manifest building ---

function buildManifest(): { manifest: SyncManifest; modifiedFiles: Record<string, string> } {
  const repoSkillsDir = path.join(PACKAGE_ROOT, 'user-skills');
  const localSkillsDir = path.join(CLAUDE_DIR, 'skills');

  const repoSkills = readValidSkillNames(repoSkillsDir);
  const localSkills = readValidSkillNames(localSkillsDir);
  const repoSet = new Set(repoSkills);
  const localSet = new Set(localSkills);

  const installed: string[] = [];
  const removed: string[] = [];
  const modified: string[] = [];
  const custom: string[] = [];
  const modifiedFiles: Record<string, string> = {};

  for (const name of repoSkills) {
    if (!localSet.has(name)) {
      removed.push(name);
    } else if (isDirChanged(path.join(repoSkillsDir, name), path.join(localSkillsDir, name))) {
      modified.push(name);
      collectSkillContent(path.join(localSkillsDir, name), name, modifiedFiles);
    } else {
      installed.push(name);
    }
  }

  for (const name of localSkills) {
    if (!repoSet.has(name)) {
      custom.push(name);
      collectSkillContent(path.join(localSkillsDir, name), name, modifiedFiles);
    }
  }

  return {
    manifest: {
      version: '1',
      timestamp: new Date().toISOString(),
      skills: { installed, removed, modified, custom },
      lang: detectLang(),
    },
    modifiedFiles,
  };
}

// --- Extract CLAUDE.md omc block ---

function extractOmcBlock(claudeMdPath: string): string | null {
  try {
    const content = fs.readFileSync(claudeMdPath, 'utf-8');
    const start = content.indexOf(OMC_START);
    const end = content.indexOf(OMC_END);
    if (start === -1 || end === -1) return null;
    return content.slice(start, end + OMC_END.length);
  } catch {
    return null;
  }
}

function applyOmcBlock(claudeMdPath: string, block: string): void {
  let content = '';
  try { content = fs.readFileSync(claudeMdPath, 'utf-8'); } catch {}

  const start = content.indexOf(OMC_START);
  const end = content.indexOf(OMC_END);

  if (start !== -1 && end !== -1) {
    content = content.slice(0, start) + block + content.slice(end + OMC_END.length);
  } else {
    content = content + '\n\n' + block + '\n';
  }

  fs.mkdirSync(path.dirname(claudeMdPath), { recursive: true });
  fs.writeFileSync(claudeMdPath, content);
}

// --- Login command ---

export async function runLogin(opts: Opts): Promise<void> {
  renderBanner();

  const existing = loadAuth();
  if (existing && !opts.force) {
    const masked = existing.token.length > 8
      ? existing.token.slice(0, 4) + '****' + existing.token.slice(-4)
      : existing.token.slice(0, 2) + '****';
    console.log(`  ${style('Current token:', C.bold)} ${style(masked, C.gray)}`);
    const replace = await ask('Replace existing token?', false);
    if (!replace) {
      console.log(`  ${style('Login unchanged.', C.gray)}\n`);
      return;
    }
  }

  // Hidden token input
  const mutableStdout = new Writable({
    write: (_chunk: Buffer, _encoding: string, callback: () => void) => { callback(); }
  });
  process.stdout.write(`  ${style('Token:', C.cyan)} `);
  const rl = readline.createInterface({ input: process.stdin, output: mutableStdout, terminal: true });
  const token = await new Promise<string>((resolve) => {
    rl.question('', (answer: string) => { rl.close(); resolve(answer.trim()); });
  });
  console.log(''); // newline after hidden input

  if (!token) {
    console.log(`  ${style('✗', C.red)} No token provided.\n`);
    process.exit(1);
  }

  try {
    await progressLine('Validating token', async () => {
      const user = await githubApi<{ login: string }>('GET', '/user', token);
      console.log(''); // newline after spinner clears
      console.log(`  ${style('✓', C.green)} Authenticated as ${style(user.login, C.cyan)}`);
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ${style('✗', C.red)} Token validation failed: ${msg}\n`);
    process.exit(1);
  }

  const auth: AuthData = { token };
  const currentAuth = loadAuth();
  if (currentAuth?.gistId) auth.gistId = currentAuth.gistId;
  saveAuth(auth);

  console.log(`  ${style('✓', C.green)} Token saved.\n`);
}

// --- Push command ---

export async function runPush(args: string[] | undefined, opts: Opts): Promise<void> {
  renderBanner();

  const auth = loadAuth();
  if (!auth) {
    console.log(`  ${style('✗', C.red)} Not logged in. Run: ${style('cup login', C.cyan)}\n`);
    process.exit(1);
  }

  const { manifest, modifiedFiles } = await progressLine('Analyzing skills', () => buildManifest());

  // Filter by specific skill names if provided
  const filter = (args && args.length > 0) ? new Set(args) : null;

  const skillsToInclude = filter
    ? [...manifest.skills.modified, ...manifest.skills.custom].filter(n => filter.has(n))
    : [...manifest.skills.modified, ...manifest.skills.custom];

  const removedToInclude = filter
    ? manifest.skills.removed.filter(n => filter.has(n))
    : manifest.skills.removed;

  const totalChanges = skillsToInclude.length + removedToInclude.length;

  // Show summary
  console.log('');
  console.log(`  ${style('Skills summary:', C.bold)}`);
  console.log(`    ${style('Unchanged:', C.gray)}  ${manifest.skills.installed.length}`);
  console.log(`    ${style('Modified:', C.yellow)}  ${manifest.skills.modified.length}`);
  console.log(`    ${style('Removed:', C.red)}   ${manifest.skills.removed.length}`);
  console.log(`    ${style('Custom:', C.cyan)}    ${manifest.skills.custom.length}`);
  console.log('');

  if (totalChanges === 0 && !opts.force) {
    console.log(`  ${style('Nothing to push.', C.gray)}\n`);
    return;
  }

  // Build gist files
  const settingsPath = path.join(CLAUDE_DIR, 'settings.json');
  const rawSettings = readJson(settingsPath) || {};
  const syncSettings: Record<string, unknown> = {};
  for (const key of SYNC_SETTINGS_KEYS) {
    if (rawSettings[key] !== undefined) syncSettings[key] = rawSettings[key];
  }

  const claudeMdPath = path.join(CLAUDE_DIR, 'CLAUDE.md');
  const omcBlock = extractOmcBlock(claudeMdPath);

  const gistFiles: Record<string, GistFile | null> = {
    [MANIFEST_FILE]: { content: JSON.stringify(manifest, null, 2) },
    [SETTINGS_FILE]: { content: JSON.stringify(syncSettings, null, 2) },
  };

  if (omcBlock) {
    gistFiles[CLAUDE_MD_FILE] = { content: omcBlock };
  }

  // Include modified/custom skill files
  for (const skillName of skillsToInclude) {
    const key = `${GIST_PREFIX}${skillName}.md`;
    if (modifiedFiles[key]) {
      gistFiles[key] = { content: modifiedFiles[key] };
    }
  }

  // Mark removed skills as null in existing gist (delete from gist)
  for (const skillName of removedToInclude) {
    gistFiles[`${GIST_PREFIX}${skillName}.md`] = null;
  }

  const payload: GistPayload = {
    description: 'claude-up settings sync',
    public: false,
    files: gistFiles,
  };

  try {
    let gistUrl: string;
    if (auth.gistId) {
      const result = await progressLine('Updating Gist', () =>
        githubApi('PATCH', `/gists/${auth.gistId}`, auth.token, payload)
      );
      gistUrl = result.html_url;
    } else {
      const result = await progressLine('Creating Gist', () =>
        githubApi('POST', '/gists', auth.token, payload)
      );
      gistUrl = result.html_url;
      auth.gistId = result.id;
      saveAuth(auth);
    }

    console.log(`  ${style('✓', C.green)} Pushed to Gist: ${style(gistUrl, C.cyan)}\n`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ${style('✗', C.red)} Push failed: ${msg}\n`);
    process.exit(1);
  }
}

// --- Pull command ---

export async function runPull(opts: Opts): Promise<void> {
  renderBanner();

  const auth = loadAuth();
  if (!auth) {
    console.log(`  ${style('✗', C.red)} Not logged in. Run: ${style('cup login', C.cyan)}\n`);
    process.exit(1);
  }
  if (!auth.gistId) {
    console.log(`  ${style('✗', C.red)} No Gist ID found. Run: ${style('cup push', C.cyan)} first.\n`);
    process.exit(1);
  }

  let gistData: GistResponse;
  try {
    gistData = await progressLine('Fetching Gist', () =>
      githubApi('GET', `/gists/${auth.gistId}`, auth.token)
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ${style('✗', C.red)} Pull failed: ${msg}\n`);
    process.exit(1);
    return;
  }

  // Parse manifest
  const manifestFile = gistData.files[MANIFEST_FILE];
  if (!manifestFile) {
    console.log(`  ${style('✗', C.red)} No manifest found in Gist.\n`);
    process.exit(1);
    return;
  }
  const manifest = JSON.parse(manifestFile.content) as SyncManifest;

  // Validate and filter skill names from manifest
  const filterSkillNames = (names: string[], label: string): string[] =>
    names.filter(name => {
      if (!isValidSkillName(name)) {
        console.warn(`  ${style('⚠', C.yellow)} Skipping invalid skill name in ${label}: ${name}`);
        return false;
      }
      return true;
    });

  manifest.skills.removed = filterSkillNames(manifest.skills.removed, 'removed');
  manifest.skills.modified = filterSkillNames(manifest.skills.modified, 'modified');
  manifest.skills.custom = filterSkillNames(manifest.skills.custom, 'custom');

  console.log('');
  console.log(`  ${style('Remote manifest:', C.bold)} ${style(manifest.timestamp, C.gray)}`);
  console.log(`    ${style('Modified:', C.yellow)}  ${manifest.skills.modified.length}`);
  console.log(`    ${style('Removed:', C.red)}   ${manifest.skills.removed.length}`);
  console.log(`    ${style('Custom:', C.cyan)}    ${manifest.skills.custom.length}`);
  console.log('');

  // Apply settings (merge: remote keys overwrite, local-only keys preserved)
  const settingsFile = gistData.files[SETTINGS_FILE];
  if (settingsFile) {
    const doIt = opts.yes || await ask('Apply settings?', true);
    if (doIt) {
      const settingsPath = path.join(CLAUDE_DIR, 'settings.json');
      const localSettings = readJson(settingsPath) || {};
      const remoteSettings = JSON.parse(settingsFile.content) as Record<string, unknown>;

      // Backup first
      if (fs.existsSync(settingsPath)) {
        backup(settingsPath);
      }

      // Merge: remote keys overwrite, local-only keys preserved
      const merged = { ...localSettings, ...remoteSettings };
      writeJson(settingsPath, merged);
      console.log(`  ${style('✓', C.green)} Settings applied.`);
    }
  }

  // Apply CLAUDE.md omc block
  const claudeMdFile = gistData.files[CLAUDE_MD_FILE];
  if (claudeMdFile) {
    const doIt = opts.yes || await ask('Apply CLAUDE.md omc block?', true);
    if (doIt) {
      const claudeMdPath = path.join(CLAUDE_DIR, 'CLAUDE.md');
      if (fs.existsSync(claudeMdPath)) backup(claudeMdPath);
      applyOmcBlock(claudeMdPath, claudeMdFile.content);
      console.log(`  ${style('✓', C.green)} CLAUDE.md omc block applied.`);
    }
  }

  // Apply removed skills (delete local)
  const localSkillsDir = path.join(CLAUDE_DIR, 'skills');
  for (const name of manifest.skills.removed) {
    const localDir = path.join(localSkillsDir, name);
    if (!fs.existsSync(localDir)) continue;
    const doIt = opts.yes || await ask(`Delete removed skill: ${style(name, C.yellow)}?`, true);
    if (doIt) {
      fs.rmSync(localDir, { recursive: true, force: true });
      console.log(`  ${style('✓', C.green)} Removed skill: ${style(name, C.gray)}`);
    }
  }

  // Apply modified and custom skills (write SKILL.md)
  const toWrite = [...manifest.skills.modified, ...manifest.skills.custom];
  for (const name of toWrite) {
    const key = `${GIST_PREFIX}${name}.md`;
    const remoteFile = gistData.files[key];
    if (!remoteFile) continue;

    const skillDir = path.join(localSkillsDir, name);
    const skillMdPath = path.join(skillDir, 'SKILL.md');
    const doIt = opts.yes || await ask(`Apply skill: ${style(name, name.includes('-') ? C.cyan : C.yellow)}?`, true);
    if (doIt) {
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(skillMdPath, remoteFile.content);
      console.log(`  ${style('✓', C.green)} Applied skill: ${style(name, C.gray)}`);
    }
  }

  console.log(`\n  ${style('Pull complete.', C.green)}\n`);
}
