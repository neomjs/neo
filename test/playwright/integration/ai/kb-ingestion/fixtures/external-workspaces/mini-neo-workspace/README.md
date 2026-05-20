# mini-neo-workspace

Synthetic `npx neo app` style workspace for the KB ingestion integration suite.
It validates default-source inheritance plus tenant-owned additions without
requiring a real external repository checkout.

Extend this fixture by adding small source files under `src/` and the matching
`parsed-chunk-v1` rows to `expected-chunks.jsonl`.
