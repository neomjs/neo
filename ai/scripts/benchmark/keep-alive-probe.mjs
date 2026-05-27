import {Command} from 'commander';
import Neo from '../../../src/Neo.mjs';
import '../../../src/core/_export.mjs';
import aiConfig from '../../mcp/server/memory-core/config.mjs';
import {buildGraphProvider} from '../../services/graph/providerDispatch.mjs';

/**
 * @module ai/scripts/benchmark/keep-alive-probe
 * @summary Empirical V-B-A of Ollama / OpenAI-compat KV-cache reuse via `keep_alive`.
 *
 * **Why this exists** (Epic #12065 Sub 8 / #12074 Part B):
 *
 * V-B-A on the provider substrate (2026-05-27, branch `feature-12074-gemma4-bench`):
 * - `ai/provider/Ollama.mjs:108` — `generate()` hardcodes `keep_alive: "1h"` BEFORE
 *   serialization. Heavy non-streaming graph calls (production
 *   `SemanticGraphExtractor.executeTriVectorExtraction` path) get the long lease
 *   unconditionally.
 * - `ai/provider/Ollama.mjs:91-92` (in `preparePayload()`) — arbitrary remaining
 *   options are nested under `payload.options`, NOT top-level. Native Ollama
 *   `/api/chat` reads `keep_alive` at TOP LEVEL of the request body, so
 *   caller-supplied `keep_alive` via `provider.stream(messages, {keep_alive})` is
 *   silently ignored by Ollama. **This probe early-exits on native Ollama** with
 *   an explicit message; characterizing native Ollama keep_alive control requires
 *   either patching `Ollama.stream()` (separate SDK fix) or a raw-fetch path.
 * - `ai/provider/OpenAiCompatible.mjs:146` + `preparePayload()` (lines 91-106) —
 *   `stream()` propagates arbitrary remaining `options` into the JSON payload via
 *   `Object.assign(payload, clonedOptions)` (line 105). Caller-supplied
 *   `keep_alive` IS top-level in the JSON. The **unverified residual** is whether
 *   the deployed OpenAI-compatible server (LM Studio, llama.cpp, vLLM, Ollama's
 *   `/v1/...` surface) HONORS the non-standard `keep_alive` extension — **this is
 *   what the probe characterizes**, scoped to the OpenAI-compat path.
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
 * - Whether `keep_alive` is honored by all OpenAI-compat servers — LM Studio, llama.cpp,
 *   vLLM, and Ollama's own `/v1/...` surface all have different cache semantics.
 *   This probe only measures the operator's actual configured endpoint.
 *
 * @see ai/scripts/benchmark/gemma4-rem-benchmark.mjs — companion size-bucket harness
 * @see ai/provider/Ollama.mjs — provider with hardcoded keep_alive in generate()
 * @see ai/provider/OpenAiCompatible.mjs — provider without keep_alive
 * @see learn/agentos/gemma4-rem-benchmark.md — full protocol + findings table
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
 * @returns {Promise<{ttftMs: number, ttltMs: number, outputChars: number, error?: string}>}
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

    // Mirror PR #12061's `resolveGraphModelProvider` shape inline (see sibling
    // `gemma4-rem-benchmark.mjs` for migration note once #12061 merges).
    const graphProvider = aiConfig.graphProvider
        || (aiConfig.modelProvider === 'ollama' ? 'ollama' : 'openAiCompatible');

    const providerHost = graphProvider === 'ollama' ? aiConfig.ollama.host : aiConfig.openAiCompatible.host;
    const providerModel = graphProvider === 'ollama' ? aiConfig.ollama.model : aiConfig.openAiCompatible.model;

    console.log(`[keep-alive-probe] Graph provider: ${graphProvider} (chat modelProvider: ${aiConfig.modelProvider})`);
    console.log(`[keep-alive-probe] Model: ${providerModel}`);
    console.log(`[keep-alive-probe] Host: ${providerHost}`);
    console.log(`[keep-alive-probe] Prompt: "${FIXED_PROMPT.slice(0, 60)}..." (${FIXED_PROMPT.length} chars)`);

    // Narrow probe scope per @neo-gpt PR #12076 cycle-2 review: native Ollama's
    // `preparePayload()` nests arbitrary `options` under `payload.options`
    // (Ollama.mjs lines 91-92), so caller-supplied `keep_alive` becomes
    // `payload.options.keep_alive` — but native Ollama's `/api/chat` reads
    // `keep_alive` at TOP LEVEL of the request body. The probe's `keep_alive=0`
    // control would be silently ignored, making the reuse/control comparison
    // meaningless for the native Ollama path.
    //
    // OpenAI-compatible providers are fine: `OpenAiCompatible.preparePayload()`
    // uses `Object.assign(payload, clonedOptions)` (line 105), so caller-supplied
    // `keep_alive` IS top-level in the JSON payload. The remaining V-B-A target
    // for OpenAI-compat is whether the deployed server HONORS the non-standard
    // `keep_alive` extension.
    //
    // Native Ollama keep_alive probing would require either patching
    // `Ollama.stream()` to inject top-level `keep_alive` (separate ticket: SDK
    // fix outside this benchmark's scope) OR a raw-fetch path that bypasses the
    // provider — also separate scope.
    if (graphProvider === 'ollama') {
        console.error('\n[keep-alive-probe] EARLY EXIT: this probe cannot characterize native Ollama keep_alive control.');
        console.error('Reason: caller-supplied keep_alive is nested under payload.options by Ollama.preparePayload(),');
        console.error('but native Ollama /api/chat reads keep_alive at top level. The keep_alive=0 control would be');
        console.error('silently ignored — see PR #12076 cycle-2 review thread for the audit.');
        console.error('');
        console.error('Workaround for native Ollama: rely on Ollama.generate() callsites, which write keep_alive');
        console.error('top-level directly (Ollama.mjs:108 hardcodes keep_alive="1h" for heavy non-streaming graph calls).');
        console.error('');
        console.error('Follow-up: patching Ollama.stream() to inject top-level keep_alive is tracked separately;');
        console.error('this benchmark PR (#12076 / Sub 8 #12074) does not own that fix.');
        process.exit(2);
    }

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
    console.log('See learn/agentos/gemma4-rem-benchmark.md for the findings template.');
    console.log('If reuse appears ACTIVE under keep_alive=1h AND INACTIVE under keep_alive=0,');
    console.log('the provider honors keep_alive and Sub 3 / Sub 7 can batch under one keep_alive window.');
}

main().catch(e => {
    console.error('[keep-alive-probe] FATAL:', e);
    process.exit(1);
});
