/**
 * @plane host
 */
import {Command}          from 'commander';
import {execFile}         from 'node:child_process';
import {mkdir, writeFile} from 'node:fs/promises';
import os                 from 'node:os';
import path               from 'node:path';
import {promisify}        from 'node:util';
import Neo                from '../../../src/Neo.mjs';
import '../../../src/core/_export.mjs';
import aiConfig                           from '../../mcp/server/memory-core/config.mjs';
import {aggregateWindow, buildMetricBags} from './helpers/servingCostCore.mjs';

const run = promisify(execFile);

/**
 * @module ai/scripts/benchmark/serving-cost-meter
 * @summary The steady-state serving-cost meter: samples the RESIDENT model-serving processes
 * (the always-on inference load) over a configurable window and emits duty-cycle / memory /
 * cpu figures as business-schema-valid `METRIC` bags plus a provenance-stamped JSON report.
 *
 * **Why this exists**: every serving-cost conversation ran on gut-feel figures until the
 * `[UNMEASURED]` rule landed — a cost claim is invalid until a NAMED measurement exists. This
 * meter is that measurement's instrument: what does one institution-day actually consume on
 * named reference hardware, split honestly into idle vs active phases?
 *
 * **What this meter actually measures**:
 * - the processes OWNING the configured endpoint ports (the model server via the
 *   `openAiCompatible`/`ollama` host leaves, the vector store via the chroma port leaf),
 *   re-resolved every tick (a mid-window server restart is sampled, not lost);
 * - scheduler-reported cpu (`ps pcpu`) + resident memory (`ps rss`) per tick;
 * - phase split via the documented cpu-threshold heuristic — the threshold travels into every
 *   figure's `confoundDisclaimer` (see the pure core's honesty contract).
 *
 * **What this meter does NOT measure** (declared, not hidden):
 * - request-level token throughput (no provider `/metrics` dependency in v1 — a server that
 *   exposes one can feed a later leaf);
 * - per-model attribution when chat + embedding share one server process (the default
 *   deployment points both at ONE endpoint — the meter then reports ONE honest role for that
 *   port rather than fabricating a per-model split);
 * - anything about pricing — figures are public-safe method + raw measurements; derivations
 *   live in the private substrate only.
 *
 * The N-hour institution-day runs on named reference hardware and the hosting-bill console
 * read are OPERATOR-executed (this CLI is their instrument, not their substitute).
 *
 * Run: node ai/scripts/benchmark/serving-cost-meter.mjs --hardware <slug> --window 8h
 * @see ai/scripts/benchmark/helpers/servingCostCore.mjs — the pure, unit-pinned transforms
 * @see ai/scripts/benchmark/keep-alive-probe.mjs — the sibling probe pattern
 * @see learn/agentos/measurements/serving-cost.md — the results doc (numbers only with provenance)
 */

/**
 * Parses a `--window` duration ('45m', '8h', '90s') into ms — fail-closed on anything else.
 * @param {String} value
 * @returns {Number}
 */
export function parseWindow(value) {
    const match = /^(\d+)([smh])$/.exec(String(value).trim());

    if (!match) {
        throw new Error(`--window must look like 90s / 45m / 8h, got "${value}"`)
    }

    const ms = Number(match[1]) * {s: 1000, m: 60000, h: 3600000}[match[2]];

    if (ms <= 0) {
        // a zero window would exit 0 with an empty "measurement" — success theater, refused
        throw new Error(`--window must be a positive duration, got "${value}"`)
    }

    return ms
}

/**
 * @summary Separates the requested measurement window from the observed process lifecycle.
 * An early stop is missing coverage inside the original window, never a shorter requested
 * window: aggregation keeps the requested bounds while the report records the actual stop.
 * Pure and clock-free so both early-stop and natural-completion semantics stay unit-pinned.
 * @param {Number} startedAt Epoch-ms sampling start.
 * @param {Number} windowMs Requested window duration in ms.
 * @param {Number} observedEndMs Epoch-ms at which the sampling loop actually stopped.
 * @returns {{interrupted: Boolean, observedEndMs: Number, windowBounds: {endMs: Number, startMs: Number}}}
 */
export function resolveWindowLifecycle(startedAt, windowMs, observedEndMs) {
    const requestedEndMs = startedAt + windowMs;

    if (![startedAt, windowMs, observedEndMs, requestedEndMs].every(Number.isFinite) || windowMs <= 0 || observedEndMs < startedAt) {
        throw new Error('resolveWindowLifecycle: finite start/end values and a positive window are required')
    }

    return {
        interrupted : observedEndMs < requestedEndMs,
        observedEndMs,
        windowBounds: {endMs: requestedEndMs, startMs: startedAt}
    }
}

