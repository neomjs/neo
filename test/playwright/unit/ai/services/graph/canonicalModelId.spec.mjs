import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'CanonicalModelIdTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import {
    ensureOllamaModelsReady,
    probeProviderParallelModelCapacity,
    satisfiesRequiredModelId
} from '../../../../../../ai/services/graph/providerReadinessHelper.mjs';

/**
 * @summary An untagged Ollama model id is satisfied by its `:latest` form — and nothing else is.
 *
 * **The defect, measured on a live external plane.** Ollama canonicalises stored models to
 * `name:tag` and reports an untagged pull as `name:latest`. Config carries the untagged name, so an
 * exact string comparison reported a RESIDENT embedding model as missing:
 *
 * ```
 * availableModels: ["qwen3-embedding:latest", "gemma4:26b"]
 * missingModels:   ["qwen3-embedding"]         <- resident, and embeds were working
 * extraModels:     ["qwen3-embedding:latest"]  <- the same model, in both lists, one payload
 * ```
 *
 * It could never clear: warming the "missing" model produces the same `:latest` id that already
 * failed to match. And it was not cosmetic — `missingModels` becomes `missing-required-model`, which
 * the health diagnosis classes as recoverable and answers with `warmProvider`. A warm loop with no
 * exit, on a plane whose Knowledge Base was idle and whose ingestion had never once attempted.
 *
 * **Why the behaviour arms below exist.** A first cut of this fix changed the comparison helpers and
 * left `probeProviderParallelModelCapacity` — the producer whose verdict licenses the warm — comparing
 * exactly. Every helper test was green while the actuator stayed broken. A model-identity rule has to
 * be asserted at the seam that drives the actuator, not only where it is easiest to call.
 */
test.describe('model identity — satisfiesRequiredModelId', () => {
    test('an untagged Ollama requirement is satisfied by its :latest form — the defect', () => {
        expect(satisfiesRequiredModelId('qwen3-embedding', 'qwen3-embedding:latest', 'ollama')).toBe(true);
        expect(satisfiesRequiredModelId('qwen3-embedding', 'qwen3-embedding', 'ollama')).toBe(true)
    });

    /**
     * Directionality. Equivalence must not erase which side owns the requirement: a config pinned to
     * `:latest` is a pin, and a bare observation does not satisfy it. A symmetric matcher would turn
     * every explicit pin into a suggestion, silently.
     */
    test('DIRECTIONAL — a pinned :latest requirement is not satisfied by a bare observation', () => {
        expect(satisfiesRequiredModelId('qwen3-embedding:latest', 'qwen3-embedding', 'ollama')).toBe(false);
        expect(satisfiesRequiredModelId('qwen3-embedding:latest', 'qwen3-embedding:latest', 'ollama')).toBe(true)
    });

    /**
     * Provider scope. LM Studio ids carry no implicit tag, so the Ollama equivalence there would
     * accept a model the deployment does not serve.
     */
    test('OLLAMA ONLY — the equivalence does not leak into LM Studio', () => {
        expect(satisfiesRequiredModelId('gemma-4-26b', 'gemma-4-26b:latest', 'openAiCompatible')).toBe(false);
        expect(satisfiesRequiredModelId('gemma-4-26b', 'gemma-4-26b', 'openAiCompatible')).toBe(true)
    });

    /**
     * The trap this fix must not become. Collapsing ALL tags would make the matcher pass more often,
     * which looks like a better fix and is a far worse bug: `:8b` and `:4b` are different models with
     * different vector dimensions, so a plane could silently embed against the wrong one and corrupt
     * a corpus. A wrong warm loop costs CPU; a wrong embedder costs the data.
     */
    test('an EXPLICIT tag is never folded — :8b must not match :latest or the untagged name', () => {
        expect(satisfiesRequiredModelId('qwen3-embedding:8b', 'qwen3-embedding:latest', 'ollama')).toBe(false);
        expect(satisfiesRequiredModelId('qwen3-embedding:8b', 'qwen3-embedding', 'ollama')).toBe(false);
        expect(satisfiesRequiredModelId('qwen3-embedding:8b', 'qwen3-embedding:4b', 'ollama')).toBe(false)
    });

    test('NON-VACUITY — genuinely different models still differ, and absent ids never match', () => {
        // Without this the matcher could return true for everything and every arm above would pass
        // on the untagged case alone.
        expect(satisfiesRequiredModelId('gemma4:26b', 'qwen3-embedding', 'ollama')).toBe(false);
        expect(satisfiesRequiredModelId('gemma4:26b', 'gemma4:31b', 'ollama')).toBe(false);
        expect(satisfiesRequiredModelId('registry/latest-model', 'registry/latest', 'ollama')).toBe(false);
        // Two absent ids must not compare equal — that would make every empty slot "match".
        expect(satisfiesRequiredModelId(null, undefined, 'ollama')).toBe(false);
        expect(satisfiesRequiredModelId('', '', 'ollama')).toBe(false)
    })
});

