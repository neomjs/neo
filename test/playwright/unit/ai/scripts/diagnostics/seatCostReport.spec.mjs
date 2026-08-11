import {test, expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';

import {
    ABLATION,
    LEDGER_READERS,
    WARM_WINDOWS,
    bucketByDay,
    buildSeat,
    classifyProviderFamily,
    parseKimiWire,
    parseOpencodeRows,
    renderReport
} from '../../../../../../ai/scripts/diagnostics/seatCostReport.mjs';
import {
    syntheticOpencodeRows,
    syntheticWireContent,
    writeSyntheticFixtures
} from './fixtures/seatCost/syntheticFixtures.mjs';

// Fixture provenance: DETERMINISTIC SYNTHETIC records from
// ./fixtures/seatCost/syntheticFixtures.mjs, generated against the published per-day drain
// table (parent-ticket forensics: iris 253/971/1,449 calls, phoebe 177/603/934, plus the
// 2026-08-08 ablation day). Per-call timestamps and token cells are generated — uniform
// splits and evenly-spaced synthetic times with deterministically placed over-window gaps —
// so the committed evidence proves every parser/aggregation/gap/ablation/CLI property at
// full scale WITHOUT carrying real per-call telemetry (cycle-3 review boundary: projected
// real-ledger fixtures must not be committed, even with content stripped). The live-ledger
// reproduction (digit-identical table on the operator machine, zero-consecutive-dupe census)
// remains as untracked corroboration on the source ticket; the dedupe arm below stays a
// synthetic pair.
const
    repoRoot    = process.cwd(),
    scriptPath  = path.join(repoRoot, 'ai/scripts/diagnostics/seatCostReport.mjs'),
    wireFixture = syntheticWireContent(),
    rowsFixture = syntheticOpencodeRows();

/**
 * The temp dir the CLI arms read through. Assigned in `beforeAll`, NOT at module scope.
 *
 * **The bug this shape fixes.** `fixtureDir` was a module-scope `mkdtempSync` with
 * `writeSyntheticFixtures()` called beside it at import time, while cleanup was a top-level
 * `test.afterAll`. Those are two different lifecycles: the fixtures were an IMPORT side effect and
 * their removal a TEST-lifecycle hook, so nothing tied the directory's existence to the window in
 * which the tests actually needed it. The two CLI arms then failed with
 * `ENOENT … /seatcost-fixtures-XXXXXX/kimi-wire.jsonl` — a spawned child looking for a directory
 * that had already been swept — and the same run leaked one uncleaned temp dir (52 had accumulated
 * on this machine).
 *
 * It reproduced in EVERY full-suite run and passed in isolation, which is exactly why it was read as
 * flake for weeks. It is not flake: it is deterministic, and it only needs enough sibling files in
 * the worker to surface. That distinction matters beyond this file — a suite cannot be safely
 * parallelized or path-scoped while failures like this are dismissed as noise.
 * @type {String|null}
 */
let fixtureDir = null;

test.describe('seatCostReport — harness ledger aggregation', () => {
    test.beforeAll(() => {
        fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seatcost-fixtures-'));
        writeSyntheticFixtures(fixtureDir)
    });

    test.afterAll(() => {
        if (fixtureDir) {
            fs.rmSync(fixtureDir, {recursive: true, force: true});
            fixtureDir = null
        }
    });

    test('kimi wire parsing dedupes consecutive double-written lines, keeps model identity', () => {
        const line = JSON.stringify({
            type : 'usage.record',
            time : 1785600000000,
            model: 'kimi-code/k3',
            usage: {inputOther: 10, inputCacheRead: 20, inputCacheCreation: 0, output: 5}
        });
        const records = parseKimiWire([
            '{"type":"prompt"}',
            line,
            line, // the consecutive exact double-write
            JSON.stringify({type: 'usage.record', time: 1785600001000, model: 'kimi-code/k3-256k', usage: {inputOther: 11, inputCacheRead: 21, inputCacheCreation: 0, output: 6}})
        ].join('\n'));

        expect(records).toHaveLength(2);
        expect(records[0]).toMatchObject({model: 'kimi-code/k3', family: 'kimi', freshInput: 10, cacheRead: 20, output: 5});
    });

    test('kimi wire dedupe keeps a same-time/same-tokens pair whose model cell disagrees', () => {
        // Emmy's falsifier: identical time + tokens with kimi-code/k3 then openai/gpt-5 must
        // return count=2 — a mid-session provider switch, not a double-write; erasing the
        // second record drops the gpt family's usage from the report.
        const usage   = {inputOther: 10, inputCacheRead: 20, inputCacheCreation: 0, output: 5};
        const records = parseKimiWire([
            JSON.stringify({type: 'usage.record', time: 1785600000000, model: 'kimi-code/k3', usage}),
            JSON.stringify({type: 'usage.record', time: 1785600000000, model: 'openai/gpt-5', usage})
        ].join('\n'));

        expect(records).toHaveLength(2);
        expect(records[0]).toMatchObject({model: 'kimi-code/k3', family: 'kimi'});
        expect(records[1]).toMatchObject({model: 'openai/gpt-5', family: 'gpt', freshInput: 10, cacheRead: 20, output: 5});
    });

    test('opencode parsing enforces the assistant-role boundary at the parser, not the query', () => {
        const records = parseOpencodeRows([
            // Emmy's falsifier: a token-bearing role:user row must NOT be counted
            {time_created: 1785600000000, data: JSON.stringify({role: 'user', time: {created: 1785600000000}, tokens: {input: 999, output: 9, cache: {read: 9, write: 0}}})},
            {time_created: 1785600001000, data: JSON.stringify({role: 'assistant', providerID: 'kimi-for-coding', modelID: 'k3', time: {created: 1785600001000}, tokens: {input: 100, output: 7, reasoning: 3, cache: {read: 500, write: 0}}})}
        ]);

        expect(records).toHaveLength(1);
        expect(records[0]).toMatchObject({freshInput: 100, cacheRead: 500, output: 10, providerID: 'kimi-for-coding', modelID: 'k3', family: 'kimi'});
    });

    test('provider-family classification maps model identity to the warm-window families', () => {
        expect(classifyProviderFamily({providerID: 'kimi-for-coding', modelID: 'k3'})).toBe('kimi');
        expect(classifyProviderFamily({model: 'kimi-code/k3-256k'})).toBe('kimi');
        expect(classifyProviderFamily({providerID: 'anthropic', modelID: 'claude-opus-4'})).toBe('claude');
        expect(classifyProviderFamily({providerID: 'openai', modelID: 'gpt-5'})).toBe('gpt');
        expect(classifyProviderFamily({providerID: 'unknown-future-provider', modelID: 'x'})).toBeNull();
    });

    test('the claude warm window encodes the 1h normal-regime branch, not the 5min overage branch', () => {
        // Ada's falsifier: her Claude Code seat's harness states 1h as the normal regime
        // (2026-08-09 first-party read); the 5min drop arrives only inside subscription
        // overage. Encoding the overage branch as the baseline INVERTS the safeguard — a
        // claude seat judged cold at 6 minutes would be sunset ~12x too early, PAYING the
        // fresh-boot cost to dodge a re-bill that was not coming.
        expect(WARM_WINDOWS.claude).toBe(60 * 60 * 1000);
    });

    test('the coverage line names every reader-less harness — a missing source as visible as a missing measurement', () => {
        // Ada's falsifier: gpt:null renders `unmeasured` (a visible hole), but a harness with
        // no ledger reader produces no rows at all — and the two absences looked identical.
        // The rendered line is asserted LITERALLY (never derived from the registry under
        // test): a coverage line that stopped naming a reader-less harness goes red here.
        const seat   = buildSeat('iris', 'kimi-code', parseKimiWire(wireFixture));
        const report = renderReport([seat]);

        expect(report).toContain('Ledger coverage: readers exist for kimi-code, opencode');
        expect(report).toContain('NO ledger reader (the harness produces no rows — a missing source, distinct from `unmeasured`): claude-code, claude-desktop, codex.');
    });

    test('the LEDGER_READERS roster is a conscious-update pin — a wrong value goes red', () => {
        // Ada's mutation falsifier: deriving the coverage expectation from the same object
        // the renderer iterates let a flipped `true` pass silently (confirmed 14/14 green
        // at the pre-pin head). The roster is pinned BY DESIGN (the identityRoots spec
        // precedent): wiring a reader without updating this pin fails here — never silently.
        // When the flip is a CLAUDE harness gaining a reader: `WARM_WINDOWS.claude` rests on
        // a single-harness read (Claude Code, 2026-08-09) — measure the new harness's own
        // window before it inherits the family value. That reading, not a pin edit, is the fix.
        expect(LEDGER_READERS).toEqual({
            'claude-code'   : false,
            'claude-desktop': false,
            'codex'         : false,
            'kimi-code'     : true,
            'opencode'      : true
        });
    });

    test('a GPT-backed opencode seat renders unmeasured through the exact CLI classification path', () => {
        // Emmy's falsifier: an OpenAI/GPT row through the OpenCode mapping must NOT inherit the
        // measured kimi warm window — provider identity survives ingestion and selects the family.
        const gptRows = [
            {time_created: 1785600000000, data: JSON.stringify({role: 'assistant', providerID: 'openai', modelID: 'gpt-5', time: {created: 1785600000000}, tokens: {input: 100, output: 5, cache: {read: 0, write: 0}}})},
            {time_created: 1785600000000 + 31 * 60 * 1000, data: JSON.stringify({role: 'assistant', providerID: 'openai', modelID: 'gpt-5', time: {created: 1785600000000 + 31 * 60 * 1000}, tokens: {input: 120, output: 6, cache: {read: 0, write: 0}}})}
        ];
        const seat   = buildSeat('euclid', 'opencode', parseOpencodeRows(gptRows));
        const report = renderReport([seat]);

        expect(seat.family).toBe('gpt');
        expect(WARM_WINDOWS[seat.family]).toBeNull();
        // 31 minutes apart: a numeric gap count would be exactly 1 under any measured window
        expect(report).toContain('| 2026-08-01 | euclid | 2 | 220 | 0 | 0 | 11 | 231 | 0.00% | unmeasured |');
    });

    test('the 07-31→08-02 drain table reproduces exactly from deterministic synthetic fixtures (AC-1)', () => {
        const iris   = buildSeat('iris',   'kimi-code', parseKimiWire(wireFixture));
        const phoebe = buildSeat('phoebe', 'opencode',  parseOpencodeRows(rowsFixture));

        expect(iris.family).toBe('kimi');
        expect(phoebe.family).toBe('kimi');

        // The published per-day table, cross-checked against the parent ticket's forensics
        // and asserted hardcoded here so a generator drift fails the suite:
        // iris totals 2,673 calls / 13.2M fresh / 1,170M cache; phoebe 1,714 / 20.8M / 715M.
        expect(iris.days.get('2026-07-31')).toMatchObject({calls: 253,  freshInput: 1285993, cacheRead: 82288640,  output: 234556, gapsOverWindow: 1});
        expect(iris.days.get('2026-08-01')).toMatchObject({calls: 971,  freshInput: 6774121, cacheRead: 401658112, output: 694075, gapsOverWindow: 6});
        expect(iris.days.get('2026-08-02')).toMatchObject({calls: 1449, freshInput: 5112472, cacheRead: 686494464, output: 736375, gapsOverWindow: 0});

        expect(phoebe.days.get('2026-07-31')).toMatchObject({calls: 177, freshInput: 985210,  cacheRead: 29168640,  output: 155561, gapsOverWindow: 3});
        expect(phoebe.days.get('2026-08-01')).toMatchObject({calls: 603, freshInput: 11602266, cacheRead: 332071424, output: 366113, gapsOverWindow: 9});
        expect(phoebe.days.get('2026-08-02')).toMatchObject({calls: 934, freshInput: 8224871,  cacheRead: 353372928, output: 487086, gapsOverWindow: 7});

        // The 2026-08-08 ablation day (post-reset, capped arm begins)
        expect(iris.days.get('2026-08-08')).toMatchObject({calls: 253, freshInput: 814684, cacheRead: 69824000, output: 236271, gapsOverWindow: 2});
        expect(phoebe.days.get('2026-08-08')).toMatchObject({calls: 206, freshInput: 2818972, cacheRead: 39663616, output: 170364, gapsOverWindow: 2});
    });

    test('the ablation flag renders the capped-vs-control needle comparison (AC-4)', () => {
        const seats = [
            buildSeat('iris',   'kimi-code', parseKimiWire(wireFixture)),
            buildSeat('phoebe', 'opencode',  parseOpencodeRows(rowsFixture))
        ];
        const report = renderReport(seats, {ablation: true});

        expect(report).toContain(`capped at ${ABLATION.capTokens.toLocaleString('en-US')}`);
        // 08-08 needle tokens: iris 814,684+236,271; phoebe 2,818,972+170,364
        expect(report).toContain('- 2026-08-08: iris needle tokens 1,050,955 · phoebe needle tokens 2,989,336');
    });

    test('CLI end-to-end over --fixtures prints the published drain table with the needle column (AC-1)', () => {
        const output = execFileSync('node', [scriptPath, '--fixtures', fixtureDir], {encoding: 'utf8'});

        expect(output).toContain('| 2026-07-31 | iris | 253 | 1,285,993 | 82,288,640 | 0 | 234,556 | 83,809,189 | 5.07% | 1 |');
        expect(output).toContain('| 2026-08-01 | phoebe | 603 | 11,602,266 | 332,071,424 | 0 | 366,113 | 344,039,803 | 39.89% | 9 |');
        expect(output).toContain('| 2026-08-02 | iris | 1,449 | 5,112,472 | 686,494,464 | 0 | 736,375 | 692,343,311 | 19.50% | 0 |');
        expect(output).toContain('| 2026-08-02 | phoebe | 934 | 8,224,871 | 353,372,928 | 0 | 487,086 | 362,084,885 | 29.04% | 7 |');
    });

    test('CLI --help exits 0 and documents --ablation and the public flags (AC-4)', () => {
        const output = execFileSync('node', [scriptPath, '--help'], {encoding: 'utf8'});

        expect(output).toContain('--ablation');
        expect(output).toContain('--fixtures');
        expect(output).toContain('--opencode-rows');
        expect(output).toContain('--kimi-root');
        expect(output).toContain('--from');
    });

    test('CLI --from/--to bounds the rendered window', () => {
        const output = execFileSync('node', [scriptPath, '--fixtures', fixtureDir, '--from', '2026-08-01', '--to', '2026-08-01'], {encoding: 'utf8'});

        expect(output).toContain('2026-08-01');
        expect(output).not.toContain('2026-07-31');
        expect(output).not.toContain('2026-08-02');
    });
});
