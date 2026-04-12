import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as readline from 'readline';
import { Writable } from 'stream';
import { readJson, writeJson, isDirChanged, backup, PACKAGE_ROOT, HOME_DIR } from './utils';
import { renderBanner, progressLine, ask, C, style } from './ui';
import type { Opts } from './installer';
import { resolveProviders } from './providers/registry';
import type { Provider } from './providers/types';

const CLAUDE_DIR = path.join(HOME_DIR, '.claude');

// --- Types ---

interface AuthData { token: string; gistId?: string; }

interface SyncManifest {
  version: string;
  timestamp: string;
  providers?: string[];
  skills: { installed: string[]; removed: string[]; modified: string[]; custom: string[]; };
  lang: string;
}

interface GistFile { content: string; }
interface GistPayload { description: string; public: boolean; files: Record<string, GistFile | null>; }
interface GistResponse { id: string; html_url: string; files: Record<string, { content: string }>; }

// --- Constants ---

const AUTH_PATH = path.join(CLAUDE_DIR, '.cup-auth');
const GIST_PREFIX = 'cup-skill--';
const MANIFEST_FILE = 'cup-manifest.json';
const SETTINGS_FILE = 'cup-settings.json';
const CLAUDE_MD_FILE = 'cup-claude-md.md';
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

  // Build gist files — multi-provider
  const providers = resolveProviders(opts.provider);
  manifest.providers = providers.map(p => p.name);

  const gistFiles: Record<string, GistFile | null> = {
    [MANIFEST_FILE]: { content: JSON.stringify(manifest, null, 2) },
  };

  // Per-provider settings + instruction files
  for (const provider of providers) {
    const syncKeys = provider.getSyncKeys();

    // Settings
    const rawSettings = provider.readSettings() || {};
    const syncSettings: Record<string, unknown> = {};
    for (const key of syncKeys.settingsKeys) {
      if (rawSettings[key] !== undefined) syncSettings[key] = rawSettings[key];
    }
    const settingsGistKey = `cup-settings--${provider.name}.json`;
    gistFiles[settingsGistKey] = { content: JSON.stringify(syncSettings, null, 2) };

    // Instruction file cup block
    const cupBlock = provider.readCupBlock();
    if (cupBlock) {
      gistFiles[syncKeys.instructionFileKey] = { content: cupBlock };
    }
  }

  // Backward compat: also write old SETTINGS_FILE key for Claude
  if (providers.some(p => p.name === 'claude')) {
    const claudeSettings = gistFiles['cup-settings--claude.json'];
    if (claudeSettings) {
      gistFiles[SETTINGS_FILE] = claudeSettings;
    }
    const claudeBlock = gistFiles['cup-claude-md.md'];
    if (claudeBlock) {
      gistFiles[CLAUDE_MD_FILE] = claudeBlock;
    }
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

  // Apply per-provider settings + instruction files
  const providers = resolveProviders(opts.provider);

  for (const provider of providers) {
    const syncKeys = provider.getSyncKeys();

    // Settings: try provider-specific key first, then legacy key
    const providerSettingsKey = `cup-settings--${provider.name}.json`;
    const settingsFile = gistData.files[providerSettingsKey]
      || (provider.name === 'claude' ? gistData.files[SETTINGS_FILE] : null);

    if (settingsFile) {
      const doIt = opts.yes || await ask(`Apply ${provider.displayName} settings?`, true);
      if (doIt) {
        provider.backupSettings();
        const localSettings = provider.readSettings() || {};
        const remoteSettings = JSON.parse(settingsFile.content) as Record<string, unknown>;
        const merged = { ...localSettings, ...remoteSettings };
        provider.writeSettings(merged);
        console.log(`  ${style('✓', C.green)} ${provider.displayName} settings applied.`);
      }
    }

    // Instruction file cup block
    const instrFile = gistData.files[syncKeys.instructionFileKey]
      || (provider.name === 'claude' ? gistData.files[CLAUDE_MD_FILE] : null);

    if (instrFile) {
      const doIt = opts.yes || await ask(`Apply ${provider.instructionFileName} cup block?`, true);
      if (doIt) {
        const instrPath = provider.getInstructionFilePath('global');
        if (fs.existsSync(instrPath)) backup(instrPath);
        provider.writeCupBlock(instrFile.content);
        console.log(`  ${style('✓', C.green)} ${provider.instructionFileName} cup block applied.`);
      }
    }

    // Skills: apply removed, modified, custom
    for (const name of manifest.skills.removed) {
      const localDir = path.join(provider.skillsDir, name);
      if (!fs.existsSync(localDir)) continue;
      const doIt = opts.yes || await ask(`Delete removed skill: ${style(name, C.yellow)} (${provider.displayName})?`, true);
      if (doIt) {
        fs.rmSync(localDir, { recursive: true, force: true });
        console.log(`  ${style('✓', C.green)} Removed skill: ${style(name, C.gray)}`);
      }
    }

    const toWrite = [...manifest.skills.modified, ...manifest.skills.custom];
    for (const name of toWrite) {
      const key = `${GIST_PREFIX}${name}.md`;
      const remoteFile = gistData.files[key];
      if (!remoteFile) continue;

      const skillDir = path.join(provider.skillsDir, name);
      const skillMdPath = path.join(skillDir, 'SKILL.md');
      const doIt = opts.yes || await ask(`Apply skill: ${style(name, C.cyan)} (${provider.displayName})?`, true);
      if (doIt) {
        fs.mkdirSync(skillDir, { recursive: true });
        fs.writeFileSync(skillMdPath, remoteFile.content);
        console.log(`  ${style('✓', C.green)} Applied skill: ${style(name, C.gray)}`);
      }
    }
  }

  console.log(`\n  ${style('Pull complete.', C.green)}\n`);
}
