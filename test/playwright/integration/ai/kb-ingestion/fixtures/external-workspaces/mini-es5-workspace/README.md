# mini-es5-workspace

Synthetic ES5-only workspace for custom parser registration coverage. The files
intentionally avoid modules/classes so the suite exercises a parser path that
differs from Neo's default source parser.

Extend this fixture by adding ES5 files under `src/` and appending the expected
parser output to `expected-chunks.jsonl`.
