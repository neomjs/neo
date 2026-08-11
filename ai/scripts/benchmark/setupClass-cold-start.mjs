/**
 * @plane in-plane
 */
import {Command} from 'commander';
import {mkdir, writeFile} from 'fs/promises';
import path from 'path';
import {fileURLToPath} from 'url';
import Neo from '../../../src/Neo.mjs';
import '../../../src/core/_export.mjs';
import {median, percentile} from './helpers/stats.mjs';

/**
 * @module ai/scripts/benchmark/setupClass-cold-start
 * @summary Cold-start benchmark for `Neo.setupClass()` class-registration cost.
 *
 * `Neo.setupClass()` is the mixed-runtime gatekeeper for every Neo class module:
 * it merges config along the prototype chain, applies overwrites, creates reactive
 * getters/setters, registers ntypes, applies mixins, maps classes into
 * `globalThis.Neo`, and records hierarchy metadata. That makes it a cold-start hot
 * path. Any future readability refactor must prove it does not regress boot-time
 * cost or heap pressure.
 *
 * This benchmark creates synthetic subclasses of `Neo.core.Base` with unique
 * className / ntype pairs, runs them through `Neo.setupClass()`, and records
 * elapsed time plus heap deltas. It intentionally avoids constructing instances:
 * the measured surface is class registration, not component lifecycle work.
 *
 * @see src/Neo.mjs - `setupClass()` gatekeeper
 * @see src/core/Base.mjs - base class config inherited by every synthetic class
 * @see learn/agentos/measurements/setupClass-cold-start.md - baseline protocol
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

/**
 * Parse a positive integer CLI option.
 *
 * @param {string|number} value Incoming CLI value
 * @param {number} fallback Fallback when parsing fails
 * @returns {number}
 */
