import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as readline from 'readline';
import { CLAUDE_DIR, PACKAGE_ROOT, readJson, writeJson, isDirChanged } from './installer';
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

function githubApi(
  method: string,
  endpoint: string,
  token: string,
  body?: Record<string, unknown>
): Promise<GistResponse> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const options: https.RequestOptions = {
      hostname: 'api.github.com',
      path: endpoint,
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'oh-my-claude',
        'X-GitHub-Api-Version': '2022-11-28',
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const statusCode = res.statusCode ?? 0;
        if (statusCode >= 200 && statusCode < 300) {
          try {
            resolve(JSON.parse(data) as GistResponse);
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
    // Check for Korean characters (Hangul Unicode range)
    if (/[\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F]/.test(content)) return 'ko';
    return 'en';
  } catch {
    return 'en';
  }
}

// --- Backup helper ---

function backup(filePath: string): string | null {
  try {
    const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const bakPath = `${filePath}.bak.${ts}`;
    fs.copyFileSync(filePath, bakPath);
    return bakPath;
  } catch {
    return null;
  }
}

// --- Manifest building ---

function buildManifest(): { manifest: SyncManifest; modifiedFiles: Record<string, string> } {
  const repoSkillsDir = path.join(PACKAGE_ROOT, 'user-skills');
  const localSkillsDir = path.join(CLAUDE_DIR, 'skills');

  // Get skill names from repo
  let repoSkills: string[] = [];
  try {
    repoSkills = fs.readdirSync(repoSkillsDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name);
  } catch { /* no repo skills dir */ }

  // Get skill names from local
  let localSkills: string[] = [];
  try {
    localSkills = fs.readdirSync(localSkillsDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name);
  } catch { /* no local skills dir */ }

  const repoSet = new Set(repoSkills);
  const localSet = new Set(localSkills);

  const installed: string[] = [];
  const removed: string[] = [];
  const modified: string[] = [];
  const custom: string[] = [];
  const modifiedFiles: Record<string, string> = {};

  // Skills in repo
  for (const name of repoSkills) {
    const repoDir = path.join(repoSkillsDir, name);
    const localDir = path.join(localSkillsDir, name);

    if (!localSet.has(name)) {
      // In repo but not local => removed
      removed.push(name);
    } else if (isDirChanged(repoDir, localDir)) {
      // In both but changed => modified
      modified.push(name);
      try {
        const content = fs.readFileSync(path.join(localDir, 'SKILL.md'), 'utf-8');
        modifiedFiles[`${GIST_PREFIX}${name}.md`] = content;
      } catch { /* skip if unreadable */ }
    } else {
      // Unchanged
      installed.push(name);
    }
  }

  // Skills only in local (custom)
  for (const name of localSkills) {
    if (!repoSet.has(name)) {
      custom.push(name);
      try {
        const content = fs.readFileSync(path.join(localSkillsDir, name, 'SKILL.md'), 'utf-8');
        modifiedFiles[`${GIST_PREFIX}${name}.md`] = content;
      } catch { /* skip if unreadable */ }
    }
  }

  const lang = detectLang();

  const manifest: SyncManifest = {
    version: '1',
    timestamp: new Date().toISOString(),
    skills: { installed, removed, modified, custom },
    lang,
  };

  return { manifest, modifiedFiles };
}

// --- Extract CLAUDE.md omc block ---

function extractOmcBlock(claudeMdPath: string): string | null {
  try {
    const content = fs.readFileSync(claudeMdPath, 'utf-8');
    const start = content.indexOf('<!-- omc:start -->');
    const end = content.indexOf('<!-- omc:end -->');
    if (start === -1 || end === -1) return null;
    return content.slice(start, end + '<!-- omc:end -->'.length);
  } catch {
    return null;
  }
}

// --- Apply omc block to CLAUDE.md ---

function applyOmcBlock(claudeMdPath: string, block: string): void {
  let content = '';
  try { content = fs.readFileSync(claudeMdPath, 'utf-8'); } catch { /* new file */ }

  const start = content.indexOf('<!-- omc:start -->');
  const end = content.indexOf('<!-- omc:end -->');

  if (start !== -1 && end !== -1) {
    content = content.slice(0, start) + block + content.slice(end + '<!-- omc:end -->'.length);
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
    const masked = existing.token.slice(0, 4) + '****' + existing.token.slice(-4);
    console.log(`  ${style('Current token:', C.bold)} ${style(masked, C.gray)}`);
    const replace = await ask('Replace existing token?', false);
    if (!replace) {
      console.log(`  ${style('Login unchanged.', C.gray)}\n`);
      return;
    }
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const token = await new Promise<string>((resolve) => {
    rl.question(`  ${style('GitHub Personal Access Token', C.bold)} (needs gist scope): `, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });

  if (!token) {
    console.log(`  ${style('✗', C.red)} No token provided.\n`);
    process.exit(1);
  }

  await progressLine('Validating token', async () => {
    const user = await githubApi('GET', '/user', token) as unknown as { login: string };
    console.log(''); // newline after spinner clears
    console.log(`  ${style('✓', C.green)} Authenticated as ${style(user.login, C.cyan)}`);
  });

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
    console.log(`  ${style('✗', C.red)} Not logged in. Run: ${style('omc login', C.cyan)}\n`);
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
  for (const key of ['permissions', 'enabledPlugins', 'extraKnownMarketplaces']) {
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
    description: 'oh-my-claude settings sync',
    public: false,
    files: gistFiles,
  };

  let gistUrl: string;
  if (auth.gistId) {
    const result = await progressLine('Updating Gist', () =>
      githubApi('PATCH', `/gists/${auth.gistId}`, auth.token, payload as unknown as Record<string, unknown>)
    );
    gistUrl = result.html_url;
  } else {
    const result = await progressLine('Creating Gist', () =>
      githubApi('POST', '/gists', auth.token, payload as unknown as Record<string, unknown>)
    );
    gistUrl = result.html_url;
    auth.gistId = result.id;
    saveAuth(auth);
  }

  console.log(`  ${style('✓', C.green)} Pushed to Gist: ${style(gistUrl, C.cyan)}\n`);
}

// --- Pull command ---

export async function runPull(opts: Opts): Promise<void> {
  renderBanner();

  const auth = loadAuth();
  if (!auth) {
    console.log(`  ${style('✗', C.red)} Not logged in. Run: ${style('omc login', C.cyan)}\n`);
    process.exit(1);
  }
  if (!auth.gistId) {
    console.log(`  ${style('✗', C.red)} No Gist ID found. Run: ${style('omc push', C.cyan)} first.\n`);
    process.exit(1);
  }

  const gistData = await progressLine('Fetching Gist', () =>
    githubApi('GET', `/gists/${auth.gistId}`, auth.token)
  );

  // Parse manifest
  const manifestFile = gistData.files[MANIFEST_FILE];
  if (!manifestFile) {
    console.log(`  ${style('✗', C.red)} No manifest found in Gist.\n`);
    process.exit(1);
  }
  const manifest = JSON.parse(manifestFile.content) as SyncManifest;

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
