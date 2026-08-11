/**
 * @plane in-plane
 */
import {Command} from 'commander';
import {mkdir, writeFile} from 'fs/promises';
import path from 'path';
import {fileURLToPath} from 'url';
import Neo from '../../../src/Neo.mjs';
import '../../../src/core/_export.mjs';
import aiConfig from '../../mcp/server/memory-core/config.mjs';
import {buildGraphProvider, resolveGraphModelProvider} from '../../services/graph/providerDispatch.mjs';
import {summarize} from './helpers/stats.mjs';

/**
 * @module ai/scripts/benchmark/gemma4-rem-benchmark
 * @summary REM-pipeline gemma4 cost benchmark — TTFT / TTLT / tps per session-size bucket.
 *
 * **Why this exists**:
 * > "we need benchmarking for gemma4 => creating context windows is the most
 * > expensive task. if there is any way to REUSE created context windows => big win."
 *
 * Each `SemanticGraphExtractor.executeTriVectorExtraction` invocation today opens
 * a fresh gemma4 context for the LLM call. With session payloads up to 256K tokens
 * and 10 sessions per REM cycle, the cumulative context-creation cost may dominate
 * the actual inference cost. This script empirically measures the cost asymmetry.
 *
 * **What it measures**, per call:
 * - **TTFT** (Time To First Token, ms) — proxy for context-creation + prompt-prefill cost.
 *   Cold-cache calls are dominated by this; warm-cache (KV-reuse) calls should drop it.
 * - **TTLT** (Time To Last Token, ms) — end-to-end wall clock.
 * - **tps** (tokens/sec during generation) — `tokens / (TTLT - TTFT)`. Pure inference rate.
 * - **promptTokens** — input size (approximate; `length / 4` heuristic, NOT tokenizer-exact).
 * - **outputTokens** — counted yielded chunks.
 *
 * **What it does NOT measure** (yet):
 * - Per-bucket statistical variance (only mean + median). p95 added when iterations ≥ 5.
 * - Concurrent-call backpressure. Single-call serial only; cycle-level concurrency is Sub 3.
 * - Memory pressure. Cumulative gemma VRAM footprint not instrumented.
 *
 * **Provider routing**: uses `buildGraphProvider({modelProvider})` exactly as
 * `SemanticGraphExtractor` does. Whatever operator's active config selects
 * (`ollama` native OR `openAiCompatible` proxy) is what gets benchmarked. The
 * point is to characterize the production path, not a synthetic one.
 *
 * @see ai/services/graph/providerDispatch.mjs — provider factory
 * @see ai/services/graph/SemanticGraphExtractor.mjs:96 — production call pattern
 * @see ai/scripts/benchmark/keep-alive-probe.mjs — companion KV-cache reuse V-B-A
 * @see learn/agentos/measurements/gemma4-rem-benchmark.md — measurement protocol + baseline table
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

/**
 * Session-size buckets in *prompt characters* (approximate token = char / 4).
 * Map to the four cost zones the REM pipeline empirically encounters:
 * - small: short summarization session (one focused thread)
 * - medium: typical multi-turn coding session
 * - large: dense long-running architecture session
 * - max: at the operator's `safeProcessingLimitTokens` band (200K tokens ≈ 800K chars)
 *
 * Sized via the same `length / 4` heuristic the production code uses; not tokenizer-exact.
 * @type {Record<string, number>}
 */
const SIZE_BUCKETS = {
    small : 5_000 * 4,
    medium: 30_000 * 4,
    large : 100_000 * 4,
    max   : 200_000 * 4
};

/**
 * Build a synthetic prompt whose character count targets `charCount`.
 *
 * Uses repeated lorem-ipsum-style content so the prompt has natural language
 * shape (provider tokenizers won't take pathological shortcuts on a single
 * repeated character). NOT designed to mimic real REM session content — the
 * point is measurable cost-per-byte, not measurable extraction quality.
 *
 * @param {number} charCount Target character length
 * @returns {string}
 */
function buildSyntheticPrompt(charCount) {
    const filler = 'The agent reviewed the implementation, traced the call path through ' +
        'SemanticGraphExtractor and TopologyInferenceEngine, captured a V-B-A delta on ' +
        'the production substrate, banked the lesson, and proposed a substrate evolution. ';
    const reps = Math.ceil(charCount / filler.length);
    return filler.repeat(reps).slice(0, charCount);
}

/**
 * Issue one streamed LLM call and capture cost telemetry.
 *
 * @param {{stream: Function}} provider Provider instance from `buildGraphProvider`
 * @param {string} prompt Synthetic input payload
 * @param {Object} [options={}] Pass-through provider options (e.g. `keep_alive`)
 * @returns {Promise<{ttftMs: number, ttltMs: number, promptChars: number, outputChars: number, outputChunks: number, tps: number}>}
 */
async function measureOneCall(provider, prompt, options = {}) {
    const messages = [
        {role: 'system', content: 'You are a concise assistant. Respond in under 100 words.'},
        {role: 'user', content: prompt}
    ];

    const t0 = performance.now();
    let t1 = null;
    let outputChars = 0;
    let outputChunks = 0;

    for await (const chunk of provider.stream(messages, options)) {
        if (t1 === null) t1 = performance.now();
        outputChars += chunk.length;
        outputChunks++;
    }

    const t2 = performance.now();
    const ttftMs = t1 === null ? (t2 - t0) : (t1 - t0);
    const ttltMs = t2 - t0;
    // tps: pure generation rate (excluding context-prefill window)
    const genWindowMs = Math.max(ttltMs - ttftMs, 1);
    const approxOutputTokens = outputChars / 4;
    const tps = (approxOutputTokens / genWindowMs) * 1000;

    return {
        ttftMs       : Math.round(ttftMs),
        ttltMs       : Math.round(ttltMs),
        promptChars  : prompt.length,
        outputChars,
        outputChunks,
        tps          : Math.round(tps * 100) / 100
    };
}

