import fs              from 'node:fs';
import os              from 'node:os';
import path            from 'node:path';
import process         from 'node:process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

/**
 * Pre-Flight (structural fast-path): authoring `ai/scripts/diagnostics/seatCostReport.mjs`
 * matches sibling pattern of `ai/scripts/diagnostics/gemini-incident-cost-ledger.mjs` in
 * `ai/scripts/diagnostics/` (local Agent OS cost-forensics CLI: argument parsing, pure exported
 * functions, main-guard execution, usage-on-error); sibling-file-lift applies; no novel
 * directory choice.
 *
 * @summary Per-seat session-cost reporter for the swarm's harness seats.
 *
 * Aggregates the two harness-local token ledgers into one per-seat, per-day table:
 *   - kimi-code: `~/.kimi-code/sessions/<wd>/<session>/agents/main/wire.jsonl` `usage.record`
 *     lines (`inputOther` / `inputCacheRead` / `inputCacheCreation` / `output`, plus `model`
 *     for provider-family classification). Consecutive records that are identical on every
 *     consumed field (including `time` AND `model`) are wire double-writes and are deduped;
 *     a same-time/same-tokens pair whose model disagrees is two real records (a mid-session
 *     provider switch) and both are kept. The `agents/main`
 *     scope is contractual: subagent wires are excluded —
 *     empirically 1 usage record across 32 wires on the reference machine (2026-08-08 census).
 *   - opencode: `~/.local/share/opencode/opencode.db` `message.data` JSON (`tokens.input` /
 *     `tokens.output` / `tokens.reasoning` / `tokens.cache.read` / `tokens.cache.write`),
 *     **assistant messages only, enforced at the parser boundary** (the sqlite `like` pre-filter
 *     is a cheap scan aid, not the contract). better-sqlite3 is required lazily, only when a
 *     live db is read (fixture and JSON paths never load it — the base install tier has no
 *     native compile).
 *
 * Harnesses without a ledger reader produce NO rows and are named on the report's coverage
 * line ({@link LEDGER_READERS}) — a missing source must be as visible as a missing measurement.
 *
 * Provider-family classification is preserved through ingestion: each record carries its
 * model identity (kimi `model`; opencode `providerID`/`modelID`) and the seat's warm window
 * resolves from the classified family — a GPT-backed opencode seat renders `unmeasured`,
 * never an invented number.
 *
 * Origin: the 2026-08-08 flatrate-drain forensics (the swarm's two K3 seats drained a weekly
 * provider quota in ~3 days; the harness was exonerated, session-context accumulation was not).
 * Core aggregation lifted from @neo-kimi-iris's `burn-analysis.mjs` / `cache-ttl*.mjs` seat
 * scripts, hardened into a fixture-validated CLI. This script is deliberately graphless: a
 * diagnostics CLI does not import AiConfig (the boundary mirrors `ai/daemons/wake/`).
 *
 * The "est. needle" column is the fresh-input+output share of an empirically estimated weekly
 * quota of ~30M billable tokens ({@link NEEDLE_WEEK_TOKENS}) — derived from two observed
 * drain-week walls (2026-07-24→26 and 07-31→08-02) and the operator's 97→100% single-turn
 * observation. It is an estimate; the provider dashboard remains the calibration authority.
 */

const DAY_MS             = 86_400_000;
const NEEDLE_WEEK_TOKENS = 30_000_000;

/**
 * Warm windows keyed by provider FAMILY (never by harness — a harness can host any provider).
 * Anthropic has three documented branches — default TTL 5min, extended 1h at 2× write cost, and
 * a drop to 5min inside subscription overage — and this table operationalizes the **1h branch as
 * the claude baseline**: first-party harness read from @neo-opus-ada's Claude Code seat
 * (2026-08-09), where 1h is the normal regime and the 5min drop arrives only with overage.
 * Encoding the 5min overage branch instead would INVERT the safeguard: kimi's failure mode is
 * idling past the cliff into a full re-bill, while a claude seat judged cold at 6 minutes gets
 * sunset ~12× too early and PAYS the 60–150k fresh-boot cost to dodge a re-bill that was not
 * coming. Per-harness qualifier: the read is first-party for that one Claude Code configuration;
 * Claude Desktop stays unmeasured until its own reading lands — and no claude ledger reader
 * exists yet ({@link LEDGER_READERS}), so no claude seat renders until one does, at which moment
 * the per-harness reading is required. GPT: unmeasured — the column renders `unmeasured`, never
 * an invented number. Kimi (both harnesses, K3): measured TTL-cliff onset — hit ratio holds ≥92%
 * through ~20min gaps and degrades to ~0% past 1h (2026-08-08 cross-harness measurement).
 * @type {Object<String,Number|null>}
 */
