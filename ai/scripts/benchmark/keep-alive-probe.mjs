/**
 * @plane in-plane
 */
import {Command} from 'commander';
import Neo from '../../../src/Neo.mjs';
import '../../../src/core/_export.mjs';
import aiConfig from '../../mcp/server/memory-core/config.mjs';
import {buildGraphProvider, resolveGraphModelProvider} from '../../services/graph/providerDispatch.mjs';

/**
 * @module ai/scripts/benchmark/keep-alive-probe
 * @summary Empirical V-B-A of Ollama / OpenAI-compat KV-cache reuse via `keep_alive`.
 *
 * **Why this exists**:
 *
 * V-B-A on the provider substrate:
 * - `ai/provider/Ollama.mjs` promotes caller-supplied `keep_alive` to the top-level
 *   native `/api/chat` payload and defaults to the configured keep-alive value.
 * - `ai/provider/OpenAiCompatible.mjs` sends top-level `keep_alive` for compatible
 *   servers that honor Ollama-style cache-retention extensions.
 * - The remaining V-B-A target is whether the deployed server HONORS `keep_alive`
 *   and whether the control path (`keep_alive: 0`) actually evicts cache state.
 *
 * **What this probe actually proves / disproves**:
 *
 * Two back-to-back identical calls. If KV-cache reuse is working, **call 2's TTFT
 * should drop substantially** vs call 1 (prefill work is cached). If TTFT doesn't
 * change, either the cache isn't reusing OR `keep_alive` isn't being honored.
 *
 * Control: a `keep_alive: 0` run forces immediate cache eviction. Call 2 TTFT after
 * eviction should match call 1 — confirming `keep_alive` IS the controlling knob.
 *
 * **What this probe does NOT prove**:
 * - Whether reuse benefit scales with prompt size. Use `gemma4-rem-benchmark.mjs`
 *   with `--keep-alive` to characterize that.
 * - Whether `keep_alive` is honored by every server — native Ollama, LM Studio,
 *   llama.cpp, vLLM, and Ollama's own `/v1/...` surface all have different cache semantics.
 *   This probe only measures the operator's actual configured endpoint.
 *
 * @see ai/scripts/benchmark/gemma4-rem-benchmark.mjs — companion size-bucket harness
 * @see ai/provider/Ollama.mjs — provider keep-alive payload propagation
 * @see ai/provider/OpenAiCompatible.mjs — OpenAI-compatible keep-alive payload propagation
 * @see learn/agentos/measurements/gemma4-rem-benchmark.md — full protocol + findings table
 */

const FIXED_PROMPT = 'The agent reviewed the implementation, traced the call path through ' +
    'SemanticGraphExtractor and TopologyInferenceEngine, captured a V-B-A delta on the ' +
    'production substrate, and proposed a substrate evolution. Summarize this in one sentence.';

/**
 * Issue one streamed LLM call and capture TTFT only.
 *
 * @param {{stream: Function}} provider
 * @param {string} prompt
 * @param {Object} [options]
 * @returns {Promise<{ttftMs: number, ttltMs: number, outputChars: number, error: string}>} `error` only set on failure.
 */
async function measureTtft(provider, prompt, options = {}) {
    const messages = [
        {role: 'system', content: 'Respond concisely.'},
        {role: 'user', content: prompt}
    ];

    const t0 = performance.now();
    let t1 = null;
    let outputChars = 0;

    try {
        for await (const chunk of provider.stream(messages, options)) {
            if (t1 === null) t1 = performance.now();
            outputChars += chunk.length;
        }
    } catch (e) {
        return {ttftMs: 0, ttltMs: 0, outputChars: 0, error: e.message};
    }

    const t2 = performance.now();
    return {
        ttftMs     : Math.round((t1 ?? t2) - t0),
        ttltMs     : Math.round(t2 - t0),
        outputChars
    };
}

/**
 * Run the keep_alive probe sequence and print interpretation.
 *
 * @param {{stream: Function}} provider
 * @param {string} keepAlive `"1h"` (reuse-enabled), `"0"` (cache-evicted control), or null (provider default)
 * @returns {Promise<void>}
 */
