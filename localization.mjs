import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readAsar, repackAsar } from './asar.mjs';

const releasesByVersion = {
  '2.33.0': {
    originalSha256: 'b33c81600e82e65593aa8430ef01b37d6b28d9d98f0faf45e25957783b71e64b',
    localizedSha256: '3130b72b08e95009483fcdc1d4840012b680b630f1a5c5acec521d1a5aff285f',
    legacySha256: [
      '0a26de3e268168f3ca309458f9fd278f33f3838c4f76eb04552c4d36de9461b8',
      '0df36f521f3468817f45ac3dc3509768319bfd31c34266059accbd4cec52044e',
      '43df6b36e2dbdf118d75a336c84b794a262aa9ebbdaf878626b8c248c04f186a',
    ],
    sourceSuffix: '',
  },
  '2.34.0': {
    originalSha256: '8934adef0622c9271c92eea950a71848764a66f7b10023ccbd82e54b959adb0e',
    localizedSha256: 'a4f1c57b5f9b303aba2ff5ccb2c0ba72b71a6872246e3d46d32964bb8a7a87b1',
    legacySha256: [
      '35b0201f25ff530270d77c45e063d8718c54b66dbdafb7f2bb102c4b7ced3de4',
      'afef1a7880acf67de019858e937c20e60008b6f5c9a2dfd718a7c65d73b993ac',
      '395633b7ca76b4d986bd5df9ed7c43d321d03477f0956da6e811623728f74bd3',
      'bf0edb411071470477aa7f4b768ec89168a85c376dce2b1aed6f8efd8a3a1f8b',
    ],
    sourceSuffix: '-2.34.0',
  },
};

export const releases = Object.freeze(Object.entries(releasesByVersion).map(([version, release]) => Object.freeze({
  version,
  originalSha256: release.originalSha256,
  localizedSha256: release.localizedSha256,
  legacySha256: Object.freeze(release.legacySha256),
})));

export const supportedVersion = '2.33.0';
export const upstreamSha256 = releasesByVersion[supportedVersion].originalSha256;
export const localizedSha256 = releasesByVersion[supportedVersion].localizedSha256;

const readSource = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const sha256 = data => createHash('sha256').update(data).digest('hex');

export function buildLocalizedArchive(originalBuffer) {
  const release = releases.find(candidate => candidate.originalSha256 === sha256(originalBuffer));
  if (!release) {
    throw new Error('需要通过 SHA-256 校验的 Antigravity App Windows 原版 app.asar。');
  }

  const suffix = releasesByVersion[release.version].sourceSuffix;
  const patches = JSON.parse(readSource('./patches-' + release.version + '.json'));
  const renderer = readSource('./renderer' + suffix + '.js')
    .trimEnd()
    .replace('/* @dictionary */ {}', () => readSource('./dictionary' + suffix + '.json').trimEnd())
    .replace('/* @core-words */ {}', () => readSource('./core-words' + suffix + '.json').trimEnd());

  const archive = readAsar(originalBuffer);
  const replacements = new Map();

  for (const [path, patch] of Object.entries(patches)) {
    const original = archive.readFile(path);
    if (!original) throw new Error('归档中缺少补丁文件：' + path);
    const chunks = [];
    let cursor = 0;

    for (const [offset, length, translation] of patch.edits) {
      if (!Number.isSafeInteger(offset) || offset < cursor || !Number.isSafeInteger(length) ||
          length < 0 || offset + length > original.length || typeof translation !== 'string') {
        throw new Error('补丁数据无效：' + path);
      }
      chunks.push(original.subarray(cursor, offset), Buffer.from(translation));
      cursor = offset + length;
    }
    chunks.push(original.subarray(cursor));

    if (patch.renderer) {
      const script = patch.renderer === 'wizard'
        ? renderer.replace('const requiresHubDocument = true;', 'const requiresHubDocument = false;')
        : renderer;
      chunks.push(Buffer.from(script));
    }

    replacements.set(path, Buffer.concat(chunks));
  }

  const localized = repackAsar(archive, replacements);
  if (sha256(localized) !== release.localizedSha256) {
    throw new Error('汉化包校验失败，未生成可安装文件。');
  }
  return localized;
}