export const WARM_WINDOWS = {
    'kimi'  : 20 * 60 * 1000,
    'claude': 60 * 60 * 1000,
    'gpt'   : null
};

/**
 * Ledger-reader coverage keyed by HARNESS (a reader is the code that extracts a seat's token
 * ledger; a family's warm window is a separate axis). `false` means no reader exists — such a
 * harness produces NO rows in the report, and a missing source must be as visible as a missing
 * measurement: a `null` warm window renders `unmeasured`, but a reader-less harness renders
 * nothing at all, and the two look identical to whoever reads the output unless the coverage
 * line names it ({@link renderReport}).
 * @type {Object<String,Boolean>}
 */
export const LEDGER_READERS = {
    'claude-code'   : false,
    'claude-desktop': false,
    'codex'         : false,
    'kimi-code'     : true,
    'opencode'      : true
};

/**
 * The capped/uncapped ablation arms (operator-routed experiment, 2026-08-08): iris runs a
 * 650K `max_context_size` cap from this date; phoebe is the uncapped control.
 * @type {Object}
 */
export const ABLATION = {cappedSeat: 'iris', controlSeat: 'phoebe', cappedFrom: '2026-08-08', capTokens: 650_000};

const dayOf = time => new Date(time).toISOString().slice(0, 10);

const blankBucket = () => ({calls: 0, freshInput: 0, cacheRead: 0, cacheWrite: 0, output: 0});

/**
 * Classifies one ledger record's provider family from its model identity. Unknown identity
 * returns `null` — the honest signal that renders `unmeasured` downstream.
 *
 * @param {Object}   [identity]
 * @param {String}   [identity.model]      kimi-code wire `model` field (e.g. `kimi-code/k3`)
 * @param {String}   [identity.providerID] opencode message `providerID` (e.g. `kimi-for-coding`)
 * @param {String}   [identity.modelID]    opencode message `modelID` (e.g. `k3`)
 * @returns {'kimi'|'claude'|'gpt'|null}
 */
export function classifyProviderFamily({model, providerID, modelID} = {}) {
    const haystack = `${model || ''} ${providerID || ''} ${modelID || ''}`.toLowerCase();

    if (/kimi|moonshot|\bk3\b/.test(haystack))   return 'kimi';
    if (/claude|anthropic/.test(haystack))       return 'claude';
    if (/gpt|openai|o[134]-/.test(haystack))     return 'gpt';

    return null
}

/**
 * Resolves a seat's provider family as the modal family across its records. A seat runs one
 * provider in practice; on a tie or empty input the first-seen family wins, and records with
 * no model identity abstain. `null` when no record carries classifiable identity.
 *
 * @param {Array<{family:(String|null)}>} records
 * @returns {'kimi'|'claude'|'gpt'|null}
 */
export function resolveSeatFamily(records) {
    const counts = new Map();

    for (const r of records) {
        if (!r.family) continue;
        counts.set(r.family, (counts.get(r.family) || 0) + 1);
    }

    let winner = null, best = 0;

    for (const [family, count] of counts) {
        if (count > best) { winner = family; best = count; }
    }

    return winner
}

/**
 * Parses kimi-code `wire.jsonl` content into usage records, deduping consecutive
 * double-written lines (identical on every consumed field including `time` AND `model` —
 * a model-disagreeing pair is a provider switch, not a double-write). Each record keeps
 * its `model` identity for provider-family classification.
 *
 * @param {String} content
 * @returns {Array<{time:Number, freshInput:Number, cacheRead:Number, cacheWrite:Number, output:Number, model:String, family:(String|null)}>}
 */
