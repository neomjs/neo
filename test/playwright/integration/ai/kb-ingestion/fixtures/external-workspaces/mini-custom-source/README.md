# mini-custom-source

Synthetic non-standard source fixture for custom Source registration. The mock
`ProtoSource.mjs` demonstrates the shape a tenant-provided source adapter would
take without registering executable tenant code at runtime.

Extend this fixture by adding `.proto` files under `schemas/` and matching rows
to `expected-chunks.jsonl`.