/**
 * Extracts the port from a configured endpoint URL leaf.
 * @param {String} hostUrl e.g. 'http://127.0.0.1:11434'
 * @returns {Number|null}
 */
export function portFromHostUrl(hostUrl) {
    try {
        const url = new URL(hostUrl);
        return url.port ? Number(url.port) : (url.protocol === 'https:' ? 443 : 80)
    } catch (e) {
        return null
    }
}

/**
 * Whether a configured endpoint URL points at THIS machine — the only case where sampling
 * local PIDs measures the endpoint's true owner. A remote endpoint is skipped WITH a declared
 * reason at startup, never silently sampled into nonsense.
 * @param {String} hostUrl
 * @returns {Boolean}
 */
export function isLocalEndpoint(hostUrl) {
    try {
        return ['127.0.0.1', 'localhost', '::1', '0.0.0.0'].includes(new URL(hostUrl).hostname)
    } catch (e) {
        return false
    }
}

/**
 * Resolves the role→port map from the config SSOT — merged honestly when roles share a port,
 * and LOCAL endpoints only (a remote host's load cannot be measured from this machine's
 * process table; such endpoints surface in `skipped` with the reason, never as silent holes).
 * @param {Object} config The AiConfig data proxy.
 * @returns {{rolePorts: Object[], skipped: Object[]}} unique-port `{role, port}` entries + declared skips.
 */
export function resolveRolePorts(config) {
    const candidates = [
        {hostUrl: config.openAiCompatible.host,                          role: 'model-server-openai-compatible'},
        {hostUrl: config.ollama.host,                                    role: 'model-server-ollama'},
        {hostUrl: `http://127.0.0.1:${config.engines.chroma.portProd}`,  role: 'vector-store'}
    ];

    // one entry per PORT and one ROLE per entry — two configured endpoints on one port
    // collapse to the first role (same process, one honest stream), while distinct ports
    // keep distinct roles so their sample streams never interleave
    const byPort  = new Map(),
          skipped = [];

    for (const {hostUrl, role} of candidates) {
        if (!isLocalEndpoint(hostUrl)) {
            skipped.push({reason: `endpoint is not local (${hostUrl}) — its process table is not ours to sample`, role});
            continue
        }

        const port = portFromHostUrl(hostUrl);

        Number.isFinite(port) && port > 0 && !byPort.has(port) && byPort.set(port, {port, role})
    }

    return {rolePorts: [...byPort.values()], skipped}
}

/**
 * Samples the processes LISTENING on one port: summed rss bytes + summed pcpu.
 *
 * Listener-only on purpose: a bare port query matches every process with a socket on the
 * port — INCLUDING connected clients — so a busy client (a summarizer mid-batch) would be
 * misattributed as server load. `-sTCP:LISTEN` scopes ownership to the actual server.
 *
 * Missing listener (server down / restarting) returns null — recorded as a coverage gap by
 * omission, never as a fabricated zero-load sample.
 * @param {Number} port
 * @returns {Promise<{cpuPercent: Number, rssBytes: Number}|null>}
 */
export async function samplePort(port) {
    let pids;

    try {
        const {stdout} = await run('lsof', ['-ti', `:${port}`, '-sTCP:LISTEN']);
        pids = stdout.trim().split('\n').filter(Boolean)
    } catch (e) {
        return null // no listener right now
    }

    if (!pids.length) {
        return null
    }

    try {
        const {stdout} = await run('ps', ['-o', 'rss=,pcpu=', '-p', pids.join(',')]);
        let   rssKb    = 0, cpu = 0;

        for (const line of stdout.trim().split('\n')) {
            const [rss, pcpu] = line.trim().split(/\s+/).map(Number);
            Number.isFinite(rss)  && (rssKb += rss);
            Number.isFinite(pcpu) && (cpu   += pcpu)
        }

        return {cpuPercent: cpu, rssBytes: rssKb * 1024}
    } catch (e) {
        return null // pids raced away between lsof and ps — a gap, not a zero
    }
}

