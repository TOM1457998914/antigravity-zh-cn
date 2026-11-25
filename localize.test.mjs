import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { copyFile, link, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { releases } from './localization.mjs';

const productionCli = fileURLToPath(new URL('./localize.mjs', import.meta.url));
const testedVersions = ['2.33.0', '2.34.0', '2.35.0', '2.35.1'];
const windowsOnly = { skip: process.platform !== 'win32' && 'Windows-only installation and process checks' };
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function makeArchive(version, label, localized = false) {
  const manifest = Buffer.from(JSON.stringify({ name: 'fixture', version }));
  const menu = Buffer.from(label);
  const menuEntry = { size: menu.length, offset: String(manifest.length) };
  if (localized) {
    menuEntry.integrity = {
      algorithm: 'SHA256',
      hash: sha256(menu),
      blockSize: 4 * 1024 * 1024,
      blocks: [sha256(menu)],
    };
  }
  const header = Buffer.from(JSON.stringify({
    files: {
      'package.json': { size: manifest.length, offset: '0' },
      dist: { files: { 'menu.js': menuEntry } },
    },
  }));
  const headerSize = 8 + Math.ceil(header.length / 4) * 4;
  const pickle = Buffer.alloc(8 + headerSize);
  pickle.writeUInt32LE(4, 0);
  pickle.writeUInt32LE(headerSize, 4);
  pickle.writeUInt32LE(headerSize - 4, 8);
  pickle.writeUInt32LE(header.length, 12);
  header.copy(pickle, 16);
  return Buffer.concat([pickle, manifest, menu]);
}

async function createSandbox(t) {
  const temp = await realpath(tmpdir());
  const root = await mkdtemp(join(temp, 'antigravity-zh-cn-test-'));
  t.after(async () => {
    const target = await realpath(root);
    assert.equal(target, root);
    assert.equal(dirname(target), temp);
    await rm(target, { recursive: true, force: true });
  });

  const localAppData = join(root, 'LocalAppData');
  const appDir = join(localAppData, 'Programs', 'antigravity');
  const resources = join(appDir, 'resources');
  await mkdir(resources, { recursive: true });
  return {
    root, localAppData, appDir, resources,
    archive: join(resources, 'app.asar'),
    backup: join(resources, 'app.asar.zh-cn.original'),
    cli: productionCli,
    env: { ...process.env, LOCALAPPDATA: localAppData },
  };
}

async function createReleaseFixture(t) {
  const sandbox = await createSandbox(t);
  const fixtures = new Map();
  let source = await readFile(new URL('./localization.mjs', import.meta.url), 'utf8');
  for (const version of testedVersions) {
    const release = releases.find((entry) => entry.version === version);
    assert.ok(release);
    const original = makeArchive(version, 'Open');
    const usesAppendedAsset = version === '2.35.0' || version === '2.35.1';
    const localized = makeArchive(version, usesAppendedAsset ? '打开\n\n// fixture renderer\n' : '打开', true);
    const legacy = release.legacySha256.map((_, index) => makeArchive(version, 'Previous patch ' + index));
    const production = [release.originalSha256, release.localizedSha256, ...release.legacySha256];
    for (const [index, bytes] of [original, localized, ...legacy].entries()) {
      assert.equal(source.split(production[index]).length, 2, production[index]);
      source = source.replace(production[index], sha256(bytes));
    }
    fixtures.set(version, { original, localized, legacy });

    const patches = { 'dist/menu.js': { edits: [[0, 4, '打开']] } };
    if (usesAppendedAsset) {
      patches['dist/menu.js'].append = ['fixture-renderer.js'];
      await writeFile(join(sandbox.root, 'fixture-renderer.js'), '// fixture renderer\n');
    }
    const patchVersion = version === '2.35.0' ? '2.35.1' : version;
    await writeFile(join(sandbox.root, 'patches-' + patchVersion + '.json'), JSON.stringify(patches));
    if (!usesAppendedAsset) {
      const suffix = version === '2.33.0' ? '' : '-' + version;
      await Promise.all([
        writeFile(join(sandbox.root, 'renderer' + suffix + '.js'), ''),
        writeFile(join(sandbox.root, 'dictionary' + suffix + '.json'), '{}'),
        writeFile(join(sandbox.root, 'core-words' + suffix + '.json'), '{}'),
      ]);
    }
  }

  // Run an unchanged CLI and ASAR implementation with test-only release digests and patch data.
  sandbox.cli = join(sandbox.root, 'localize.mjs');
  await Promise.all([
    copyFile(new URL('./localize.mjs', import.meta.url), sandbox.cli),
    copyFile(new URL('./asar.mjs', import.meta.url), join(sandbox.root, 'asar.mjs')),
    writeFile(join(sandbox.root, 'localization.mjs'), source),
  ]);
  return { ...sandbox, fixtures };
}

function run(sandbox, status, command, ...args) {
  const result = spawnSync(process.execPath, [sandbox.cli, command, ...args], {
    cwd: sandbox.root,
    env: sandbox.env,
    encoding: 'utf8',
    timeout: 35_000,
    windowsHide: true,
  });
  assert.ifError(result.error);
  assert.equal(result.status, status, [command, result.stdout, result.stderr].join('\n'));
  return result;
}

test('production release metadata recognizes the pinned official and localized digests', () => {
  const expected = {
    '2.33.0': [
      'b33c81600e82e65593aa8430ef01b37d6b28d9d98f0faf45e25957783b71e64b',
      '3130b72b08e95009483fcdc1d4840012b680b630f1a5c5acec521d1a5aff285f',
    ],
    '2.34.0': [
      '8934adef0622c9271c92eea950a71848764a66f7b10023ccbd82e54b959adb0e',
      'a4f1c57b5f9b303aba2ff5ccb2c0ba72b71a6872246e3d46d32964bb8a7a87b1',
    ],
    '2.35.0': [
      '99ff7f6cf1219f46c8437df65ca866e384836b5230adba8efd91b3152f823e15',
      'dd28bc41e626ac22ce46a3db960617a9689d04c9a071c3a3cfd5a7cee5e15147',
    ],
    '2.35.1': [
      '9f0aad7274795d7fbde04931d96b348dcfc5f3d81d7373e6b70aeb09307442df',
      '105f04df195b3294dd6d99edce299d39cc16eb893d0f1c2aa3ae9fa45fc89f6f',
    ],
  };
  for (const version of testedVersions) {
    const release = releases.find((entry) => entry.version === version);
    assert.ok(release, version);
    assert.deepEqual([release.originalSha256, release.localizedSha256], expected[version]);
    assert.ok(release.legacySha256.length > 0, version);
  }
  const hashes = releases.flatMap(({ originalSha256, localizedSha256, legacySha256 }) => [
    originalSha256, localizedSha256, ...legacySha256,
  ]);
  assert.equal(new Set(releases.map(({ version }) => version)).size, releases.length);
  assert.equal(new Set(hashes).size, hashes.length);
  for (const hash of hashes) assert.match(hash, /^[a-f0-9]{64}$/);
});

test('CLI status distinguishes supported versions and their known archive states', async (t) => {
  const sandbox = await createReleaseFixture(t);
  for (const [version, release] of sandbox.fixtures) {
    for (const [description, bytes] of [
      [/官方原版/, release.original],
      [/当前简体中文版/, release.localized],
      [/此前本机汉化版/, release.legacy[0]],
    ]) {
      await writeFile(sandbox.archive, bytes);
      const { stdout } = run(sandbox, 0, 'status', '--app-dir', sandbox.appDir);
      assert.match(stdout, description);
      assert.ok(stdout.includes('Antigravity ' + version));
      assert.ok(stdout.includes('SHA-256 ' + sha256(bytes)));
    }
  }
});

test('production CLI refuses unknown digests even when the archive claims a supported version', async (t) => {
  const sandbox = await createSandbox(t);
  const output = join(sandbox.root, 'app.asar.zh-cn');
  for (const version of testedVersions) {
    const input = makeArchive(version, 'Unverified');
    await writeFile(sandbox.archive, input);
    const { stdout } = run(sandbox, 0, 'status');
    assert.match(stdout, /不支持的版本或未知改动/);
    assert.ok(stdout.includes(sha256(input)));
    for (const command of ['apply', 'restore']) {
      const { stderr } = run(sandbox, 1, command);
      assert.match(stderr, /当前归档不受支持/);
      assert.ok(stderr.includes(sha256(input)));
    }
    const { stderr } = run(sandbox, 1, 'build', '--input', sandbox.archive, '--output', output);
    assert.match(stderr, /不是此工具支持的 Antigravity 原版归档/);
    assert.ok(stderr.includes(sha256(input)));
    assert.deepEqual(await readFile(sandbox.archive), input);
    assert.deepEqual(await readdir(sandbox.resources), ['app.asar']);
    await assert.rejects(readFile(output), { code: 'ENOENT' });
  }
});

test('CLI build selects the correct patch for each verified input and leaves it intact', async (t) => {
  const sandbox = await createReleaseFixture(t);
  for (const [version, release] of sandbox.fixtures) {
    const input = join(sandbox.root, version + '-original.asar');
    const output = join(sandbox.root, version + '-localized.asar');
    await writeFile(input, release.original);
    run(sandbox, 0, 'build', '--input', input, '--output', output);
    assert.deepEqual(await readFile(output), release.localized);
    assert.deepEqual(await readFile(input), release.original);
  }
});

test('Windows apply and restore preserve the original backup for each supported release', windowsOnly, async (t) => {
  const sandbox = await createReleaseFixture(t);
  const older = sandbox.fixtures.get('2.33.0');
  const newer = sandbox.fixtures.get('2.34.0');
  const versionedBackup = sandbox.backup + '.2.34.0';

  await writeFile(sandbox.archive, older.original);
  run(sandbox, 0, 'apply');
  assert.deepEqual(await readFile(sandbox.archive), older.localized);
  assert.deepEqual(await readFile(sandbox.backup), older.original);
  run(sandbox, 0, 'restore');
  assert.deepEqual(await readFile(sandbox.archive), older.original);

  // Simulate an official update inside the fixture without replacing its existing backup.
  await writeFile(sandbox.archive, newer.original);
  run(sandbox, 0, 'apply');
  assert.deepEqual(await readFile(sandbox.archive), newer.localized);
  assert.deepEqual(await readFile(sandbox.backup), older.original);
  assert.deepEqual(await readFile(versionedBackup), newer.original);
  run(sandbox, 0, 'restore');
  assert.deepEqual(await readFile(sandbox.archive), newer.original);
  assert.deepEqual(await readFile(sandbox.backup), older.original);
  assert.deepEqual(await readFile(versionedBackup), newer.original);
});

test('Windows restore rejects a mismatched backup and apply can use a verified legacy backup', windowsOnly, async (t) => {
  const sandbox = await createReleaseFixture(t);
  const older = sandbox.fixtures.get('2.33.0');
  const newer = sandbox.fixtures.get('2.35.1');
  const legacyBackupDir = join(sandbox.localAppData, 'Antigravity-Localization', 'backups', '2.35.1');
  const legacyBackup = join(legacyBackupDir, 'app.asar.original');

  await writeFile(sandbox.archive, newer.legacy[0]);
  await writeFile(sandbox.backup, older.original);
  assert.match(run(sandbox, 1, 'restore').stderr, /找不到通过 SHA-256 校验的 2\.35\.1 原版备份/);
  assert.deepEqual(await readFile(sandbox.archive), newer.legacy[0]);

  await mkdir(legacyBackupDir, { recursive: true });
  await writeFile(legacyBackup, newer.original);
  run(sandbox, 0, 'apply');
  assert.deepEqual(await readFile(sandbox.archive), newer.localized);
  assert.deepEqual(await readFile(sandbox.backup), older.original);
  assert.deepEqual(await readFile(sandbox.backup + '.2.35.1'), newer.original);
  run(sandbox, 0, 'restore');
  assert.deepEqual(await readFile(sandbox.archive), newer.original);
  assert.deepEqual(await readFile(legacyBackup), newer.original);
});

test('Windows apply and restore refuse to write while a process from the fixture directory runs', windowsOnly, async (t) => {
  const sandbox = await createReleaseFixture(t);
  const { original, localized } = sandbox.fixtures.get('2.34.0');
  const executable = join(sandbox.appDir, 'language_server.exe');
  try {
    await link(process.execPath, executable);
  } catch (error) {
    if (!['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'EXDEV'].includes(error.code)) throw error;
    await copyFile(process.execPath, executable);
  }
  const child = spawn(executable, ['-e', 'setInterval(() => {}, 1000)'], {
    stdio: 'ignore',
    windowsHide: true,
  });
  const stopped = new Promise((resolve) => child.once('close', resolve));
  try {
    await once(child, 'spawn');
    await writeFile(sandbox.archive, original);
    const apply = run(sandbox, 1, 'apply');
    assert.match(apply.stderr, /仍在运行 language_server/);
    assert.deepEqual(await readFile(sandbox.archive), original);
    assert.deepEqual(await readdir(sandbox.resources), ['app.asar']);

    await writeFile(sandbox.archive, localized);
    await writeFile(sandbox.backup, original);
    const restore = run(sandbox, 1, 'restore');
    assert.match(restore.stderr, /仍在运行 language_server/);
    assert.deepEqual(await readFile(sandbox.archive), localized);
    assert.deepEqual(await readFile(sandbox.backup), original);
  } finally {
    child.kill();
    await stopped;
  }
});