async function main() {
    const program = new Command();
    program
        .name('gemma4-rem-benchmark')
        .description('Benchmark REM-pipeline gemma4 cost per session-size bucket')
        .option('-s, --size <bucket>', 'Bucket: small | medium | large | max | all', 'all')
        .option('-i, --iterations <n>', 'Iterations per bucket', '3')
        .option('-w, --warmup <n>', 'Warmup calls per bucket (discarded)', '1')
        .option('-o, --output <path>', 'Output JSON path (default: .neo-ai-data/benchmarks/gemma4-rem-{ts}.json)')
        .option('--keep-alive <value>', 'Pass-through `keep_alive` provider option', null);

    program.parse();
    const opts = program.opts();

    const iterations = Number(opts.iterations);
    const warmup = Number(opts.warmup);
    const buckets = opts.size === 'all'
        ? Object.keys(SIZE_BUCKETS)
        : [opts.size];

    if (buckets.some(b => !SIZE_BUCKETS[b])) {
        console.error(`Unknown bucket(s): ${buckets.filter(b => !SIZE_BUCKETS[b]).join(', ')}`);
        console.error(`Valid: ${Object.keys(SIZE_BUCKETS).join(', ')}, all`);
        process.exit(1);
    }

    const graphProvider = resolveGraphModelProvider(aiConfig);

    const providerHost = graphProvider === 'ollama' ? aiConfig.ollama.host : aiConfig.openAiCompatible.host;
    const providerModel = graphProvider === 'ollama' ? aiConfig.ollama.model : aiConfig.openAiCompatible.model;

    console.log(`[gemma4-rem-benchmark] Graph provider: ${graphProvider} (chat modelProvider: ${aiConfig.modelProvider})`);
    console.log(`[gemma4-rem-benchmark] Model: ${providerModel}`);
    console.log(`[gemma4-rem-benchmark] Host: ${providerHost}`);
    console.log(`[gemma4-rem-benchmark] Iterations: ${iterations} (+${warmup} warmup discarded) per bucket`);
    console.log(`[gemma4-rem-benchmark] Buckets: ${buckets.join(', ')}`);
    console.log('');

    const provider = buildGraphProvider({
        modelProvider         : graphProvider,
        ollamaConfig          : aiConfig.ollama,
        openAiCompatibleConfig: aiConfig.openAiCompatible
    });

    const providerOptions = {};
    if (opts.keepAlive !== null && opts.keepAlive !== undefined) {
        providerOptions.keep_alive = opts.keepAlive;
    }

    const results = {
        meta: {
            timestamp    : new Date().toISOString(),
            graphProvider,
            chatModelProvider: aiConfig.modelProvider,
            model        : providerModel,
            host         : providerHost,
            iterations,
            warmup,
            providerOptions
        },
        buckets: {}
    };

    for (const bucket of buckets) {
        const charCount = SIZE_BUCKETS[bucket];
        const prompt = buildSyntheticPrompt(charCount);
        console.log(`[${bucket}] promptChars=${charCount} (≈${Math.round(charCount / 4)} tokens)`);

        // Warmup
        for (let w = 0; w < warmup; w++) {
            process.stdout.write(`  warmup ${w + 1}/${warmup}…`);
            try {
                const r = await measureOneCall(provider, prompt, providerOptions);
                console.log(` ttft=${r.ttftMs}ms ttlt=${r.ttltMs}ms`);
            } catch (e) {
                console.log(` FAILED: ${e.message}`);
            }
        }

        const runs = [];
        for (let i = 0; i < iterations; i++) {
            process.stdout.write(`  run ${i + 1}/${iterations}…`);
            try {
                const r = await measureOneCall(provider, prompt, providerOptions);
                runs.push(r);
                console.log(` ttft=${r.ttftMs}ms ttlt=${r.ttltMs}ms tps=${r.tps} outChars=${r.outputChars}`);
            } catch (e) {
                console.log(` FAILED: ${e.message}`);
                runs.push({error: e.message, ttftMs: 0, ttltMs: 0, tps: 0, outputChars: 0});
            }
        }

        results.buckets[bucket] = {
            promptChars       : charCount,
            approxPromptTokens: Math.round(charCount / 4),
            runs,
            summary           : summarize(runs)
        };
    }

    // Console summary
    console.log('\n=== Summary ===');
    console.log('bucket   promptTok  TTFTmedian  TTLTmedian  tpsMedian  outCharsMedian');
    for (const bucket of buckets) {
        const b = results.buckets[bucket];
        const s = b.summary;
        console.log(
            `${bucket.padEnd(8)} ${String(b.approxPromptTokens).padStart(9)} ` +
            `${String(s.ttftMs_median).padStart(10)}  ${String(s.ttltMs_median).padStart(10)}  ` +
            `${String(s.tps_median).padStart(9)}  ${String(s.outputChars_median).padStart(14)}`
        );
    }

    // Write JSON
    const outputPath = opts.output || path.join(
        projectRoot,
        '.neo-ai-data/benchmarks',
        `gemma4-rem-${results.meta.timestamp.replace(/[:.]/g, '-')}.json`
    );
    await mkdir(path.dirname(outputPath), {recursive: true});
    await writeFile(outputPath, JSON.stringify(results, null, 2), 'utf8');
    console.log(`\nWritten: ${outputPath}`);
}

main().catch(e => {
    console.error('[gemma4-rem-benchmark] FATAL:', e);
    process.exit(1);
});
