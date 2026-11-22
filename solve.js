// A CSV reader that reads the way csv-reader 1.0.0 reads.
//
// The reading is done by the WebAssembly module below: it takes the text as UTF-16 code units, finds
// the boundaries of the fields and of the records with the vector instructions, and writes the answer
// as JSON text in UTF-8 while it reads. The caller gets the answer twice: as the value run() returns,
// and as the JSON text the module wrote.
//
// The policy is csv-reader's own: a U+FEFF at the very start of the text is dropped; a record ends at
// LF or CRLF, and a line left with no characters is no record; outside a quoted field a CR not
// followed by LF is dropped (stray_cr); a field that opens with a quote runs to the next quote that is
// not doubled, "" inside it one quote, and each CRLF or lone CR inside it is read as LF; what follows
// its closing quote, up to the next comma or line break, is appended to it as it stands (quote_junk,
// when the field ends); a quote that never closes is read as a literal character and the text after it
// is read again as an unquoted field (unterminated_quote); a quote inside an unquoted field is a
// literal character; columns is the first record when header is true, else null; rows holds the
// records after it, each padded with "" or cut to the first record's width; each error is {code, line,
// row}: line the 1-based line its record starts on, row its record's index in rows (null for the
// header), in the order met.
//
// Pure: no clock, no randomness, no locale, nothing kept from one call to the next.


import { Buffer } from 'node:buffer';
import { WASM_BASE64 } from './wasm.js';



const wasmBytes = Buffer.from(WASM_BASE64, 'base64');
const w = new WebAssembly.Instance(new WebAssembly.Module(wasmBytes), {}).exports;

const memory = w.memory;
const base = w.static_size();
let outStart = 0;
let outLength = 0;

function ensure(needed) {
  if (memory.buffer.byteLength < needed) {
    memory.grow(Math.ceil((needed - memory.buffer.byteLength) / 65536));
  }
}

/** The reading of one CSV input, {text, header}: {columns, rows, errors} (the header). */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  ensure(base + text.length * 2 + 8 * 1024 * 1024);
  new Uint8Array(memory.buffer).set(Buffer.from(text, 'utf16le'), base);
  w.parse(base, text.length, header ? 1 : 0);
  w.emit(base);
  outStart = w.out_buffer();
  outLength = w.out_length();

  // The value the JSON text holds, read back from the module's own results. It is built when it is
  // asked for, so that a caller that only wants the text pays nothing for it.
  let built = null;
  const build = () => {
    if (built) return built;
    const nFields = w.counts(0);
    const nRows = w.counts(1);
    const nErrors = w.counts(2);
    const width = w.counts(3);
    const headerFirst = w.counts(4);
    const headerCount = w.counts(5);
    const fStart = new Uint32Array(memory.buffer, w.fields_start(), nFields);
    const fLen = new Uint32Array(memory.buffer, w.fields_len(), nFields);
    const fKind = new Uint8Array(memory.buffer, w.fields_kind(), nFields);
    const rFirst = new Uint32Array(memory.buffer, w.rows_first(), nRows);
    const rCount = new Uint32Array(memory.buffer, w.rows_count(), nRows);
    const eCode = new Uint32Array(memory.buffer, w.errors_code(), nErrors);
    const eLine = new Uint32Array(memory.buffer, w.errors_line(), nErrors);
    const eRow = new Int32Array(memory.buffer, w.errors_row(), nErrors);
    const eExtra = new Uint32Array(memory.buffer, w.errors_extra(), nErrors);
    const side = new Uint16Array(memory.buffer, w.side_buffer());

    const fieldText = (i) => {
      const kind = fKind[i];
      if (kind === 0) return text.slice(fStart[i], fStart[i] + fLen[i]);
      const n = fLen[i];
      let s = '';
      for (let k = 0; k < n; k += 1) s += String.fromCharCode(side[fStart[i] + k]);
      return s;
    };

    const firstRow = header ? 1 : 0;
    const rows = new Array(Math.max(0, nRows - firstRow));
    for (let r = firstRow; r < nRows; r += 1) {
      const first = rFirst[r];
      const count = rCount[r];
      const row = new Array(width);
      for (let j = 0; j < width; j += 1) row[j] = j < count ? fieldText(first + j) : '';
      rows[r - firstRow] = row;
    }

    const errors = new Array(nErrors);
    for (let e = 0; e < nErrors; e += 1) {
      const code = eCode[e];
      const row = eRow[e];
      const line = eLine[e];
      if (code === 3) {
        errors[e] = { code: 'short_row', line, row: row < 0 ? null : row, fields: eExtra[e] };
      } else if (code === 4) {
        const extra = [];
        const record = row < 0 ? 0 : row + firstRow;
        const count = rCount[record];
        for (let j = width; j < count; j += 1) extra.push(fieldText(rFirst[record] + j));
        errors[e] = { code: 'long_row', line, row: row < 0 ? null : row, extra };
      } else {
        errors[e] = {
          code: code === 0 ? 'stray_cr' : code === 1 ? 'quote_junk' : 'unterminated_quote',
          line,
          row: row < 0 ? null : row,
        };
      }
    }

    let columns = null;
    if (header) {
      columns = new Array(headerCount);
      for (let j = 0; j < headerCount; j += 1) columns[j] = fieldText(headerFirst + j);
    }
    built = { columns, rows, errors };
    return built;
  };

  return {
    get columns() { return build().columns; },
    get rows() { return build().rows; },
    get errors() { return build().errors; },
  };
}

/** The answer of the last reading, as the JSON bytes the module wrote. */
export function bytes() {
  // The copy matters: the memory is written again by the next reading.
  return Buffer.from(new Uint8Array(memory.buffer, outStart, outLength));
}

/** The answer of the last reading, as a view of the bytes the module wrote. */
export function view() {
  return new Uint8Array(memory.buffer, outStart, outLength);
}

/** The answer of the last reading, as the JSON text the module wrote. */
export function text() {
  return Buffer.from(memory.buffer, outStart, outLength).toString('utf8');
}
