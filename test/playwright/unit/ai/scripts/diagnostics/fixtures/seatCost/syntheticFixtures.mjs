import fs   from 'node:fs';
import path from 'node:path';

/**
 * Pre-Flight (structural fast-path): authoring `fixtures/seatCost/syntheticFixtures.mjs`
 * replaces the retired projected-real-ledger fixture data inside the same fixture directory;
 * consumers (`seatCostReport.spec.mjs`) already exist; sibling-file-lift applies; no novel
 * directory choice.
 *
 * @summary Deterministic synthetic fixture generator for the seatCostReport specs.
 *
 * Emits both harness-ledger fixtures as PURELY SYNTHETIC records whose per-day aggregates
 * reproduce the published 2026-07-31→08-02 drain table plus the 2026-08-08 ablation day
 * EXACTLY (calls, fresh input, cache read/write, output, over-window gap incidence —
 * 2,926 wire records + 1,920 opencode rows). Per-call timestamps and token cells are
 * generated, never real: uniform token splits (floor + remainder) and evenly-spaced
 * synthetic times with deterministically placed over-window gaps. The committed evidence
 * therefore proves every parser/aggregation/gap/ablation/CLI property at full scale
 * without carrying real per-call telemetry (cycle-3 review boundary: real ledger
 * projections must not be committed even with content stripped). The live-ledger
 * reproduction stays as untracked corroboration on the source ticket.
 *
 * Gap arithmetic: each seat's records run contiguously across midnight (~2s), so
 * cross-day pairs never count; each `gaps` entry places exactly that many intra-day
 * 30-minute idle jumps; the 08-02→08-08 timeline void (~5 days, inside the 30-day
 * corruption guard) contributes exactly one automatic gap per seat on 08-08, so the
 * 08-08 targets below carry ONE intra-day gap to land the published count of 2.
 */

const DAY_MS              = 86_400_000;
const DAY_START_OFFSET_MS = 1_000;           // records begin 1s after UTC midnight
const GAP_EXTRA_MS        = 30 * 60 * 1000;  // one deterministic over-window idle jump (kimi warm window is 20min)

/**
 * Per-day aggregate targets: the published drain table (parent-ticket forensics) plus the
 * ablation day. `gaps` counts ONLY the intra-day placements — see the module docblock for
 * the automatic 08-08 void gap. The spec asserts these numbers hardcoded, independently of
 * this table, so a generator drift fails the suite.
 */
const WIRE_DAYS = [
    {day: '2026-07-31', calls: 253,  freshInput: 1285993, cacheRead: 82288640,  output: 234556, gaps: 1, model: 'kimi-code/k3'},
    {day: '2026-08-01', calls: 971,  freshInput: 6774121, cacheRead: 401658112, output: 694075, gaps: 6, model: 'kimi-code/k3'},
    {day: '2026-08-02', calls: 1449, freshInput: 5112472, cacheRead: 686494464, output: 736375, gaps: 0, model: 'kimi-code/k3'},
    {day: '2026-08-08', calls: 253,  freshInput: 814684,  cacheRead: 69824000,  output: 236271, gaps: 1, model: 'kimi-code/k3-256k'}
];

const ROW_DAYS = [
    {day: '2026-07-31', calls: 177, freshInput: 985210,  cacheRead: 29168640,  output: 155561, gaps: 3},
    {day: '2026-08-01', calls: 603, freshInput: 11602266, cacheRead: 332071424, output: 366113, gaps: 9},
    {day: '2026-08-02', calls: 934, freshInput: 8224871,  cacheRead: 353372928, output: 487086, gaps: 7},
    {day: '2026-08-08', calls: 206, freshInput: 2818972,  cacheRead: 39663616,  output: 170364, gaps: 1}
];

const dayStart = day => Date.parse(`${day}T00:00:00.000Z`);

/**
 * Splits `total` into `n` non-negative integers summing EXACTLY to `total`: uniform floor
 * shares plus one extra unit on the first `total % n` cells. Deliberately uniform — the
 * fixture's synthetic nature stays visible in the data itself.
 */
