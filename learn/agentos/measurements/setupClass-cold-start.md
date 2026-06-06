# setupClass Cold-Start Benchmark

> **Status (2026-06-06):** baseline committed for #10107.
> **Scope:** `Neo.setupClass()` class-registration cost only; no instance construction.

## Why this exists

`Neo.setupClass()` is the gatekeeper for every Neo class module. It merges inherited
config, applies overwrites, creates reactive getters/setters, registers ntypes,
applies mixins, maps classes into `globalThis.Neo`, and records class-hierarchy
metadata. That work happens once per class during application cold start.

The function is intentionally centralized because it protects mixed-runtime loading:
bundled production classes, dynamically loaded ESM classes, workers, and test entry
points all meet at the same `globalThis.Neo` registry. Readability refactors are
allowed only when they preserve that registry behavior and do not regress cold-start
time or allocation pressure.

## Script

```bash
npm run ai:benchmark-setup-class
```

Equivalent direct form:

```bash
node --expose-gc ai/scripts/benchmark/setupClass-cold-start.mjs \
    --classes 500 \
    --runs 5 \
    --warmup 1
```

Output: console summary plus JSON at
`.neo-ai-data/benchmarks/setupClass-cold-start-{timestamp}.json` unless `--output`
is supplied.

## Method

The script creates synthetic subclasses of `Neo.core.Base` with unique
`className` / `ntype` pairs, three reactive configs, and three prototype configs
per class. It then runs each generated class through `Neo.setupClass()` and records:

- elapsed wall time
- elapsed time per class
- heap delta
- heap delta per class

The benchmark intentionally avoids constructing instances. Instance lifecycle,
rendering, component configs, and worker remoting are separate performance surfaces.

## Baseline Measurements

Run captured on 2026-06-06T14:07:43.219Z.

| Field | Value |
| --- | --- |
| Node | `v25.9.0` |
| Platform | `darwin arm64` |
| GC exposed | `true` |
| Classes per run | `500` |
| Measured runs | `5` |
| Warmups discarded | `1` |
| Reactive configs per class | `3` |
| Prototype configs per class | `3` |

| Run | Elapsed ms | ms/class | Heap delta bytes | Heap/class bytes |
| --- | ---: | ---: | ---: | ---: |
| 1 | 9.19 | 0.018 | 1,343,048 | 2,686 |
| 2 | 9.14 | 0.018 | 1,384,976 | 2,770 |
| 3 | 10.12 | 0.020 | 1,283,240 | 2,566 |
| 4 | 10.07 | 0.020 | 1,271,768 | 2,544 |
| 5 | 10.64 | 0.021 | 1,484,288 | 2,969 |

| Summary | Value |
| --- | ---: |
| Median elapsed | 10.07 ms |
| p95 elapsed | 10.64 ms |
| Median ms/class | 0.020 |
| Median heap delta | 1,343,048 bytes |
| Median heap/class | 2,686 bytes |

## Refactor Gate

Any future `Neo.setupClass()` decomposition or helper extraction should run this
benchmark before and after the change, with the same class/config counts. A valid
refactor PR needs to document:

- before/after median elapsed time
- before/after heap delta
- whether the class namespace, ntype map, reactive-config, and hierarchy outputs
  remain byte-for-byte equivalent for the benchmark class shape
- why any regression is acceptable, if a regression is proposed

If the refactor changes benchmark shape, commit the new protocol first and explain
why the old baseline no longer covers the relevant hot path.

## Related

- #10107 - core.Base + Neo.mjs rationale and benchmark baseline.
- #10108 - separate `me = this` policy decision.
- `src/Neo.mjs` - `setupClass()` implementation and registry rationale.
- `src/core/Base.mjs` - shared class identity config rationale.
