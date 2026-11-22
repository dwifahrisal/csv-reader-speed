import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { openSync, readFileSync, writeSync, mkdirSync, closeSync } = require('node:fs');

// Prioritize speed over comfort: disable V8 incremental marking.
const { setFlagsFromString } = require('node:v8');
setFlagsFromString('--no-incremental-marking --no-concurrent-recompilation --liftoff-only --no-concurrent-marking --no-concurrent-sweeping --no-parallel-compaction');

const inputDir = process.env.MAKEFUN_INPUT_DIR || '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

const solve = require('./solve.js');

// The file is read as it is: no string of it is made and no JSON.parse of it is
// done. The module reads the cases out of the bytes itself.
const fileBytes = readFileSync(`${inputDir}/cases.json`);

const { n, filePtr } = solve.scan(fileBytes);

mkdirSync(outputDir, { recursive: true });
const fd = openSync(`${outputDir}/answers.json`, 'w');
writeSync(fd, '[');
let first = true;
let at = 0;
for (;;) {
  // The next case is found in the bytes, and its text is read into the memory of
  // the module.
  const next = solve.nextCase(filePtr, n, at);
  if (next < 0) break;
  at = next;

  const textPtr = solve.caseTextPtr();
  const textLen = solve.caseTextLen();
  const header = solve.caseHeader();
  // The room for the results of the reading is made for the number of fields
  // the text really has.
  const fields = solve.fieldsOf(textPtr, textLen);
  const arenaWords = solve.roomFor(fields);

  const ptr = solve.answer(textPtr, textLen, header, arenaWords, fields);
  if (!first) writeSync(fd, ',');
  // The bytes of the answer go straight to the file: they are never made into a
  // string of JavaScript, and they are not copied either.
  writeSync(fd, new Uint8Array(solve.memory.buffer, ptr, solve.outLength()));
  first = false;
}
writeSync(fd, ']');
closeSync(fd);