async function main() {
    const program = new Command()
        .requiredOption('--hardware <slug>', 'named reference hardware slug (provenance, e.g. mac-studio-m2ultra-192gb)')
        .option('--window <duration>',   'sampling window (90s / 45m / 8h)', '8h')
        .option('--interval <seconds>',  'sampling tick in seconds', '5')
        .option('--threshold <pcpu>',    'active-phase cpu threshold (percent)', '5')
        .option('--out <file>',          'report path (default: ~/.neo-ai-data/serving-cost/report-<start>.json)')
        .parse(process.argv);

    const options    = program.opts(),
          windowMs   = parseWindow(options.window),
          intervalMs = Number(options.interval) * 1000,
          threshold  = Number(options.threshold),
          config     = aiConfig.data;

    // startup validation fails loud BEFORE the first sample — a NaN tick or threshold would
    // otherwise surface hours later as an empty or garbage window
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
        throw new Error(`serving-cost-meter: --interval must be a positive number of seconds, got "${options.interval}"`)
    }

    if (!Number.isFinite(threshold) || threshold <= 0) {
        throw new Error(`serving-cost-meter: --threshold must be a positive pcpu percentage, got "${options.threshold}"`)
    }

    const {rolePorts, skipped} = resolveRolePorts(config);

    skipped.forEach(({reason, role}) => console.log(`[serving-cost-meter] skipping ${role}: ${reason}`));

    if (!rolePorts.length) {
        throw new Error('serving-cost-meter: no LOCAL endpoint ports resolvable from the config SSOT — nothing to measure on this machine')
    }

    const startedAt   = Date.now(),
          periodStart = new Date(startedAt).toISOString().slice(0, 10),
          samples     = new Map(rolePorts.map(({role}) => [role, []])),
          rerun       = `node ai/scripts/benchmark/serving-cost-meter.mjs --hardware ${options.hardware} ` +
                        `--window ${options.window} --interval ${options.interval} --threshold ${options.threshold}`;

    console.log(`[serving-cost-meter] window=${options.window} interval=${options.interval}s threshold=${threshold}% roles=${rolePorts.map(r => `${r.role}:${r.port}`).join(' ')}`);
    console.log('[serving-cost-meter] Ctrl-C ends the window early — the report is written either way.');

    let stopped = false;
    process.on('SIGINT', () => { stopped = true });

    while (!stopped && Date.now() - startedAt < windowMs) {
        const tickAt = Date.now();

        for (const {port, role} of rolePorts) {
            const sample = await samplePort(port);
            sample && samples.get(role).push({atMs: tickAt, cpuPercent: sample.cpuPercent, role, rssBytes: sample.rssBytes})
        }

        const elapsed = Date.now() - tickAt;
        elapsed < intervalMs && await new Promise(resolve => setTimeout(resolve, intervalMs - elapsed))
    }

    // REQUESTED and OBSERVED time stay distinct: Ctrl-C creates trailing unavailability inside
    // the named window, never a shorter nominal window carrying the original rolling identity
    const {interrupted, observedEndMs, windowBounds} = resolveWindowLifecycle(startedAt, windowMs, Date.now());

    const report = {
        hardware  : options.hardware,
        host      : {arch: os.arch(), cpuModel: os.cpus()[0]?.model ?? 'unknown', platform: os.platform(), totalMemBytes: os.totalmem()},
        interrupted,
        intervalMs,
        metricBags: [],
        observedEndMs,
        periodStart,
        roles     : {},
        skipped, // declared measurement holes (remote endpoints) live in the artifact, not just stdout
        threshold,
        windowBounds,
        windowMs
    };

    for (const role of samples.keys()) {
        const roleSamples = samples.get(role);

        if (roleSamples.length < 2) {
            report.roles[role] = {error: `insufficient samples (${roleSamples.length}) — the endpoint owner was absent for (nearly) the whole window`};
            continue
        }

        const aggregate = aggregateWindow(roleSamples, {activeCpuThreshold: threshold, expectedIntervalMs: intervalMs, windowBounds});

        report.roles[role] = aggregate;
        report.metricBags.push(...buildMetricBags(aggregate, {
            activeCpuThreshold: threshold,
            hardwareId        : options.hardware,
            periodStart,
            rerunCommand      : rerun,
            role,
            windowSemantics   : `rolling-window-${options.window}`
        }))
    }

    const outFile = options.out ?? path.join(os.homedir(), '.neo-ai-data', 'serving-cost', `report-${periodStart}-${startedAt}.json`);

    await mkdir(path.dirname(outFile), {recursive: true});
    await writeFile(outFile, JSON.stringify(report, null, 2));

    console.log(`[serving-cost-meter] report written: ${outFile}`);
    console.log(`[serving-cost-meter] ${report.metricBags.length} schema-valid metric bags emitted (ingestion is the tenant path's job).`)
}

// commander parses only when executed directly — importing the pure helpers above never runs a sample.
// The test is hoisted to a const rather than opening the statement: CodeQL's extractor cannot parse a
// statement-initial `import.meta` (it is ambiguous with an import declaration until the `.`), and a
// parse failure drops the WHOLE file from analysis — 312 unscanned lines reported as one warning on a
// settings page, while the PR check still says `pass`. Node parses either form; only one gets scanned.
const isDirectRun = import.meta.url === `file://${process.argv[1]}`;

if (isDirectRun) {
    main().catch(error => {
        console.error(`[serving-cost-meter] ${error.message}`);
        process.exit(1)
    });
}