test.describe('model identity — the production seams that drive recovery', () => {
    const ollamaConfig = {
        graphProvider    : 'ollama',
        embeddingProvider: 'ollama',
        ollama           : {
            host                 : 'http://127.0.0.1:11434',
            model                : 'gemma4:26b',
            embeddingModel       : 'qwen3-embedding', // untagged, as every deployment configures it
            requireParallelModels: 2
        }
    };

    /**
     * THE actuator arm. This result feeds `DeploymentStateBridgeService`, whose residency verdict
     * licenses `warmProvider`. On the live plane both required models were resident and this returned
     * `ready: false` forever.
     */
    test('probeProviderParallelModelCapacity is READY when the required models are resident under :latest', async () => {
        const result = await probeProviderParallelModelCapacity({
            config           : ollamaConfig,
            timeoutMs        : 1000,
            fetchOllamaModels: async () => ['qwen3-embedding:latest', 'gemma4:26b']
        });

        expect(result.ready, JSON.stringify(result)).toBe(true);
        expect(result.missingModels).toEqual([]);
        // The self-contradiction the live payload showed: the same model in `missing` AND `extra`.
        expect(result.extraModels).toEqual([]);
        expect(result.observedRequiredCount).toBe(2)
    });

    test('probeProviderParallelModelCapacity NON-VACUITY — a genuinely absent model is still missing', async () => {
        const result = await probeProviderParallelModelCapacity({
            config           : ollamaConfig,
            timeoutMs        : 1000,
            fetchOllamaModels: async () => ['gemma4:26b']
        });

        expect(result.ready).toBe(false);
        expect(result.missingModels).toEqual(['qwen3-embedding'])
    });

    test('probeProviderParallelModelCapacity keeps LM Studio EXACT — no tag folding off-Ollama', async () => {
        const result = await probeProviderParallelModelCapacity({
            config: {
                graphProvider    : 'openAiCompatible',
                embeddingProvider: 'openAiCompatible',
                openAiCompatible : {
                    host                 : 'http://127.0.0.1:1234',
                    model                : 'google/gemma-4-26b-a4b',
                    embeddingModel       : 'text-embedding-qwen3',
                    requireParallelModels: 2
                }
            },
            timeoutMs                  : 1000,
            fetchOpenAiCompatibleModels: async () => ['google/gemma-4-26b-a4b', 'text-embedding-qwen3:latest']
        });

        expect(result.ready, 'an LMS id is the whole id — `:latest` is a different model').toBe(false);
        expect(result.missingModels).toEqual(['text-embedding-qwen3'])
    });

    test('ensureOllamaModelsReady resolves required, extra and missing through ONE rule', async () => {
        const result = await ensureOllamaModelsReady({
            roles: [
                {role: 'chat',      providerRole: 'chat',      model: 'gemma4:26b'},
                {role: 'embedding', providerRole: 'embedding', model: 'qwen3-embedding'}
            ],
            requireParallelModels: 2,
            host                 : 'http://127.0.0.1:11434',
            fetchModelIds        : async () => [{id: 'qwen3-embedding:latest'}, {id: 'gemma4:26b'}],
            attempts             : 1,
            delayMs              : 0,
            timeoutMs            : 1000
        });

        expect(result.ready, JSON.stringify(result)).toBe(true);
        expect(result.missingModels).toEqual([]);
        expect(result.extraModels).toEqual([])
    });

    /**
     * The fail-open direction. A context requirement keyed on the configured `qwen3-embedding` misses
     * an observed `qwen3-embedding:latest`, so the requirement is not found — and a requirement that
     * is not found is a requirement not enforced. The under-sized model would pass the very check that
     * exists to reject it, which is the dangerous way for a lookup to miss. Once detected, the configured
     * id must remain the warm authority; using the observed alias detects the gap but never selects a role.
     */
    test('an under-context :latest alias warms the configured role before readiness succeeds', async () => {
        let   contextReady = false;
        const warmCalls    = [];
        const result       = await ensureOllamaModelsReady({
            roles: [
                {role: 'chat',      providerRole: 'chat',      model: 'gemma4:26b'},
                {role: 'embedding', providerRole: 'embedding', model: 'qwen3-embedding', contextLength: 8192}
            ],
            requireParallelModels: 2,
            host                 : 'http://127.0.0.1:11434',
            fetchModelIds        : async () => [
                {id: 'qwen3-embedding:latest', contextLength: contextReady ? 8192 : 2048},
                {id: 'gemma4:26b',             contextLength: 32768}
            ],
            warmModel: async (role, options) => {
                warmCalls.push({options, role});
                contextReady = true
            },
            attempts : 1,
            delayMs  : 0,
            timeoutMs: 1000
        });

        expect(result.ready, JSON.stringify(result)).toBe(true);
        expect(warmCalls).toHaveLength(1);
        expect(warmCalls[0].role).toMatchObject({
            model       : 'qwen3-embedding',
            role        : 'embedding',
            providerRole: 'embedding'
        });
        expect(warmCalls[0].options.contextLength).toBe(8192);
        expect(result.warmedModels).toEqual([{
            contextLength: 8192,
            model        : 'qwen3-embedding',
            providerRole : 'embedding',
            role         : 'embedding'
        }]);
        expect(result.insufficientContextModels).toEqual([])
    })
});