export function parseKimiWire(content) {
    const records = [];
    let   prev    = null;

    for (const line of content.split('\n')) {
        if (!line.includes('"type":"usage.record"')) continue;

        try {
            const rec = JSON.parse(line);
            const u   = rec.usage || {};
            const row = {
                time      : rec.time,
                freshInput: u.inputOther         || 0,
                cacheRead : u.inputCacheRead     || 0,
                cacheWrite: u.inputCacheCreation || 0,
                output    : u.output             || 0,
                model     : rec.model            || '',
                family    : classifyProviderFamily({model: rec.model})
            };

            const isDupe = prev && prev.time === row.time
                && prev.freshInput === row.freshInput && prev.cacheRead === row.cacheRead
                && prev.cacheWrite  === row.cacheWrite && prev.output    === row.output
                && prev.model      === row.model;

            if (!isDupe) records.push(row);
            prev = row;
        } catch {}
    }

    return records
}

/**
 * Parses opencode `message` rows (`{time_created, data}`) into usage records.
 * **Assistant messages only — enforced here, not delegated to the sqlite pre-filter**:
 * a token-bearing `role: 'user'` row passed to this parser is rejected, and each kept
 * record preserves `providerID`/`modelID` for provider-family classification.
 *
 * @param {Array<{time_created:Number, data:String}>} rows
 * @returns {Array<{time:Number, freshInput:Number, cacheRead:Number, cacheWrite:Number, output:Number, providerID:String, modelID:String, family:(String|null)}>}
 */
export function parseOpencodeRows(rows) {
    const records = [];

    for (const row of rows) {
        try {
            const m = JSON.parse(row.data);

            if (m.role !== 'assistant') continue;

            const t = m.tokens;

            if (!t) continue;

            records.push({
                time      : m.time?.created ?? row.time_created,
                freshInput: t.input            || 0,
                cacheRead : t.cache?.read      || 0,
                cacheWrite: t.cache?.write     || 0,
                output    : (t.output || 0) + (t.reasoning || 0),
                providerID: m.providerID       || '',
                modelID   : m.modelID          || '',
                family    : classifyProviderFamily({providerID: m.providerID, modelID: m.modelID})
            });
        } catch {}
    }

    return records
}

/**
 * Reads an opencode sqlite store. better-sqlite3 is loaded lazily so the module stays
 * importable where the native dependency is absent (base install tier). The `like`
 * pre-filter only narrows the scan; the assistant-role contract is enforced by
 * {@link parseOpencodeRows} at the parsing boundary.
 *
 * @param {String} dbPath
 * @returns {Array<{time_created:Number, data:String}>}
 */
export function readOpencodeDb(dbPath) {
    let Database;

    try {
        Database = createRequire(import.meta.url)('better-sqlite3');
    } catch {
        throw new Error(`reading ${dbPath} needs better-sqlite3 (brain-tier install); use --fixtures for a native-free run`);
    }

    const db = new Database(dbPath, {readonly: true, fileMustExist: true});

    try {
        return db.prepare(`select time_created, data from message where data like '%"role":"assistant"%'`).all();
    } finally {
        db.close();
    }
}

/**
 * Buckets records per UTC day and computes inter-call gap incidence against the seat's
 * warm window: each idle period longer than the window contributes exactly one over-window
 * gap (the call that pays cold rates after it).
 *
 * @param {Array} records
 * @param {Number|null} warmWindowMs null → gaps render `unmeasured`
 * @returns {Map<String, Object>} date → bucket
 */
export function bucketByDay(records, warmWindowMs) {
    const byDay = new Map();

    for (const r of records) {
        const day = dayOf(r.time);
        const b   = byDay.get(day) || {...blankBucket(), gapsOverWindow: 0};

        b.calls++;
        b.freshInput += r.freshInput;
        b.cacheRead  += r.cacheRead;
        b.cacheWrite += r.cacheWrite;
        b.output     += r.output;

        byDay.set(day, b);
    }

    if (warmWindowMs != null) {
        const times = records.map(r => r.time).sort((a, b) => a - b);

        for (let i = 1; i < times.length; i++) {
            const gap = times[i] - times[i - 1];

            if (gap > warmWindowMs && gap < 30 * DAY_MS) { // ignore corrupt timestamps only
                const day = dayOf(times[i]);
                const b   = byDay.get(day);

                if (b) b.gapsOverWindow++;
            }
        }
    }

    return byDay
}

const fmt = n => n.toLocaleString('en-US');

