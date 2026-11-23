import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { copyFile, link, mkdtemp, open, readFile, realpath, rename, rmdir, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { buildLocalizedArchive, releases } from './localization.mjs';

const execFileAsync = promisify(execFile);
const supportedVersions = releases.map(({ version }) => version).join('、');
const statesByHash = new Map();
for (const release of releases) {
  for (const sha256 of release.legacySha256) {
    statesByHash.set(sha256.toLowerCase(), { state: 'legacy', release });
  }
  statesByHash.set(release.originalSha256.toLowerCase(), { state: 'original', release });
  statesByHash.set(release.localizedSha256.toLowerCase(), { state: 'localized', release });
}
const unknownArchive = { state: 'unknown', release: null };
const commands = new Set(['status', 'apply', 'restore', 'build']);
const outputName = 'app.asar.zh-cn';

const usage = `Antigravity 简体中文工具（Windows ${supportedVersions}）

  node .\\localize.mjs status [--app-dir <目录>]
  node .\\localize.mjs apply [--app-dir <目录>]
  node .\\localize.mjs restore [--app-dir <目录>]
  node .\\localize.mjs build [--app-dir <目录>] [--input <原版归档>] [--output <输出文件>]

status 查看当前状态。apply 安装汉化。restore 恢复英文。
build 生成单独的归档文件，默认输出到当前目录的 ${outputName}。
默认安装目录为 %LOCALAPPDATA%\\Programs\\antigravity。`;

function parseArgs(args) {
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) return null;
  const [command, ...flags] = args;
  if (!commands.has(command)) throw new Error(`未知命令 ${command}。请运行 --help 查看用法。`);

  const options = {};
  const allowed = command === 'build' ? new Set(['--app-dir', '--input', '--output']) : new Set(['--app-dir']);
  for (let index = 0; index < flags.length; index += 2) {
    const flag = flags[index];
    const value = flags[index + 1];
    if (!allowed.has(flag) || Object.hasOwn(options, flag)) throw new Error(`无法使用参数 ${flag}。`);
    if (!value || value.startsWith('--')) throw new Error(`参数 ${flag} 需要一个路径。`);
    options[flag] = resolve(value);
  }
  return { command, options };
}

function pathsFor(appDir) {
  const local = process.env.LOCALAPPDATA;
  if (!appDir && !local) throw new Error('无法确定默认安装目录，请提供 --app-dir。');
  const directory = appDir ?? resolve(local, 'Programs', 'antigravity');
  const resources = join(directory, 'resources');
  return {
    directory,
    archive: join(resources, 'app.asar'),
    backup: join(resources, 'app.asar.zh-cn.original'),
    legacyBackups: local ? resolve(local, 'Antigravity-Localization', 'backups') : null,
  };
}

function backupFiles(paths, release) {
  const localFiles = [paths.backup, `${paths.backup}.${release.version}`];
  return paths.legacyBackups
    ? [...localFiles, join(paths.legacyBackups, release.version, 'app.asar.original')]
    : localFiles;
}

