import { openSync, readFileSync, writeSync } from 'node:fs';

const { run, view } = await import('./solve.js');

const inputDir = process.env.MAKEFUN_INPUT_DIR || '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

const cases = JSON.parse(readFileSync(`${inputDir}/cases.json`, 'utf8'));

const fd = openSync(`${outputDir}/answers.json`, 'w');
writeSync(fd, '[');
for (let i = 0; i < cases.length; i += 1) {
  if (i > 0) writeSync(fd, ',');
  const answer = run(cases[i].input);
  if (answer === undefined) throw new Error('a case has no answer');
  writeSync(fd, view());
}
writeSync(fd, ']');
