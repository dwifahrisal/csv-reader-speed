import { Buffer } from 'node:buffer';
import { WASM_BASE64 } from './wasm.js';

const module = new WebAssembly.Module(Buffer.from(WASM_BASE64, 'base64'));
const instance = new WebAssembly.Instance(module, {});
const wasm = instance.exports;
const memory = wasm.memory;
const textPtr = wasm.static_size();

let outPtr = 0;
let outLen = 0;

function reserve(bytes) {
  const have = memory.buffer.byteLength;
  if (have < bytes) memory.grow(Math.ceil((bytes - have) / 65536));
}

function roomFor(len) {
  const cap = (len >> 1) + 64;
  const answer = Math.max(16 << 20, len * 3);
  const words = Math.ceil(cap * 5.25) + 65536 + Math.ceil(answer / 4) + 4096;
  return { words, answer };
}

function word(base, index) {
  const bytes = new Uint8Array(memory.buffer, base + index * 4, 4);
  return (bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24)) >>> 0;
}

function signedWord(base, index) {
  return word(base, index) | 0;
}

function byte(base, index) {
  return new Uint8Array(memory.buffer, base + index, 1)[0];
}

function codeUnit(base, index) {
  return new Uint16Array(memory.buffer, base + index * 2, 1)[0];
}

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const room = roomFor(len);

  reserve(textPtr + len * 2 + room.words * 4);
  new Uint8Array(memory.buffer).set(Buffer.from(text, 'utf16le'), textPtr);

  wasm.parse(textPtr, len, header ? 1 : 0, room.words, room.answer);
  wasm.emit(textPtr);

  outPtr = wasm.out_buffer();
  outLen = wasm.out_length();

  let value;

  function build() {
    if (value !== undefined) return value;

    const fieldCount = wasm.counts(0);
    const rowCount = wasm.counts(1);
    const errorCount = wasm.counts(2);
    const width = wasm.counts(3);
    const headerFirst = wasm.counts(4);
    const headerFields = wasm.counts(5);

    const fieldsStart = wasm.fields_start();
    const fieldsLen = wasm.fields_len();
    const fieldsKind = wasm.fields_kind();
    const rowsFirst = wasm.rows_first();
    const rowsCount = wasm.rows_count();
    const errorsCode = wasm.errors_code();
    const errorsLine = wasm.errors_line();
    const errorsRow = wasm.errors_row();
    const errorsExtra = wasm.errors_extra();
    const side = wasm.side_buffer();

    function textOf(index) {
      const start = word(fieldsStart, index);
      const length = word(fieldsLen, index);
      if (byte(fieldsKind, index) === 0) return text.slice(start, start + length);
      let out = '';
      for (let i = 0; i < length; i += 1) out += String.fromCharCode(codeUnit(side, start + i));
      return out;
    }

    const first = header ? 1 : 0;
    const rows = new Array(Math.max(0, rowCount - first));
    for (let r = first; r < rowCount; r += 1) {
      const field = word(rowsFirst, r);
      const count = word(rowsCount, r);
      const row = new Array(width);
      for (let c = 0; c < width; c += 1) row[c] = c < count ? textOf(field + c) : '';
      rows[r - first] = row;
    }

    const errors = new Array(errorCount);
    for (let e = 0; e < errorCount; e += 1) {
      const code = word(errorsCode, e);
      const line = word(errorsLine, e);
      const row = signedWord(errorsRow, e);
      const extra = word(errorsExtra, e);
      if (code === 3) {
        errors[e] = { code: 'short_row', line, row: row < 0 ? null : row, fields: extra };
      } else if (code === 4) {
        const record = row < 0 ? 0 : row + first;
        const field = word(rowsFirst, record);
        const count = word(rowsCount, record);
        const beyond = [];
        for (let c = width; c < count; c += 1) beyond.push(textOf(field + c));
        errors[e] = { code: 'long_row', line, row: row < 0 ? null : row, extra: beyond };
      } else {
        const name = code === 0 ? 'stray_cr' : code === 1 ? 'quote_junk' : 'unterminated_quote';
        errors[e] = { code: name, line, row: row < 0 ? null : row };
      }
    }

    let columns = null;
    if (header) {
      columns = new Array(headerFields);
      for (let c = 0; c < headerFields; c += 1) columns[c] = textOf(headerFirst + c);
    }

    value = { columns, rows, errors };
    return value;
  }

  return {
    get columns() { return build().columns; },
    get rows() { return build().rows; },
    get errors() { return build().errors; },
  };
}

export function view() {
  return new Uint8Array(memory.buffer, outPtr, outLen);
}
