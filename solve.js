import { Buffer } from 'node:buffer';
import { WASM_BASE64 } from './wasm.js';

const module = new WebAssembly.Module(Buffer.from(WASM_BASE64, 'base64'));
const instance = new WebAssembly.Instance(module, {});
const wasm = instance.exports;
const memory = wasm.memory;

// The size of the static part of the module, the place where the file goes.
const staticSize = wasm.static_size();

// The room for the answer of one case.
//
// The module takes the room for its results right after the text, or where the
// caller says. The room is counted in words of four bytes. It needs: the start
// and the length of every field (two tables of one entry for every field), the
// kind of every field (a quarter of that), the first and the count of the rows
// (a half of that each), four tables of eight thousand and one for the rows
// that are not well, the side buffer for the fields that have a quote in them
// (as much as the text) and the room for the answer itself.
const OUT_CAP = 4 << 20;

// The room that one case needs, for the number of fields it has.
function roomFor(fields) {
  const cap = fields + 64;
  return cap + cap + (cap >> 2) + 16 + (cap >> 1) + 16 + (cap >> 1) + 16
    + 4 * 8192 + cap * 2 + 64 + (OUT_CAP >> 2) + 1024;
}

// The file is read as it is: no string of it is made, and the cases are read out
// of it by the module itself.
export function scan(fileBytes) {
  const n = fileBytes.length;
  // The room for the text of one case: a code unit takes two bytes, and the
  // bytes it came from took at least one. One case can be the whole file, so
  // the room is for the whole file.
  const textRoom = n * 2 + 65536;
  // The room for the results of the reading goes above the text.
  const arenaRoom = 16 << 20;
  const need = staticSize + n + textRoom + arenaRoom;
  const have = memory.buffer.byteLength;
  if (have < need) memory.grow(Math.ceil((need - have) / 65536));
  new Uint8Array(memory.buffer).set(fileBytes, staticSize);
  if (!wasm.scan_setup(staticSize, n, textRoom)) {
    throw new Error('the memory for the text is not there');
  }
  return { n, filePtr: staticSize };
}

// The number of commas in the text of the case, and the number of line feeds:
// they say how many fields the text can have. It gives the room for the
// results of the reading.
export function fieldsOf(textPtr, textLen) {
  return wasm.count_commas_text(textPtr, textLen);
}

// Finds the next case and reads its text. It gives back the place where the
// case ends, or -1 when there is none left.
export function nextCase(filePtr, n, from) {
  const next = wasm.scan_next(filePtr, n, from);
  if (wasm.case_count() === 0) return -1;
  return next;
}

// The text of the case that was found last.
export function caseTextPtr() {
  return wasm.scan_text_ptr();
}

export function caseTextLen() {
  return wasm.case_text_len(0);
}

export function caseHeader() {
  return wasm.case_header(0);
}

// Reads one case.
export function answerParse(textPtr, textLen, header, arenaWords, fields) {
  wasm.set_arena_base(wasm.scan_text_end());
  wasm.parse(textPtr, textLen, header, arenaWords, OUT_CAP, fields);
}

// Writes the answer of the case that was read out as JSON text.
export function answerEmit(textPtr) {
  wasm.emit(textPtr);
  return wasm.out_buffer();
}

// Reads one case and writes its answer out as JSON text.
export function answer(textPtr, textLen, header, arenaWords, fields) {
  answerParse(textPtr, textLen, header, arenaWords, fields);
  return answerEmit(textPtr);
}

// The length of the answer that was written out.
export function outLength() {
  return wasm.out_length();
}

// The place in the memory where the answer is.
export function outBuffer() {
  return wasm.out_buffer();
}

// The answer of one case, when the case comes in as an object.
//
// This is the way the rules ask for: a case comes in, and the answer goes out
// as an object. The text of the case is put in the memory of the module, the
// module reads it as CSV, and the answer comes back as JSON text.
//
// The way the harness runs is different and faster: it gives the whole file to
// the module at once, and the module reads the cases out of the file itself.
// The answers are the same either way.
export function run(input) {
  const text = input && input.text !== undefined ? String(input.text) : '';
  const header = input && input.header ? 1 : 0;
  // The text goes into the memory of the module as UTF-16 code units.
  const units = text.length;
  const bytes = (units * 2 + 3) & ~3;
  const ptr = staticSize;
  const have = memory.buffer.byteLength;
  const need = ptr + bytes + (32 << 20);
  if (have < need) memory.grow(Math.ceil((need - have) / 65536));
  const view = new Uint16Array(memory.buffer, ptr, units);
  for (let i = 0; i < units; i += 1) view[i] = text.charCodeAt(i);
  // The room for the results of the reading.
  const fields = wasm.count_commas_text(ptr, units);
  const words = roomFor(fields);
  wasm.set_arena_base(ptr + bytes);
  wasm.parse(ptr, units, header, words, OUT_CAP, fields);
  wasm.emit(ptr);
  return JSON.parse(view_());
}

// The answer that was written out, as JSON text.
export function view() {
  return view_();
}

function view_() {
  const answer = wasm.out_length();
  return new TextDecoder().decode(new Uint8Array(memory.buffer, wasm.out_buffer(), answer));
}

export { memory, roomFor };