/**
 * Renders the per-seat per-day report as markdown.
 *
 * @param {Array<{seat:String, harness:String, family:(String|null), days:Map<String,Object>}>} seats
 * @param {Object} [options]
 * @param {Boolean} [options.ablation=false] add the capped-vs-control needle comparison
 * @returns {String}
 */
export function renderReport(seats, {ablation = false} = {}) {
    const lines = [
        '| date | seat | calls | fresh input | cache read | cache write | output | raw total | est. needle* | gaps>warm |',
        '|------|------|-------|-------------|------------|-------------|--------|-----------|--------------|-----------|'
    ];

    const days = [...new Set(seats.flatMap(s => [...s.days.keys()]))].sort();

    for (const day of days) {
        for (const seat of seats) {
            const b = seat.days.get(day);

            if (!b) continue;

            const raw    = b.freshInput + b.cacheRead + b.cacheWrite + b.output;
            const needle = ((b.freshInput + b.output) / NEEDLE_WEEK_TOKENS * 100).toFixed(2) + '%';
            const warm   = WARM_WINDOWS[seat.family] == null ? 'unmeasured' : String(b.gapsOverWindow);

            lines.push(`| ${day} | ${seat.seat} | ${fmt(b.calls)} | ${fmt(b.freshInput)} | ${fmt(b.cacheRead)} | ${fmt(b.cacheWrite)} | ${fmt(b.output)} | ${fmt(raw)} | ${needle} | ${warm} |`);
        }
    }

    lines.push('', `*fresh input + output as a share of an estimated ~${fmt(NEEDLE_WEEK_TOKENS)} billable-token week (empirical; the provider dashboard is the calibration authority).`);

    const covered  = Object.keys(LEDGER_READERS).filter(harness =>  LEDGER_READERS[harness]),
          noReader = Object.keys(LEDGER_READERS).filter(harness => !LEDGER_READERS[harness]);

    lines.push('', `Ledger coverage: readers exist for ${covered.join(', ')}; NO ledger reader (the harness produces no rows — a missing source, distinct from \`unmeasured\`): ${noReader.length > 0 ? noReader.join(', ') : 'none'}.`);

    if (ablation) {
        const ablationDays = days.filter(d => d >= ABLATION.cappedFrom && seats.some(s => s.days.get(d)));

        if (ablationDays.length > 0) {
            lines.push('', `## Ablation — ${ABLATION.cappedSeat} capped at ${fmt(ABLATION.capTokens)} context from ${ABLATION.cappedFrom} vs ${ABLATION.controlSeat} (uncapped control)`, '');

            for (const day of ablationDays) {
                const capped    = seats.find(s => s.seat === ABLATION.cappedSeat)?.days.get(day);
                const control   = seats.find(s => s.seat === ABLATION.controlSeat)?.days.get(day);
                const fmtNeedle = b => b ? fmt(b.freshInput + b.output) : '—';

                lines.push(`- ${day}: ${ABLATION.cappedSeat} needle tokens ${fmtNeedle(capped)} · ${ABLATION.controlSeat} needle tokens ${fmtNeedle(control)}`);
            }
        }
    }

    return `${lines.join('\n')}\n`
}

const USAGE = `Usage: npm run ai:seat-cost-report -- [flags]

Per-seat per-day session-cost table from the two harness-local token ledgers
(kimi-code wire.jsonl usage records; opencode message token rows, assistant-only).

Ledger flags (defaults read the live ledgers on this machine):
  --kimi-root <dir>      kimi-code sessions root (default ~/.kimi-code/sessions);
                         collects agents/main/wire.jsonl per session (contractual source set)
  --opencode-db <path>   opencode sqlite store (default ~/.local/share/opencode/opencode.db);
                         needs the brain-tier better-sqlite3
  --opencode-rows <json> read opencode rows from a JSON file instead of the live db
  --fixtures <dir>       read fixture files (kimi-wire.jsonl + opencode-rows.json), e.g.
                         the spec suite's deterministic synthetic fixtures

Report flags:
  --from YYYY-MM-DD      include only days on/after this date
  --to   YYYY-MM-DD      include only days on/before this date
  --ablation             append the capped-seat vs uncapped-control needle comparison
                         (iris capped at 650K context from 2026-08-08; phoebe is the control)
  --json                 emit the aggregated buckets as JSON instead of the markdown table
  --help, -h             print this text and exit 0
`;

