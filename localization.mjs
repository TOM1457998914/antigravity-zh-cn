import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readAsar, repackAsar } from './asar.mjs';

export const supportedVersion = '2.33.0';
export const upstreamSha256 = 'b33c81600e82e65593aa8430ef01b37d6b28d9d98f0faf45e25957783b71e64b';
export const localizedSha256 = '3130b72b08e95009483fcdc1d4840012b680b630f1a5c5acec521d1a5aff285f';

const readSource = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const sha256 = data => createHash('sha256').update(data).digest('hex');
const patches = JSON.parse(readSource('./patches-2.33.0.json'));
const renderer = readSource('./renderer.js')
  .trimEnd()
  .replace('/* @dictionary */ {}', () => readSource('./dictionary.json').trimEnd())
  .replace('/* @core-words */ {}', () => readSource('./core-words.json').trimEnd());

export function buildLocalizedArchive(originalBuffer) {
  if (sha256(originalBuffer) !== upstreamSha256) {
    throw new Error(`需要 Antigravity App ${supportedVersion} Windows 原版 app.asar，文件校验失败。`);
  }

  const archive = readAsar(originalBuffer);
  const replacements = new Map();

  for (const [path, patch] of Object.entries(patches)) {
    const original = archive.readFile(path);
    const chunks = [];
    let cursor = 0;

    for (const [offset, length, translation] of patch.edits) {
      if (offset < cursor || offset + length > original.length) {
        throw new Error(`补丁数据无效：${path}`);
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
  if (sha256(localized) !== localizedSha256) {
    throw new Error('汉化包校验失败，未生成可安装文件。');
  }
  return localized;
}
