'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Electron normally treats a path ending in .asar as a virtual directory.
// This tool edits the archive bytes themselves, so turn that behavior off
// before opening the input file.
process.noAsar = true;

const [archivePath, envPath] = process.argv.slice(2);

if (!archivePath || !envPath) {
  throw new Error('usage: rewrite-asar-env.js <archive-path> <env-path>');
}

const ALIGNMENT = 4;
const COPY_BUFFER_SIZE = 1024 * 1024;

function align(value) {
  return Math.ceil(value / ALIGNMENT) * ALIGNMENT;
}

function readExactly(fd, size, position) {
  const buffer = Buffer.alloc(size);
  const bytesRead = fs.readSync(fd, buffer, 0, size, position);
  if (bytesRead !== size) {
    throw new Error(`unable to read ${size} bytes at archive offset ${position}`);
  }
  return buffer;
}

function writeAll(fd, buffer) {
  let written = 0;
  while (written < buffer.length) {
    written += fs.writeSync(fd, buffer, written, buffer.length - written);
  }
}

function copyRange(sourceFd, destinationFd, start, length) {
  const buffer = Buffer.allocUnsafe(Math.min(COPY_BUFFER_SIZE, Math.max(length, 1)));
  let position = start;
  let remaining = length;

  while (remaining > 0) {
    const chunkSize = Math.min(buffer.length, remaining);
    const bytesRead = fs.readSync(sourceFd, buffer, 0, chunkSize, position);
    if (bytesRead !== chunkSize) {
      throw new Error(`unable to copy archive bytes at offset ${position}`);
    }
    writeAll(destinationFd, buffer.subarray(0, bytesRead));
    position += bytesRead;
    remaining -= bytesRead;
  }
}

function makePickleString(value) {
  const payload = Buffer.from(value, 'utf8');
  const payloadSize = 4 + align(payload.length);
  const pickle = Buffer.alloc(4 + payloadSize);
  pickle.writeUInt32LE(payloadSize, 0);
  pickle.writeUInt32LE(payload.length, 4);
  payload.copy(pickle, 8);
  return pickle;
}

function makePickleUInt32(value) {
  const pickle = Buffer.alloc(8);
  pickle.writeUInt32LE(4, 0);
  pickle.writeUInt32LE(value, 4);
  return pickle;
}

function hash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function integrityFor(buffer, previousIntegrity) {
  const algorithm = previousIntegrity?.algorithm ?? 'SHA256';
  const blockSize = previousIntegrity?.blockSize ?? 4 * 1024 * 1024;

  if (algorithm.toLowerCase() !== 'sha256' || !Number.isSafeInteger(blockSize) || blockSize <= 0) {
    throw new Error('unsupported ASAR integrity configuration');
  }

  const blocks = [];
  for (let offset = 0; offset < buffer.length; offset += blockSize) {
    blocks.push(hash(buffer.subarray(offset, offset + blockSize)));
  }

  return {
    algorithm,
    hash: hash(buffer),
    blockSize,
    blocks,
  };
}

function updateOffsets(node, targetOffset, delta) {
  if (!node?.files) {
    return;
  }

  for (const child of Object.values(node.files)) {
    if (Object.hasOwn(child, 'offset')) {
      const offset = BigInt(child.offset);
      if (offset > targetOffset) {
        child.offset = (offset + delta).toString();
      }
    }
    updateOffsets(child, targetOffset, delta);
  }
}

function getEntryRecord(header, entryPath) {
  return entryPath.split('/').reduce((node, component) => node?.files?.[component], header);
}