function parseArgs(argv) {
    const options = {ablation: false, from: null, help: false, json: false, to: null};

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];

        if      (arg === '--ablation')      options.ablation = true;
        else if (arg === '--json')          options.json = true;
        else if (arg === '--help' || arg === '-h') options.help = true;
        else if (arg === '--from')          options.from = argv[++i];
        else if (arg === '--to')            options.to = argv[++i];
        else if (arg === '--kimi-root')     options.kimiRoot = argv[++i];
        else if (arg === '--opencode-db')   options.opencodeDb = argv[++i];
        else if (arg === '--opencode-rows') options.opencodeRows = argv[++i];
        else if (arg === '--fixtures')      options.fixtures = argv[++i];
        else throw new Error(`unknown argument: ${arg}`);
    }

    return options
}

/**
 * Collects kimi-code usage records from the contractual source set: each session's
 * `agents/main/wire.jsonl`. Subagent wires are excluded by contract (the source ticket names this
 * source set); the 2026-08-08 census found exactly 1 usage record across all 32 wires
 * outside agents/main on the reference machine.
 */
function collectKimiRecords(root) {
    const records = [];

    for (const wd of fs.readdirSync(root)) {
        const wdDir = path.join(root, wd);

        if (!fs.statSync(wdDir).isDirectory()) continue;

        for (const session of fs.readdirSync(wdDir)) {
            const wire = path.join(wdDir, session, 'agents/main/wire.jsonl');

            if (fs.existsSync(wire)) {
                records.push(...parseKimiWire(fs.readFileSync(wire, 'utf8')));
            }
        }
    }

    return records
}

/**
 * Builds one seat entry: resolves the provider family from the records themselves, so a
 * harness hosting an unmeasured provider family renders `unmeasured` rather than silently
 * inheriting a measured family's warm window. Exported so specs traverse the exact CLI
 * classification path.
 */
export function buildSeat(seatName, harness, records) {
    const family = resolveSeatFamily(records);

    return {seat: seatName, harness, family, days: bucketByDay(records, WARM_WINDOWS[family] ?? null)}
}

function main() {
    try {
        const options = parseArgs(process.argv.slice(2));

        if (options.help) {
            process.stdout.write(USAGE);
            return;
        }

        const seats = [];

        if (options.fixtures) {
            const wireContent = fs.readFileSync(path.join(options.fixtures, 'kimi-wire.jsonl'), 'utf8');
            const rows        = JSON.parse(fs.readFileSync(path.join(options.fixtures, 'opencode-rows.json'), 'utf8'));

            seats.push(
                buildSeat('iris',   'kimi-code', parseKimiWire(wireContent)),
                buildSeat('phoebe', 'opencode',  parseOpencodeRows(rows))
            );
        } else {
            const kimiRoot = options.kimiRoot || path.join(os.homedir(), '.kimi-code/sessions');
            const ocRows   = options.opencodeRows
                ? JSON.parse(fs.readFileSync(options.opencodeRows, 'utf8'))
                : readOpencodeDb(options.opencodeDb || path.join(os.homedir(), '.local/share/opencode/opencode.db'));

            seats.push(
                buildSeat('iris',   'kimi-code', collectKimiRecords(kimiRoot)),
                buildSeat('phoebe', 'opencode',  parseOpencodeRows(ocRows))
            );
        }

        for (const seat of seats) {
            for (const day of [...seat.days.keys()]) {
                if (options.from && day < options.from) seat.days.delete(day);
                if (options.to && day > options.to) seat.days.delete(day);
            }
        }

        if (options.json) {
            console.log(JSON.stringify(Object.fromEntries(seats.map(s => [
                s.seat, {family: s.family, harness: s.harness, days: Object.fromEntries(s.days)}
            ])), null, 2));
        } else {
            process.stdout.write(renderReport(seats, {ablation: options.ablation}));
        }
    } catch (error) {
        console.error(`Error: ${error.message}`);
        console.error('Usage: npm run ai:seat-cost-report -- [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--ablation] [--json] [--help]');
        console.error('  defaults read the live harness ledgers; --fixtures <dir> reads fixture files (kimi-wire.jsonl + opencode-rows.json)');
        process.exit(1);
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    main();
}
