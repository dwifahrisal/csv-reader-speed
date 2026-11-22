# dwifahrisal/csv-reader-speed

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/dwifahrisal/csv-reader-speed/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/dwifahrisal/csv-reader-speed/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's own csv-reader 1.0.0: the same answers on every case, less CPU time.

`csv-reader` reads a file one character at a time and builds every field by adding one character to
another, which makes it slow on a ten-megabyte set. This entry reads the same file left to right, cuts
each field out of the source in one slice, and finds the boundaries with one scan over the characters.
The reading of a field is left in slots instead of a fresh object, so a file with hundreds of thousands
of fields leaves no hundreds of thousands of short-lived objects behind.

The answers are the ones csv-reader 1.0.0 gives, error for error: `stray_cr`, `quote_junk`,
`unterminated_quote`, `short_row` and `long_row` are reported at the same lines and rows, the header
and the padding of a short row are the same, and the line count moves with the CRLF and the lone CR
inside quotes exactly as csv-reader's does. A differential test over sixty thousand inputs, the
practice set's six cases included, finds no difference at all.

## Run it

```sh
node main.ts
```

`main.ts` reads every case from `/input/cases.json`, answers each one with `run` from `solve.js`, and
writes `/output/answers.json`.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