function parsePositiveInt(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Parse a non-negative integer CLI option.
 *
 * @param {string|number} value Incoming CLI value
 * @param {number} fallback Fallback when parsing fails
 * @returns {number}
 */
function parseNonNegativeInt(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/**
 * Round numeric output so small sample summaries do not expose floating-point noise.
 *
 * @param {number} value
 * @param {number} [decimals=3]
 * @returns {number}
 */
function roundMetric(value, decimals = 3) {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}

/**
 * Build one synthetic class with configurable reactive and non-reactive config load.
 *
 * @param {string} className Unique className
 * @param {string} ntype Unique ntype
 * @param {number} reactiveConfigs Number of trailing-underscore configs
 * @param {number} prototypeConfigs Number of prototype configs
 * @returns {Function} The synthetic class (a `Neo.core.Base` subclass constructor).
 */
function createSyntheticClass(className, ntype, reactiveConfigs, prototypeConfigs) {
    class SyntheticSetupClassBenchmark extends Neo.core.Base {}

    const config = {className, ntype};

    for (let i = 0; i < reactiveConfigs; i++) {
        config[`reactive${i}_`] = i;
    }

    for (let i = 0; i < prototypeConfigs; i++) {
        config[`prototype${i}`] = {
            index: i,
            value: `static-${i}`
        };
    }

    SyntheticSetupClassBenchmark.config = config;

    return SyntheticSetupClassBenchmark;
}

/**
 * Run one benchmark pass.
 *
 * @param {Object} options
 * @param {number} options.classCount Number of synthetic classes to register
 * @param {number} options.reactiveConfigs Reactive configs per class
 * @param {number} options.prototypeConfigs Prototype configs per class
 * @param {string} options.runId Unique namespace suffix
 * @returns {{classCount: number, reactiveConfigs: number, prototypeConfigs: number, elapsedMs: number, msPerClass: number, heapDeltaBytes: number, heapDeltaPerClassBytes: number}}
 */
function runBenchmark({classCount, reactiveConfigs, prototypeConfigs, runId}) {
    if (globalThis.gc) {
        globalThis.gc();
    }

    const beforeHeap = process.memoryUsage().heapUsed;
    const t0 = performance.now();

    for (let i = 0; i < classCount; i++) {
        const
            className = `Neo.benchmark.SetupClass.${runId}.Class${i}`,
            ntype     = `setup-class-${runId}-${i}`;

        Neo.setupClass(createSyntheticClass(className, ntype, reactiveConfigs, prototypeConfigs));
    }

    const elapsedMs = performance.now() - t0;

    if (globalThis.gc) {
        globalThis.gc();
    }

    const heapDeltaBytes = process.memoryUsage().heapUsed - beforeHeap;

    return {
        classCount,
        reactiveConfigs,
        prototypeConfigs,
        elapsedMs              : Math.round(elapsedMs * 100) / 100,
        msPerClass             : Math.round((elapsedMs / classCount) * 1000) / 1000,
        heapDeltaBytes,
        heapDeltaPerClassBytes : Math.round(heapDeltaBytes / classCount)
    };
}

/**
 * Summarize benchmark runs.
 *
 * @param {Array} runs
 * @returns {Object}
 */
function summarizeRuns(runs) {
    const
        elapsed = runs.map(run => run.elapsedMs),
        perClass = runs.map(run => run.msPerClass),
        heapDelta = runs.map(run => run.heapDeltaBytes),
        heapPerClass = runs.map(run => run.heapDeltaPerClassBytes);

    return {
        n                          : runs.length,
        elapsedMs_median           : roundMetric(median(elapsed), 2),
        elapsedMs_p95              : runs.length >= 5 ? roundMetric(percentile(elapsed, 0.95), 2) : undefined,
        msPerClass_median          : roundMetric(median(perClass), 3),
        heapDeltaBytes_median         : roundMetric(median(heapDelta), 0),
        heapDeltaPerClassBytes_median : roundMetric(median(heapPerClass), 0)
    };
}

async function main() {
    const program = new Command();
    program
        .name('setupClass-cold-start')
        .description('Benchmark Neo.setupClass cold-start class-registration cost')
        .option('-c, --classes <n>', 'Synthetic classes per measured run', '500')
        .option('-r, --runs <n>', 'Measured runs', '5')
        .option('-w, --warmup <n>', 'Warmup runs (discarded)', '1')
        .option('--reactive-configs <n>', 'Reactive trailing-underscore configs per class', '3')
        .option('--prototype-configs <n>', 'Non-reactive prototype configs per class', '3')
        .option('-o, --output <path>', 'Output JSON path (default: .neo-ai-data/benchmarks/setupClass-cold-start-{ts}.json)');

    program.parse();

    const opts = program.opts();
    const config = {
        classCount      : parsePositiveInt(opts.classes, 500),
        runs            : parsePositiveInt(opts.runs, 5),
        warmup          : parseNonNegativeInt(opts.warmup, 1),
        reactiveConfigs : parseNonNegativeInt(opts.reactiveConfigs, 3),
        prototypeConfigs: parseNonNegativeInt(opts.prototypeConfigs, 3)
    };

    const timestamp = new Date().toISOString();
    const namespaceSeed = timestamp.replace(/[^0-9]/g, '');

    console.log('[setupClass-cold-start] Benchmarking Neo.setupClass()');
    console.log(`[setupClass-cold-start] Classes/run: ${config.classCount}`);
    console.log(`[setupClass-cold-start] Runs: ${config.runs} (+${config.warmup} warmup discarded)`);
    console.log(`[setupClass-cold-start] Configs/class: reactive=${config.reactiveConfigs}, prototype=${config.prototypeConfigs}`);
    console.log(`[setupClass-cold-start] GC exposed: ${Boolean(globalThis.gc)}`);
    console.log('');

    for (let i = 0; i < config.warmup; i++) {
        process.stdout.write(`  warmup ${i + 1}/${config.warmup}...`);
        const warmup = runBenchmark({
            ...config,
            runId: `${namespaceSeed}Warmup${i}`
        });
        console.log(` ${warmup.elapsedMs}ms (${warmup.msPerClass}ms/class)`);
    }

    const runs = [];
    for (let i = 0; i < config.runs; i++) {
        process.stdout.write(`  run ${i + 1}/${config.runs}...`);
        const run = runBenchmark({
            ...config,
            runId: `${namespaceSeed}Run${i}`
        });
        runs.push(run);
        console.log(
            ` ${run.elapsedMs}ms (${run.msPerClass}ms/class), ` +
            `heapDelta=${run.heapDeltaBytes} bytes`
        );
    }

    const results = {
        meta: {
            timestamp,
            nodeVersion: process.version,
            platform   : process.platform,
            arch       : process.arch,
            gcExposed  : Boolean(globalThis.gc),
            command    : process.argv.join(' ')
        },
        config,
        runs,
        summary: summarizeRuns(runs)
    };

    console.log('\n=== Summary ===');
    console.log(`elapsedMs median: ${results.summary.elapsedMs_median}`);
    if (results.summary.elapsedMs_p95 !== undefined) {
        console.log(`elapsedMs p95   : ${results.summary.elapsedMs_p95}`);
    }
    console.log(`ms/class median : ${results.summary.msPerClass_median}`);
    console.log(`heap/class median bytes: ${results.summary.heapDeltaPerClassBytes_median}`);

    const outputPath = opts.output || path.join(
        projectRoot,
        '.neo-ai-data/benchmarks',
        `setupClass-cold-start-${timestamp.replace(/[:.]/g, '-')}.json`
    );
    await mkdir(path.dirname(outputPath), {recursive: true});
    await writeFile(outputPath, JSON.stringify(results, null, 2), 'utf8');
    console.log(`\nWritten: ${outputPath}`);
}

main().catch(error => {
    console.error('[setupClass-cold-start] FATAL:', error);
    process.exit(1);
});