const splitExact = (total, n) => {
    const base = Math.floor(total / n), extra = total % n;

    return Array.from({length: n}, (_, i) => base + (i < extra ? 1 : 0))
};

/**
 * Deterministic per-call timestamps for one day: `calls` records starting 1s after UTC
 * midnight, evenly spaced below the 20-minute warm window, with `gaps` over-window
 * 30-minute jumps placed at evenly spread positions. The day's span stays inside the UTC
 * day, so cross-midnight intervals to the next generated day are ~2s and never count.
 *
 * @param {Object} target one WIRE_DAYS / ROW_DAYS entry
 * @returns {Number[]}
 */
function dayTimes({day, calls, gaps}) {
    const start    = dayStart(day) + DAY_START_OFFSET_MS;
    const baseStep = Math.floor((DAY_MS - 2 * DAY_START_OFFSET_MS - gaps * GAP_EXTRA_MS) / (calls - 1));
    const gapAfter = new Set();

    for (let k = 1; k <= gaps; k++) {
        gapAfter.add(Math.round(k * (calls - 1) / (gaps + 1)));
    }

    const times = [];
    let   t     = start;

    for (let i = 0; i < calls; i++) {
        times.push(t);
        t += baseStep + (gapAfter.has(i) ? GAP_EXTRA_MS : 0);
    }

    return times
}

/**
 * The synthetic kimi-code `wire.jsonl` content: one `usage.record` line per call, cache
 * write always 0 (matching the published table's zero cache-write column). 08-08 records
 * carry the capped arm's `kimi-code/k3-256k` model marker; both model strings classify
 * into the kimi family.
 *
 * @returns {String}
 */
export function syntheticWireContent() {
    const lines = [];

    for (const target of WIRE_DAYS) {
        const times  = dayTimes(target);
        const fresh  = splitExact(target.freshInput, target.calls);
        const cached = splitExact(target.cacheRead,  target.calls);
        const output = splitExact(target.output,     target.calls);

        for (let i = 0; i < target.calls; i++) {
            lines.push(JSON.stringify({
                type : 'usage.record',
                time : times[i],
                model: target.model,
                usage: {inputOther: fresh[i], inputCacheRead: cached[i], inputCacheCreation: 0, output: output[i]}
            }));
        }
    }

    return `${lines.join('\n')}\n`
}

/**
 * The synthetic opencode `message` rows (`{time_created, data}` shape, assistant role,
 * kimi-for-coding/k3 identity, reasoning 0 — the reasoning fold is covered by the
 * hand-authored parser unit in the spec).
 *
 * @returns {Array<{time_created:Number, data:String}>}
 */
export function syntheticOpencodeRows() {
    const rows = [];

    for (const target of ROW_DAYS) {
        const times  = dayTimes(target);
        const fresh  = splitExact(target.freshInput, target.calls);
        const cached = splitExact(target.cacheRead,  target.calls);
        const output = splitExact(target.output,     target.calls);

        for (let i = 0; i < target.calls; i++) {
            rows.push({
                time_created: times[i],
                data        : JSON.stringify({
                    role      : 'assistant',
                    providerID: 'kimi-for-coding',
                    modelID   : 'k3',
                    time      : {created: times[i]},
                    tokens    : {input: fresh[i], output: output[i], reasoning: 0, cache: {read: cached[i], write: 0}}
                })
            });
        }
    }

    return rows
}

/**
 * Writes both fixtures (`kimi-wire.jsonl` + `opencode-rows.json`) into `dir`, the file
 * shape the CLI's `--fixtures` flag consumes. Callers own the directory (the spec uses a
 * fresh `os.tmpdir()` child and removes it in `afterAll`).
 *
 * @param {String} dir existing target directory
 */
export function writeSyntheticFixtures(dir) {
    fs.writeFileSync(path.join(dir, 'kimi-wire.jsonl'),   syntheticWireContent());
    fs.writeFileSync(path.join(dir, 'opencode-rows.json'), JSON.stringify(syntheticOpencodeRows()));
}
