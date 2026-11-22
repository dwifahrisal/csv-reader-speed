// The program the harness runs: it reads every case from /input/cases.json, answers each one with
// run() from solve.js, and writes /output/answers.json: a JSON array of the answers, one per case and
// in the same order.
//
// The answer of a case is written out as it is read, so the answers never have to be held in memory
// all at once: the module writes the JSON text of each answer, and it goes straight to the file.
import { openSync, readFileSync, writeSync } from 'node:fs';

const { run, view } = await import('./solve.js');

const inputDir = process.env.MAKEFUN_INPUT_DIR || '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

const cases = JSON.parse(readFileSync(`${inputDir}/cases.json`, 'utf8'));

const fd = openSync(`${outputDir}/answers.json`, 'w');
writeSync(fd, '[');
let first = true;
for (const c of cases) {
  const answer = run(c.input);
  if (answer === undefined) throw new Error('a case has no answer');
  if (!first) writeSync(fd, ',');
  first = false;
  writeSync(fd, view());
}
writeSync(fd, ']');
