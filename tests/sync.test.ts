import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const FIXTURES = path.join(os.tmpdir(), 'omc-sync-test-' + Date.now());

before(() => {
  fs.mkdirSync(FIXTURES, { recursive: true });
});

after(() => {
  fs.rmSync(FIXTURES, { recursive: true, force: true });
});

// --- Inline helpers (re-implemented, not imported from sync.ts) ---

const GIST_PREFIX = 'omc-skill--';
const MANIFEST_FILE = 'omc-manifest.json';
const SETTINGS_FILE = 'omc-settings.json';

interface AuthData { token: string; gistId?: string; }

function loadAuth(authPath: string): AuthData | null {
  try {
    return JSON.parse(fs.readFileSync(authPath, 'utf-8')) as AuthData;
  } catch {
    return null;
  }
}

function saveAuth(authPath: string, data: AuthData): void {
  fs.mkdirSync(path.dirname(authPath), { recursive: true });
  fs.writeFileSync(authPath, JSON.stringify(data, null, 2) + '\n');
  fs.chmodSync(authPath, 0o600);
}

function isDirChanged(srcDir: string, destDir: string): boolean {
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

// Build manifest logic (inline)
function buildManifest(repoSkillsDir: string, localSkillsDir: string): {
  manifest: { skills: { installed: string[]; removed: string[]; modified: string[]; custom: string[] }; lang: string };
  modifiedFiles: Record<string, string>;
} {
  let repoSkills: string[] = [];
  try {
    repoSkills = fs.readdirSync(repoSkillsDir, { withFileTypes: true })
      .filter(e => e.isDirectory()).map(e => e.name);
  } catch { /* no repo */ }

  let localSkills: string[] = [];
  try {
    localSkills = fs.readdirSync(localSkillsDir, { withFileTypes: true })
      .filter(e => e.isDirectory()).map(e => e.name);
  } catch { /* no local */ }

  const repoSet = new Set(repoSkills);
  const localSet = new Set(localSkills);

  const installed: string[] = [];
  const removed: string[] = [];
  const modified: string[] = [];
  const custom: string[] = [];
  const modifiedFiles: Record<string, string> = {};

  for (const name of repoSkills) {
    const repoDir = path.join(repoSkillsDir, name);
    const localDir = path.join(localSkillsDir, name);
    if (!localSet.has(name)) {
      removed.push(name);
    } else if (isDirChanged(repoDir, localDir)) {
      modified.push(name);
      try {
        modifiedFiles[`${GIST_PREFIX}${name}.md`] = fs.readFileSync(path.join(localDir, 'SKILL.md'), 'utf-8');
      } catch { /* skip */ }
    } else {
      installed.push(name);
    }
  }

  for (const name of localSkills) {
    if (!repoSet.has(name)) {
      custom.push(name);
      try {
        modifiedFiles[`${GIST_PREFIX}${name}.md`] = fs.readFileSync(path.join(localSkillsDir, name, 'SKILL.md'), 'utf-8');
      } catch { /* skip */ }
    }
  }

  return { manifest: { skills: { installed, removed, modified, custom }, lang: 'en' }, modifiedFiles };
}

// --- Test 1: Auth file — write/read/missing ---

describe('auth file', () => {
  const authPath = path.join(FIXTURES, 'auth', '.omc-auth');

  afterEach(() => {
    try { fs.rmSync(path.join(FIXTURES, 'auth'), { recursive: true, force: true }); } catch { /* ok */ }
  });

  it('should write and read auth JSON', () => {
    const data: AuthData = { token: 'ghp_test1234', gistId: 'abc123' };
    saveAuth(authPath, data);

    assert.ok(fs.existsSync(authPath));
    const loaded = loadAuth(authPath);
    assert.ok(loaded !== null);
    assert.equal(loaded!.token, 'ghp_test1234');
    assert.equal(loaded!.gistId, 'abc123');
  });

  it('should set file permissions to 0o600', () => {
    saveAuth(authPath, { token: 'ghp_test' });
    const stat = fs.statSync(authPath);
    const mode = stat.mode & 0o777;
    assert.equal(mode, 0o600);
  });

  it('should return null for missing auth file', () => {
    const result = loadAuth(path.join(FIXTURES, 'nonexistent', '.omc-auth'));
    assert.equal(result, null);
  });

  it('should return null for invalid JSON in auth file', () => {
    fs.mkdirSync(path.dirname(authPath), { recursive: true });
    fs.writeFileSync(authPath, 'not json!!!');
    const result = loadAuth(authPath);
    assert.equal(result, null);
  });
});

// --- Test 2: Manifest building ---
// Given repo skills (a,b,c) and local skills (a-modified, b-same, d-custom, c-missing)
// Expected: modified=[a], removed=[c], custom=[d], installed=[b]

describe('manifest building', () => {
  const repoDir = path.join(FIXTURES, 'manifest-repo');
  const localDir = path.join(FIXTURES, 'manifest-local');

  beforeEach(() => {
    // Repo skills: a, b, c
    for (const name of ['a', 'b', 'c']) {
      fs.mkdirSync(path.join(repoDir, name), { recursive: true });
      fs.writeFileSync(path.join(repoDir, name, 'SKILL.md'), `# ${name} skill`);
    }

    // Local skills: a (modified), b (same), d (custom, no repo entry)
    fs.mkdirSync(path.join(localDir, 'a'), { recursive: true });
    fs.writeFileSync(path.join(localDir, 'a', 'SKILL.md'), '# a skill MODIFIED');

    fs.mkdirSync(path.join(localDir, 'b'), { recursive: true });
    fs.writeFileSync(path.join(localDir, 'b', 'SKILL.md'), '# b skill'); // same as repo

    fs.mkdirSync(path.join(localDir, 'd'), { recursive: true });
    fs.writeFileSync(path.join(localDir, 'd', 'SKILL.md'), '# d custom skill');
    // c is NOT in local (removed)
  });

  afterEach(() => {
    fs.rmSync(repoDir, { recursive: true, force: true });
    fs.rmSync(localDir, { recursive: true, force: true });
  });

  it('should detect modified skills', () => {
    const { manifest } = buildManifest(repoDir, localDir);
    assert.deepEqual(manifest.skills.modified, ['a']);
  });

  it('should detect removed skills', () => {
    const { manifest } = buildManifest(repoDir, localDir);
    assert.deepEqual(manifest.skills.removed, ['c']);
  });

  it('should detect custom (local-only) skills', () => {
    const { manifest } = buildManifest(repoDir, localDir);
    assert.deepEqual(manifest.skills.custom, ['d']);
  });

  it('should detect installed (unchanged) skills', () => {
    const { manifest } = buildManifest(repoDir, localDir);
    assert.deepEqual(manifest.skills.installed, ['b']);
  });

  it('should include modified skill content in modifiedFiles', () => {
    const { modifiedFiles } = buildManifest(repoDir, localDir);
    assert.ok(`${GIST_PREFIX}a.md` in modifiedFiles);
    assert.equal(modifiedFiles[`${GIST_PREFIX}a.md`], '# a skill MODIFIED');
  });

  it('should include custom skill content in modifiedFiles', () => {
    const { modifiedFiles } = buildManifest(repoDir, localDir);
    assert.ok(`${GIST_PREFIX}d.md` in modifiedFiles);
    assert.equal(modifiedFiles[`${GIST_PREFIX}d.md`], '# d custom skill');
  });

  it('should NOT include unchanged skill in modifiedFiles', () => {
    const { modifiedFiles } = buildManifest(repoDir, localDir);
    assert.ok(!(`${GIST_PREFIX}b.md` in modifiedFiles));
  });
});

// --- Test 3: Gist file naming convention ---

describe('gist file naming', () => {
  it('should produce omc-skill--{name}.md from skill name', () => {
    const skillName = 'clean-code';
    const key = `${GIST_PREFIX}${skillName}.md`;
    assert.equal(key, 'omc-skill--clean-code.md');
  });

  it('should extract skill name from gist file key', () => {
    const key = 'omc-skill--commit-push.md';
    const name = key.startsWith(GIST_PREFIX) ? key.slice(GIST_PREFIX.length, -'.md'.length) : null;
    assert.equal(name, 'commit-push');
  });

  it('should handle skills without hyphens', () => {
    const key = `${GIST_PREFIX}enhance.md`;
    const name = key.startsWith(GIST_PREFIX) ? key.slice(GIST_PREFIX.length, -'.md'.length) : null;
    assert.equal(name, 'enhance');
  });

  it('should not match non-skill files', () => {
    const key = 'omc-manifest.json';
    const isSkill = key.startsWith(GIST_PREFIX);
    assert.equal(isSkill, false);
  });
});

// --- Test 4: Gist payload structure ---

describe('gist payload structure', () => {
  it('should include manifest, settings, and skill files', () => {
    const manifest = {
      version: '1',
      timestamp: new Date().toISOString(),
      skills: { installed: ['b'], removed: [], modified: ['a'], custom: [] },
      lang: 'en',
    };
    const settings = { permissions: { allow: ['Read(*)'] } };
    const skillFiles: Record<string, string> = {
      [`${GIST_PREFIX}a.md`]: '# a modified',
    };

    const gistFiles: Record<string, { content: string } | null> = {
      [MANIFEST_FILE]: { content: JSON.stringify(manifest, null, 2) },
      [SETTINGS_FILE]: { content: JSON.stringify(settings, null, 2) },
    };
    for (const [key, content] of Object.entries(skillFiles)) {
      gistFiles[key] = { content };
    }

    assert.ok(MANIFEST_FILE in gistFiles);
    assert.ok(SETTINGS_FILE in gistFiles);
    assert.ok(`${GIST_PREFIX}a.md` in gistFiles);
    assert.equal(Object.keys(gistFiles).length, 3);
  });

  it('should only include permitted settings keys', () => {
    const rawSettings = {
      permissions: { allow: ['Read(*)'] },
      enabledPlugins: { '@test/plugin': true },
      extraKnownMarketplaces: {},
      statusLine: { type: 'command', command: 'bash script.sh' }, // local-only
      customKey: 'local-only-value', // local-only
    };

    const allowed = ['permissions', 'enabledPlugins', 'extraKnownMarketplaces'];
    const syncSettings: Record<string, unknown> = {};
    for (const key of allowed) {
      if (rawSettings[key as keyof typeof rawSettings] !== undefined) {
        syncSettings[key] = rawSettings[key as keyof typeof rawSettings];
      }
    }

    assert.ok('permissions' in syncSettings);
    assert.ok('enabledPlugins' in syncSettings);
    assert.ok('extraKnownMarketplaces' in syncSettings);
    assert.ok(!('statusLine' in syncSettings));
    assert.ok(!('customKey' in syncSettings));
  });
});

// --- Test 5: Empty changes (totalChanges = 0) ---

describe('empty changes', () => {
  const repoDir = path.join(FIXTURES, 'empty-repo');
  const localDir = path.join(FIXTURES, 'empty-local');

  beforeEach(() => {
    // Both have same skills with same content
    for (const name of ['skill-a', 'skill-b']) {
      fs.mkdirSync(path.join(repoDir, name), { recursive: true });
      fs.writeFileSync(path.join(repoDir, name, 'SKILL.md'), `# ${name}`);
      fs.mkdirSync(path.join(localDir, name), { recursive: true });
      fs.writeFileSync(path.join(localDir, name, 'SKILL.md'), `# ${name}`);
    }
  });

  afterEach(() => {
    fs.rmSync(repoDir, { recursive: true, force: true });
    fs.rmSync(localDir, { recursive: true, force: true });
  });

  it('should report totalChanges = 0 when nothing modified', () => {
    const { manifest, modifiedFiles } = buildManifest(repoDir, localDir);
    const totalChanges = manifest.skills.modified.length
      + manifest.skills.removed.length
      + manifest.skills.custom.length;
    assert.equal(totalChanges, 0);
    assert.equal(Object.keys(modifiedFiles).length, 0);
  });

  it('should put all skills in installed', () => {
    const { manifest } = buildManifest(repoDir, localDir);
    assert.equal(manifest.skills.installed.length, 2);
    assert.ok(manifest.skills.installed.includes('skill-a'));
    assert.ok(manifest.skills.installed.includes('skill-b'));
  });
});

// --- Test 6: Pull merge strategy ---

describe('pull merge strategy', () => {
  it('should overwrite remote keys and preserve local-only keys', () => {
    const localSettings: Record<string, unknown> = {
      permissions: { allow: ['OldRule(*)'] },
      statusLine: { type: 'command', command: 'bash script.sh' },
      customLocalKey: 'preserved',
    };

    const remoteSettings: Record<string, unknown> = {
      permissions: { allow: ['NewRule(*)'], deny: ['Bash(rm -rf:*)'] },
      enabledPlugins: { '@test/plugin': true },
    };

    // Merge: remote overwrites, local-only keys preserved
    const merged = { ...localSettings, ...remoteSettings };

    // Remote keys overwrite
    assert.deepEqual(merged.permissions, { allow: ['NewRule(*)'], deny: ['Bash(rm -rf:*)'] });
    assert.deepEqual(merged.enabledPlugins, { '@test/plugin': true });

    // Local-only keys preserved
    assert.deepEqual(merged.statusLine, { type: 'command', command: 'bash script.sh' });
    assert.equal(merged.customLocalKey, 'preserved');
  });

  it('should not delete local-only keys that are absent from remote', () => {
    const local = { a: 1, b: 2, c: 3 };
    const remote = { b: 99, d: 4 };
    const merged = { ...local, ...remote };

    assert.equal(merged.a, 1);   // local-only preserved
    assert.equal(merged.b, 99);  // overwritten by remote
    assert.equal(merged.c, 3);   // local-only preserved
    assert.equal(merged.d, 4);   // remote-only added
  });

  it('should apply backup before modifying settings', () => {
    const settingsPath = path.join(FIXTURES, 'pull-settings.json');
    fs.writeFileSync(settingsPath, JSON.stringify({ permissions: { allow: ['Read(*)'] } }, null, 2));

    // Inline backup logic
    const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const bakPath = `${settingsPath}.bak.${ts}`;
    fs.copyFileSync(settingsPath, bakPath);

    assert.ok(fs.existsSync(bakPath));
    const bakContent = JSON.parse(fs.readFileSync(bakPath, 'utf-8'));
    assert.deepEqual(bakContent.permissions.allow, ['Read(*)']);

    fs.unlinkSync(settingsPath);
    fs.unlinkSync(bakPath);
  });
});
