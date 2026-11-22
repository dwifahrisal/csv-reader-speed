// A faster drop-in for csv-reader 1.0.0: the same {columns, rows, errors} for the same input,
// read once, left to right, by the same broken-row policy. The field text is cut out of the
// source in one slice, and the boundaries are found by one scan over the characters.
//
// The reading of one field is left in slots rather than in a fresh object, so a file with hundreds
// of thousands of fields does not leave hundreds of thousands of short-lived objects behind.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

const QUOTE = 34;
const COMMA_C = 44;
const CR = 13;
const LF = 10;

// The reading of one field, in slots.
let fValue = '';
let fEnded = END;
let fAdded = 0;
let fLines = 0;
let fPos = 0;

/** The reading of one CSV input, {text, header}: {columns, rows, errors} (the header). */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const len = text.length;
  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;
  let recordLine = 1;
  let recordRow = null;

  while (true) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === LF) {
        pos += 1;
        line += 1;
      } else if (c === CR && text.charCodeAt(pos + 1) === LF) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    const fields = [];
    let quoted;
    do {
      if (text.charCodeAt(pos) === QUOTE) {
        quoted = true;
        const open = pos;
        const openLine = line;
        pos += 1;
        let start = pos;
        let value = '';
        let closed = false;
        while (pos < len) {
          const q = text.indexOf('"', pos);
          if (q < 0) {
            // No closing quote left: the field runs to the end of the text.
            value += text.slice(start, pos);
            pos = len;
            break;
          }
          if (text.charCodeAt(q + 1) === QUOTE) {
            value += text.slice(start, q) + '"';
            pos = q + 2;
            start = pos;
            continue;
          }
          value += text.slice(start, q);
          pos = q + 1;
          closed = true;
          break;
        }
        if (closed && (value.indexOf('\r') >= 0 || value.indexOf('\n') >= 0)) {
          // Inside quotes a line break is one line: CRLF, LF and a lone CR all become LF.
          const breaks = value.match(/\r\n|\r|\n/g);
          value = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
          line += breaks === null ? 0 : breaks.length;
        }
        if (!closed) {
          // The quote never closes: it is a literal character, and the text after it is read again as unquoted.
          pos = open + 1;
          line = openLine;
          errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
          readUnquoted(text, len, pos, errors, recordLine, recordRow, '"');
        } else {
          fValue = value;
          fEnded = END;
          fAdded = 0;
          fLines = 0;
          fPos = pos;
          if (pos < len) {
            const c = text.charCodeAt(pos);
            if (c === COMMA_C) {
              pos += 1;
              fEnded = COMMA;
              fPos = pos;
            } else if (c === LF) {
              pos += 1;
              line += 1;
              fEnded = LINE_BREAK;
              fPos = pos;
            } else if (c === CR && text.charCodeAt(pos + 1) === LF) {
              pos += 2;
              line += 1;
              fEnded = LINE_BREAK;
              fPos = pos;
            } else {
              // What follows the closing quote is appended as it stands, up to the next comma or line break.
              readUnquoted(text, len, pos, errors, recordLine, recordRow, value);
              if (fAdded > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
            }
          }
        }
      } else {
        quoted = false;
        readUnquoted(text, len, pos, errors, recordLine, recordRow, '');
      }
      pos = fPos;
      line += fLines;
      fields.push(fValue);
    } while (fEnded === COMMA);

    // A line that held only stray CRs is left with no characters: no record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}

/**
 * Reads unquoted characters up to the next comma or line break: a CR not followed by LF is dropped (stray_cr).
 * The text is cut out in one slice; a CR inside it costs one error and is left out.
 */
function readUnquoted(text, len, start, errors, recordLine, recordRow, value) {
  let pos = start;
  let added = 0;
  let lines = 0;
  let piece = value;
  while (pos < len) {
    const c = text.charCodeAt(pos);
    if (c === COMMA_C) {
      fValue = piece + text.slice(start, pos);
      fEnded = COMMA;
      fAdded = added;
      fLines = lines;
      fPos = pos + 1;
      return;
    }
    if (c === LF) {
      fValue = piece + text.slice(start, pos);
      fEnded = LINE_BREAK;
      fAdded = added;
      fLines = lines + 1;
      fPos = pos + 1;
      return;
    }
    if (c === CR) {
      if (text.charCodeAt(pos + 1) === LF) {
        fValue = piece + text.slice(start, pos);
        fEnded = LINE_BREAK;
        fAdded = added;
        fLines = lines + 1;
        fPos = pos + 2;
        return;
      }
      errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      // The CR is dropped: the text around it joins up, and it is not part of the text appended.
      piece += text.slice(start, pos);
      start = pos + 1;
      pos = start;
      continue;
    }
    // Ordinary characters: one scan for the next boundary.
    let stop = pos;
    while (stop < len) {
      const d = text.charCodeAt(stop);
      if (d === COMMA_C || d === LF || d === CR) break;
      stop += 1;
    }
    piece += text.slice(pos, stop);
    added += stop - pos;
    start = stop;
    pos = stop;
  }
  fValue = piece + text.slice(start, len);
  fEnded = END;
  fAdded = added;
  fLines = lines;
  fPos = len;
}