async function runProbe(provider, keepAlive) {
    const label = keepAlive === null ? '(provider default — no keep_alive override)' : `keep_alive=${keepAlive}`;
    console.log(`\n--- Probe: ${label} ---`);

    const options = keepAlive === null ? {} : {keep_alive: keepAlive};

    process.stdout.write('  call 1 (cold cache expected)…');
    const r1 = await measureTtft(provider, FIXED_PROMPT, options);
    if (r1.error) {
        console.log(` FAILED: ${r1.error}`);
        return;
    }
    console.log(` ttft=${r1.ttftMs}ms ttlt=${r1.ttltMs}ms outChars=${r1.outputChars}`);

    process.stdout.write('  call 2 (warm cache if keep_alive honored)…');
    const r2 = await measureTtft(provider, FIXED_PROMPT, options);
    if (r2.error) {
        console.log(` FAILED: ${r2.error}`);
        return;
    }
    console.log(` ttft=${r2.ttftMs}ms ttlt=${r2.ttltMs}ms outChars=${r2.outputChars}`);

    const ttftDelta = r1.ttftMs - r2.ttftMs;
    const ttftRatio = r1.ttftMs === 0 ? 0 : r2.ttftMs / r1.ttftMs;
    console.log(`  → TTFT delta: ${ttftDelta}ms (call 2 is ${Math.round((1 - ttftRatio) * 100)}% faster)`);
    console.log(`  → Interpretation:`);
    if (ttftDelta > 200 && ttftRatio < 0.5) {
        console.log(`    KV-cache reuse appears ACTIVE — call 2's prefill cost dropped significantly.`);
    } else if (Math.abs(ttftDelta) < 100) {
        console.log(`    KV-cache reuse appears INACTIVE (or already-warm) — call 2's TTFT matches call 1.`);
    } else {
        console.log(`    INCONCLUSIVE — moderate delta. Re-run with larger prompts via gemma4-rem-benchmark.mjs.`);
    }
}

async function main() {
    const program = new Command();
    program
        .name('keep-alive-probe')
        .description('Empirical V-B-A of provider KV-cache reuse via keep_alive parameter')
        .option('--mode <mode>', 'reuse | control | both', 'both');

    program.parse();
    const opts = program.opts();

    const graphProvider = resolveGraphModelProvider(aiConfig);

    const providerHost = graphProvider === 'ollama' ? aiConfig.ollama.host : aiConfig.openAiCompatible.host;
    const providerModel = graphProvider === 'ollama' ? aiConfig.ollama.model : aiConfig.openAiCompatible.model;

    console.log(`[keep-alive-probe] Graph provider: ${graphProvider} (chat modelProvider: ${aiConfig.modelProvider})`);
    console.log(`[keep-alive-probe] Model: ${providerModel}`);
    console.log(`[keep-alive-probe] Host: ${providerHost}`);
    console.log(`[keep-alive-probe] Prompt: "${FIXED_PROMPT.slice(0, 60)}..." (${FIXED_PROMPT.length} chars)`);

    const provider = buildGraphProvider({
        modelProvider         : graphProvider,
        ollamaConfig          : aiConfig.ollama,
        openAiCompatibleConfig: aiConfig.openAiCompatible
    });

    if (opts.mode === 'reuse' || opts.mode === 'both') {
        await runProbe(provider, '1h');
    }
    if (opts.mode === 'control' || opts.mode === 'both') {
        await runProbe(provider, '0');
    }

    console.log('\n=== Probe complete ===');
    console.log('See learn/agentos/measurements/gemma4-rem-benchmark.md for the findings template.');
    console.log('If reuse appears ACTIVE under keep_alive=1h AND INACTIVE under keep_alive=0,');
    console.log('the provider honors keep_alive and Sub 3 / Sub 7 can batch under one keep_alive window.');
}

main().catch(e => {
    console.error('[keep-alive-probe] FATAL:', e);
    process.exit(1);
});
