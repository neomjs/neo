# mini-cpp-workspace

Synthetic C++ workspace for the client-side parser path. Neo does not ship a C++
parser in this phase, so the fixture provides pre-parsed `parsed-chunk-v1` JSONL
records that simulate a tenant-side parser runner.

Extend this fixture by adding C++ sources under `src/` and matching rows in both
`parsed-chunks.jsonl` and `expected-chunks.jsonl`.
