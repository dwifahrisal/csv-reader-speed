// The program the harness runs: it reads every case from /input/cases.json, answers each one with
// run() from solve.js, and writes /output/answers.json: a JSON array of the answers, one per case and
// in the order of the cases.
//
// The answers are written as the text that the WebAssembly parser put together while it read the
// cases, so the text is the answer and the value run() returns is the same answer.
import { readFileSync, writeFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { setFlagsFromString } from 'node:v8';

setFlagsFromString('--no-incremental-marking');

const { run, bytes } = await import('./solve.js');

const inputDir = process.env.MAKEFUN_INPUT_DIR || '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

const cases = JSON.parse(readFileSync(`${inputDir}/cases.json`, 'utf8'));
const parts = [Buffer.from('[')];
for (const c of cases) {
  run(c.input);
  parts.push(bytes());
  parts.push(Buffer.from(','));
}
parts[parts.length - 1] = Buffer.from(']');
const body = Buffer.concat(parts);
writeFileSync(`${outputDir}/answers.json`, body);
