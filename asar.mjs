import { createHash } from 'node:crypto';

const archives = new WeakMap();
const utf8 = new TextDecoder('utf-8', { fatal: true });
const defaultBlockSize = 4 * 1024 * 1024;

const alignToFourBytes = (length) => Math.ceil(length / 4) * 4;
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function readHeader(buffer) {
  if (buffer.length < 16 || buffer.readUInt32LE(0) !== 4) {
    throw new Error('Invalid ASAR size pickle');
  }
  const headerSize = buffer.readUInt32LE(4);
  const jsonSize = buffer.readUInt32LE(12);
  if (headerSize !== 8 + alignToFourBytes(jsonSize) ||
      headerSize > buffer.length - 8 || buffer.readUInt32LE(8) !== headerSize - 4) {
    throw new Error('Invalid ASAR header length');
  }

  let text;
  let header;
  try {
    text = utf8.decode(buffer.subarray(16, 16 + jsonSize));
    header = JSON.parse(text);
  } catch (error) {
    throw new Error('Invalid ASAR header JSON', { cause: error });
  }
  if (!isRecord(header) || !isRecord(header.files)) {
    throw new Error('Invalid ASAR header file tree');
  }
  return { header, text, dataStart: 8 + headerSize };
}

function* walkEntries(files, prefix = '') {
  for (const [name, metadata] of Object.entries(files)) {
    const filePath = prefix + name;
    if (!name || name === '.' || name === '..' || /[/\\\0]/.test(name) || !isRecord(metadata)) {
      throw new Error(`Invalid ASAR entry ${JSON.stringify(filePath)}`);
    }
    yield [filePath, metadata];
    if (Object.hasOwn(metadata, 'files')) {
      if (!isRecord(metadata.files)) {
        throw new Error(`Invalid ASAR directory ${filePath}`);
      }
      yield* walkEntries(metadata.files, `${filePath}/`);
    }
  }
}

export function readAsar(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError('ASAR input must be a Buffer');
  }
  const { header, text, dataStart } = readHeader(buffer);
  const data = buffer.subarray(dataStart);
  const entries = new Map();
  const packed = new Map();

  for (const [filePath, metadata] of walkEntries(header.files)) {
    entries.set(filePath, metadata);
    const isDirectory = Object.hasOwn(metadata, 'files');
    const isLink = Object.hasOwn(metadata, 'link');
    const hasOffset = Object.hasOwn(metadata, 'offset');
    if (Object.hasOwn(metadata, 'unpacked') && typeof metadata.unpacked !== 'boolean') {
      throw new Error(`Invalid ASAR unpacked flag for ${filePath}`);
    }
    if ((isDirectory && isLink) || ((isDirectory || isLink || metadata.unpacked) && hasOffset)) {
      throw new Error(`Conflicting ASAR entry fields for ${filePath}`);
    }
    if (isLink && (typeof metadata.link !== 'string' || metadata.link.includes('\0'))) {
      throw new Error(`Invalid ASAR link for ${filePath}`);
    }
    if (isDirectory || isLink) continue;

    const { size } = metadata;
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new Error(`Invalid ASAR file size for ${filePath}`);
    }
    if (metadata.unpacked) continue;

    const offset = Number(metadata.offset);
    if (typeof metadata.offset !== 'string' || !/^\d+$/.test(metadata.offset) ||
        !Number.isSafeInteger(offset) || offset > data.length || size > data.length - offset) {
      throw new Error(`Invalid ASAR file offset or range for ${filePath}`);
    }
    packed.set(filePath, { filePath, offset, size });
  }

  // Read the payload in its original physical order, including any padding.
  const ordered = [...packed.values()].sort((a, b) => a.offset - b.offset || a.size - b.size);
  let end = 0;
  for (const entry of ordered) {
    if (entry.offset < end) {
      throw new Error(`Overlapping ASAR file range for ${entry.filePath}`);
    }
    end = entry.offset + entry.size;
  }

  const archive = {
    header,
    entries,
    // Links and unpacked files do not have their own bytes in this buffer.
    readFile(filePath) {
      const entry = packed.get(filePath);
      return entry && data.subarray(entry.offset, entry.offset + entry.size);
    },
  };
  archives.set(archive, { buffer, data, text, packed, ordered });
  return archive;
}

function updateIntegrity(metadata, bytes) {
  const previous = metadata.integrity;
  const blockSize = previous?.blockSize ?? defaultBlockSize;
  if (!Number.isSafeInteger(blockSize) || blockSize <= 0) {
    throw new Error('Invalid ASAR integrity block size');
  }
  const hash = sha256(bytes);
  const blocks = bytes.length === 0 ? [hash] : [];
  for (let start = 0; start < bytes.length; start += blockSize) {
    blocks.push(sha256(bytes.subarray(start, start + blockSize)));
  }
  metadata.integrity = { ...previous, algorithm: 'SHA256', hash, blockSize, blocks };
}

function encodeHeader(header) {
  const json = Buffer.from(JSON.stringify(header), 'utf8');
  const pickleSize = 8 + alignToFourBytes(json.length);
  const buffer = Buffer.alloc(8 + pickleSize);
  buffer.writeUInt32LE(4, 0);
  buffer.writeUInt32LE(pickleSize, 4);
  buffer.writeUInt32LE(pickleSize - 4, 8);
  buffer.writeUInt32LE(json.length, 12);
  json.copy(buffer, 16);
  return buffer;
}

export function repackAsar(archive, replacements) {
  const original = archives.get(archive);
  if (!original || !(replacements instanceof Map)) {
    throw new TypeError('Repacking requires an archive from readAsar and a replacement Map');
  }

  const changed = new Map();
  for (const [filePath, bytes] of replacements) {
    const entry = original.packed.get(filePath);
    if (!entry || !Buffer.isBuffer(bytes)) {
      throw new TypeError(`Replacement requires a packed ASAR file and a Buffer: ${String(filePath)}`);
    }
    const before = original.data.subarray(entry.offset, entry.offset + entry.size);
    if (!before.equals(bytes)) changed.set(filePath, bytes);
  }
  if (changed.size === 0) return Buffer.from(original.buffer);

  const header = JSON.parse(original.text);
  const entries = new Map(walkEntries(header.files));
  const parts = [];
  let readOffset = 0;
  let writeOffset = 0;
  for (const { filePath, offset, size } of original.ordered) {
    const gap = original.data.subarray(readOffset, offset);
    parts.push(gap);
    writeOffset += gap.length;

    const metadata = entries.get(filePath);
    if (offset !== writeOffset) metadata.offset = String(writeOffset);
    const replacement = changed.get(filePath);
    if (replacement) {
      metadata.size = replacement.length;
      updateIntegrity(metadata, replacement);
    }

    readOffset = offset + size;
    const bytes = replacement ?? original.data.subarray(offset, readOffset);
    parts.push(bytes);
    writeOffset += bytes.length;
  }
  parts.push(original.data.subarray(readOffset));

  return Buffer.concat([encodeHeader(header), ...parts]);
}
