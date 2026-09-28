import { ApiError } from "./http";

const MAX_DIMENSION = 4096;
const MAX_PIXELS = 16_000_000;
const METADATA_CHUNKS = new Set(["EXIF", "XMP ", "ICCP"]);
const IMAGE_CHUNKS = new Set(["VP8 ", "VP8L"]);

interface WebpChunk {
  type: string;
  data: Uint8Array;
}

export function sanitizeWebp(input: Uint8Array): Uint8Array {
  if (input.length < 20 || ascii(input, 0, 4) !== "RIFF" || ascii(input, 8, 12) !== "WEBP") invalid();
  if (readUint32(input, 4) !== input.length - 8) invalid();

  const chunks: WebpChunk[] = [];
  let imageChunks = 0;
  let width = 0;
  let height = 0;
  let offset = 12;

  while (offset < input.length) {
    if (offset + 8 > input.length) invalid();
    const type = ascii(input, offset, offset + 4);
    const size = readUint32(input, offset + 4);
    const start = offset + 8;
    const end = start + size;
    const paddedEnd = end + (size & 1);
    if (end < start || paddedEnd > input.length) invalid();

    let data = input.slice(start, end);
    if (METADATA_CHUNKS.has(type)) {
      offset = paddedEnd;
      continue;
    }
    if (type === "ANIM" || type === "ANMF") throw new ApiError(400, "animated_image_not_allowed");
    if (type === "VP8X") {
      if (data.length !== 10 || (data[0] & 0x02) !== 0) invalid();
      data = data.slice();
      data[0] &= ~0x2c;
      width = 1 + readUint24(data, 4);
      height = 1 + readUint24(data, 7);
    } else if (type === "VP8 ") {
      if (data.length < 10 || data[3] !== 0x9d || data[4] !== 0x01 || data[5] !== 0x2a) invalid();
      width ||= (data[6] | (data[7] << 8)) & 0x3fff;
      height ||= (data[8] | (data[9] << 8)) & 0x3fff;
    } else if (type === "VP8L") {
      if (data.length < 5 || data[0] !== 0x2f) invalid();
      width ||= 1 + data[1] + ((data[2] & 0x3f) << 8);
      height ||= 1 + ((data[2] & 0xc0) >> 6) + (data[3] << 2) + ((data[4] & 0x0f) << 10);
    } else if (type !== "ALPH") {
      invalid();
    }

    if (IMAGE_CHUNKS.has(type)) imageChunks += 1;
    chunks.push({ type, data });
    offset = paddedEnd;
  }

  if (offset !== input.length || imageChunks !== 1 || width < 1 || height < 1) invalid();
  if (width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_PIXELS) {
    throw new ApiError(400, "image_dimensions_too_large");
  }

  const payloadSize = 4 + chunks.reduce((total, chunk) => total + 8 + chunk.data.length + (chunk.data.length & 1), 0);
  const output = new Uint8Array(payloadSize + 8);
  writeAscii(output, 0, "RIFF");
  writeUint32(output, 4, payloadSize);
  writeAscii(output, 8, "WEBP");
  offset = 12;
  for (const chunk of chunks) {
    writeAscii(output, offset, chunk.type);
    writeUint32(output, offset + 4, chunk.data.length);
    output.set(chunk.data, offset + 8);
    offset += 8 + chunk.data.length + (chunk.data.length & 1);
  }
  return output;
}

function invalid(): never {
  throw new ApiError(400, "invalid_image_signature");
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

function readUint24(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function writeAscii(bytes: Uint8Array, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) bytes[offset + index] = value.charCodeAt(index);
}

function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}
