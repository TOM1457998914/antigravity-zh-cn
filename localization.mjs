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
  '2.35.0': {
    originalSha256: '99ff7f6cf1219f46c8437df65ca866e384836b5230adba8efd91b3152f823e15',
    localizedSha256: 'dd28bc41e626ac22ce46a3db960617a9689d04c9a071c3a3cfd5a7cee5e15147',
    legacySha256: [
      '081a6cda424e0f374d94875d92b33d53bf72fa0eaea936e1885cb10bcb8b93f3',
      '42ea64445d5d482df567ff1f5eac96fa0747e870fb8c5a33dad291246fb7daa4',
      '97f8a9321c4153051d7bec14e831acf02e5f737644d6ccb08d4517786d0483a7',
    ],
    patchVersion: '2.35.1',
  },
  '2.35.1': {
    originalSha256: '9f0aad7274795d7fbde04931d96b348dcfc5f3d81d7373e6b70aeb09307442df',
    localizedSha256: '105f04df195b3294dd6d99edce299d39cc16eb893d0f1c2aa3ae9fa45fc89f6f',
    legacySha256: ['35df2b85e2da79bbbc1f25aabe1fef128e78459d152f81c5d74f4b3a0b4a6d69'],
  },
  '2.35.2': {
    originalSha256: 'e057115571cf5085406d20f2427a5afac272b712ec84332c7157da0113d4b2d0',
    localizedSha256: '0cec75b17ba698987d4d76996fd3b34902d74ab75b51609a1f415e066e2aa4a4',
    legacySha256: [],
    patchVersion: '2.35.1',
    supplementalPatch: '2.35.2',
  },
  '2.36.0': {
    originalSha256: 'd2bc25eab00f2ff6f14395e45f13347eef605af5a63f28db7edbfd2ab42a7571',
    localizedSha256: '7c62be44a0a91253004e4b7083a5375cfad80d3ae00425242412c4783d5f5582',
    legacySha256: [],
    patchVersion: '2.35.1',
    supplementalPatch: '2.35.2',
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

function readPatches(patchVersion, supplementalPatch) {
  const patches = JSON.parse(readSource('./patches-' + patchVersion + '.json'));
  if (supplementalPatch === undefined) return patches;

  const supplemental = JSON.parse(readSource('./patches-' + supplementalPatch + '.json'));
  for (const [path, patch] of Object.entries(supplemental)) {
    const base = patches[path];
    patches[path] = {
      ...base,
      edits: [...(base?.edits ?? []), ...patch.edits].sort(([first], [second]) => first - second),
      append: [...(base?.append ?? []), ...(patch.append ?? [])],
    };
  }
  return patches;
}

export function buildLocalizedArchive(originalBuffer) {
  const release = releases.find(candidate => candidate.originalSha256 === sha256(originalBuffer));
  if (!release) {
    throw new Error('需要通过 SHA-256 校验的 Antigravity App Windows 原版 app.asar。');
  }

  const { sourceSuffix, patchVersion = release.version, supplementalPatch } = releasesByVersion[release.version];
  const patches = readPatches(patchVersion, supplementalPatch);
  const renderer = sourceSuffix === undefined ? undefined : readSource('./renderer' + sourceSuffix + '.js')
    .trimEnd()
    .replace('/* @dictionary */ {}', () => readSource('./dictionary' + sourceSuffix + '.json').trimEnd())
    .replace('/* @core-words */ {}', () => readSource('./core-words' + sourceSuffix + '.json').trimEnd());
  const appendedAssets = new Map();

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

    for (const asset of patch.append ?? []) {
      if (!appendedAssets.has(asset)) {
        appendedAssets.set(asset, Buffer.from('\n\n' + readSource('./' + asset).trimEnd() + '\n'));
      }
      chunks.push(appendedAssets.get(asset));
    }

    replacements.set(path, Buffer.concat(chunks));
  }

  const localized = repackAsar(archive, replacements);
  if (sha256(localized) !== release.localizedSha256) {
    throw new Error('汉化包校验失败，未生成可安装文件。');
  }
  return localized;
}