function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function existingFile(file) {
  try {
    const bytes = await readFile(file);
    return { bytes, sha256: hash(bytes) };
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function archiveAt(file) {
  const archive = await existingFile(file);
  if (!archive) throw new Error(`找不到归档 ${file}`);
  return archive;
}

function archiveState(archive) {
  return statesByHash.get(archive.sha256) ?? unknownArchive;
}

function verifyOriginal(archive, file) {
  const { state, release } = archiveState(archive);
  if (state !== 'original') {
    throw new Error(`不是此工具支持的 Antigravity 原版归档 ${file}（SHA-256 ${archive.sha256}）。支持版本 ${supportedVersions}。`);
  }
  return release;
}

function isOriginalFor(archive, release) {
  return archive?.sha256 === release.originalSha256.toLowerCase();
}

async function findOriginalBackup(paths, release) {
  for (const file of backupFiles(paths, release)) {
    const archive = await existingFile(file);
    if (isOriginalFor(archive, release)) return { ...archive, file };
  }
  return null;
}

async function requireOriginalBackup(paths, release) {
  const backup = await findOriginalBackup(paths, release);
  if (!backup) {
    throw new Error(`找不到通过 SHA-256 校验的 ${release.version} 原版备份。已检查 ${backupFiles(paths, release).join('、')}。`);
  }
  return backup;
}

async function stageFile(target, bytes, publish) {
  const directory = await mkdtemp(join(dirname(target), '.antigravity-zh-'));
  const staged = join(directory, 'archive');
  try {
    const handle = await open(staged, 'wx');
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    return await publish(staged);
  } finally {
    await unlink(staged).catch(() => {});
    await rmdir(directory).catch(() => {});
  }
}

async function writeNewFile(target, bytes) {
  return stageFile(target, bytes, async (staged) => {
    try {
      await link(staged, target);
    } catch (error) {
      if (!['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EXDEV'].includes(error.code)) throw error;
      await copyFile(staged, target, constants.COPYFILE_EXCL);
    }
  });
}

async function ensureBackup(paths, release, original) {
  const localFiles = backupFiles(paths, release).slice(0, 2);
  const existing = await findOriginalBackup(paths, release);
  if (existing && localFiles.includes(existing.file)) return existing;

  for (const file of localFiles) {
    if (await existingFile(file)) continue;
    try {
      await writeNewFile(file, original.bytes);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    const saved = await existingFile(file);
    if (isOriginalFor(saved, release)) return { ...saved, file };
  }

  return requireOriginalBackup(paths, release);
}

async function requireClosed(directory) {
  if (process.platform !== 'win32') throw new Error('安装和恢复命令仅支持 Windows。');

  const prefix = (await realpath(directory)).replace(/[\\/]+$/, '') + sep;
  const powerShell = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const script = `
$ErrorActionPreference = 'Stop'
foreach ($candidate in (Get-Process | Where-Object { $_.ProcessName -in 'Antigravity','language_server' })) {
    $image = $candidate.Path
    if (($image -and $image.StartsWith($env:ANTIGRAVITY_ZH_INSTALL_PREFIX, [StringComparison]::OrdinalIgnoreCase)) -or
        (!$image -and $candidate.ProcessName -ieq 'Antigravity')) {
        [Console]::Out.WriteLine(('{0} ({1})' -f $candidate.ProcessName, $candidate.Id))
    }
}
exit 0`;
  const { stdout } = await execFileAsync(powerShell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
    env: { ...process.env, ANTIGRAVITY_ZH_INSTALL_PREFIX: prefix },
    timeout: 15_000,
    windowsHide: true,
  });
  const running = stdout.trim().split(/\r?\n/).filter(Boolean);
  if (running.length) throw new Error(`请从系统托盘彻底退出 Antigravity 后重试。仍在运行 ${running.join('、')}。`);
}

async function replaceArchive(paths, current, bytes) {
  await stageFile(paths.archive, bytes, async (staged) => {
    await requireClosed(paths.directory);
    if ((await archiveAt(paths.archive)).sha256 !== current.sha256) {
      throw new Error('准备过程中安装归档已发生变化，请先运行 status 检查当前版本。');
    }
    await rename(staged, paths.archive);
  });
}

function translate(original, release) {
  const bytes = buildLocalizedArchive(original.bytes);
  if (!Buffer.isBuffer(bytes) || hash(bytes) !== release.localizedSha256.toLowerCase()) {
    throw new Error(`生成的 Antigravity ${release.version} 汉化归档未通过 SHA-256 校验。`);
  }
  return bytes;
}

async function inspect(paths) {
  const current = await archiveAt(paths.archive);
  const { state, release } = archiveState(current);
  const descriptions = {
    original: '官方原版',
    localized: '当前简体中文版',
    legacy: '此前本机汉化版',
    unknown: '不支持的版本或未知改动',
  };
  console.log(`${descriptions[state]} — ${paths.archive}`);
  console.log(`SHA-256 ${current.sha256}`);
  if (!release) {
    console.log('未识别当前归档版本，无法匹配原版备份。');
    return;
  }
  console.log(`Antigravity ${release.version}`);
  const backup = await findOriginalBackup(paths, release);
  console.log(backup ? `已验证的原版备份 — ${backup.file}` : '暂无通过校验的原版备份。');
}

async function installOrRestore(command, paths) {
  const current = await archiveAt(paths.archive);
  const { state, release } = archiveState(current);
  const installing = command === 'apply';
  if (!release) {
    throw new Error(`当前归档不受支持（SHA-256 ${current.sha256}）。本工具仅支持已校验的 Antigravity ${supportedVersions} 归档。`);
  }
  if ((installing && state === 'localized') || (!installing && state === 'original')) {
    console.log(installing ? '当前已是简体中文版。' : '当前已是官方原版。');
    return;
  }

  await requireClosed(paths.directory);
  const original = state === 'original' ? current : await requireOriginalBackup(paths, release);
  const backup = installing ? await ensureBackup(paths, release, original) : original;
  const replacement = installing ? translate(original, release) : original.bytes;
  await replaceArchive(paths, current, replacement);
  console.log(installing ? '已安装简体中文界面。' : '已恢复官方英文界面。');
  console.log(`归档 — ${paths.archive}`);
  console.log(`原版备份 — ${backup.file}`);
}

async function build(options) {
  let original;
  let release;
  if (options['--input']) {
    const input = options['--input'];
    original = await archiveAt(input);
    release = verifyOriginal(original, input);
  } else {
    const paths = pathsFor(options['--app-dir']);
    const current = await archiveAt(paths.archive);
    const detected = archiveState(current);
    if (detected.state === 'localized' || detected.state === 'legacy') {
      release = detected.release;
      original = await requireOriginalBackup(paths, release);
    } else {
      release = verifyOriginal(current, paths.archive);
      original = current;
    }
  }

  const output = options['--output'] ?? resolve(outputName);
  try {
    await writeNewFile(output, translate(original, release));
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const existing = await existingFile(output);
    if (existing?.sha256 !== release.localizedSha256.toLowerCase()) {
      throw new Error(`输出文件已存在，且内容不同。请选择另一个 --output 路径。${output}`);
    }
  }
  console.log(`简体中文归档 — ${output}`);
}

async function main() {
  if (Number(process.versions.node.split('.')[0]) < 20) throw new Error('请使用 Node.js 20 或更新版本。');
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed) {
    console.log(usage);
    return;
  }

  const { command, options } = parsed;
  if (command === 'build') return build(options);
  const paths = pathsFor(options['--app-dir']);
  if (command === 'status') return inspect(paths);
  return installOrRestore(command, paths);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