function rewriteArchiveEntry(entryPath, transform) {
  const archiveStats = fs.statSync(archivePath);
  const archiveFd = fs.openSync(archivePath, 'r');
  let temporaryPath;

  try {
    const prefix = readExactly(archiveFd, 16, 0);
    const sizePicklePayloadSize = prefix.readUInt32LE(0);
    const headerSize = prefix.readUInt32LE(4);
    const headerPicklePayloadSize = prefix.readUInt32LE(8);
    const headerJsonSize = prefix.readUInt32LE(12);

    if (
      sizePicklePayloadSize !== 4 ||
      headerSize !== 4 + headerPicklePayloadSize ||
      headerPicklePayloadSize !== 4 + align(headerJsonSize) ||
      8 + headerSize > archiveStats.size
    ) {
      throw new Error('unsupported or malformed ASAR header');
    }

    const headerJson = readExactly(archiveFd, headerJsonSize, 16).toString('utf8');
    const header = JSON.parse(headerJson);
    const entryRecord = getEntryRecord(header, entryPath);

    if (!entryRecord || typeof entryRecord.offset !== 'string' || !Number.isSafeInteger(entryRecord.size)) {
      throw new Error(`the ASAR archive does not contain a packed ${entryPath} file`);
    }

    const oldDataStart = 8 + headerSize;
    const entryOffset = BigInt(entryRecord.offset);
    const entryOffsetNumber = Number(entryOffset);
    const oldEntrySize = entryRecord.size;

    if (
      !Number.isSafeInteger(entryOffsetNumber) ||
      entryOffsetNumber < 0 ||
      oldEntrySize < 0 ||
      oldDataStart + entryOffsetNumber + oldEntrySize > archiveStats.size
    ) {
      throw new Error(`the ${entryPath} ASAR entry has invalid bounds`);
    }

    const oldEntry = readExactly(archiveFd, oldEntrySize, oldDataStart + entryOffsetNumber);
    const newEntry = transform(oldEntry);
    if (!Buffer.isBuffer(newEntry)) {
      throw new Error(`the ${entryPath} ASAR transform did not return a buffer`);
    }

    const delta = BigInt(newEntry.length - oldEntrySize);
    entryRecord.size = newEntry.length;
    entryRecord.integrity = integrityFor(newEntry, entryRecord.integrity);
    updateOffsets(header, entryOffset, delta);

    const newHeaderPickle = makePickleString(JSON.stringify(header));
    const newSizePickle = makePickleUInt32(newHeaderPickle.length);
    const beforeEntryLength = entryOffsetNumber;
    const afterEntryStart = oldDataStart + entryOffsetNumber + oldEntrySize;
    const afterEntryLength = archiveStats.size - afterEntryStart;
    const temporaryName = `.${path.basename(archivePath)}.rewrite-${process.pid}.tmp`;
    temporaryPath = path.join(path.dirname(archivePath), temporaryName);
    const outputFd = fs.openSync(temporaryPath, 'wx', archiveStats.mode);

    try {
      writeAll(outputFd, newSizePickle);
      writeAll(outputFd, newHeaderPickle);
      copyRange(archiveFd, outputFd, oldDataStart, beforeEntryLength);
      writeAll(outputFd, newEntry);
      copyRange(archiveFd, outputFd, afterEntryStart, afterEntryLength);
      fs.fsyncSync(outputFd);
    } finally {
      fs.closeSync(outputFd);
    }

    fs.renameSync(temporaryPath, archivePath);
    temporaryPath = undefined;
  } finally {
    fs.closeSync(archiveFd);
    if (temporaryPath) {
      fs.rmSync(temporaryPath, { force: true });
    }
  }
}

function replaceExactlyOnce(source, expected, replacement, label) {
  const first = source.indexOf(expected);
  if (first === -1 || source.indexOf(expected, first + expected.length) !== -1) {
    throw new Error(`unable to apply the ${label} deep-link patch`);
  }
  return source.slice(0, first) + replacement + source.slice(first + expected.length);
}

function patchDeepLinkSource(entry) {
  let source = entry.toString('utf8');
  const oldUrlMatcher = [
    'function isDeepLinkUrl(url) {',
    '    return url.startsWith(`${exports.PROTOCOL_NAME}://`) || url.startsWith(`${exports.PROTOCOL_NAME}:`);',
    '}',
  ].join('\n');
  const newUrlMatcher = [
    "const DEEP_LINK_PROTOCOL_ALIASES = [exports.PROTOCOL_NAME, 'minimax', 'minimax-cn'];",
    'function getDeepLinkProtocol(url) {',
    '    return DEEP_LINK_PROTOCOL_ALIASES.find((protocol) => url.startsWith(`${protocol}://`) || url.startsWith(`${protocol}:`));',
    '}',
    'function isDeepLinkUrl(url) {',
    '    return !!getDeepLinkProtocol(url);',
    '}',
  ].join('\n');
  const oldParser = '        const cleanUrl = url.replace(`${exports.PROTOCOL_NAME}://`, \'\').replace(`${exports.PROTOCOL_NAME}:`, \'\');';
  const newParser = [
    '        const protocol = getDeepLinkProtocol(url);',
    '        const cleanUrl = protocol',
    "            ? url.replace(`${protocol}://`, '').replace(`${protocol}:`, '')",
    '            : url;',
  ].join('\n');

  source = replaceExactlyOnce(source, oldUrlMatcher, newUrlMatcher, 'protocol alias matcher');
  source = replaceExactlyOnce(source, oldParser, newParser, 'protocol alias parser');
  return Buffer.from(source, 'utf8');
}

rewriteArchiveEntry('.env.local', (oldEntry) => {
  if (!oldEntry.toString('utf8').includes('NEXT_PUBLIC_LOCALE=')) {
    throw new Error('the .env.local ASAR entry is not a MiniMax environment file');
  }
  return fs.readFileSync(envPath);
});

rewriteArchiveEntry('dist/main/modules/deeplink/index.js', patchDeepLinkSource);
