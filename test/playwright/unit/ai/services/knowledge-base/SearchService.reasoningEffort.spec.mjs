import {setup} from '../../../../setup.mjs';

const appName = 'KBSearchServiceReasoningEffortTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

/**
 * `ask` was the only chat-model consumer that sent NO reasoning-effort control.
 *
 * `summaryReasoningEffort` and `graphReasoningEffort` ship for the two structured-output consumers and both
 * default to `'none'`; the ask path had no equivalent, so a reasoning-capable model spent its
 * completion budget thinking and returned an EMPTY answer. Measured on a 26B-class local model with
 * a ~7,900-token grounded prompt: `'none'` answered in 33.3s; no control took 86.7s and returned
 * nothing, with 297 of 299 completion tokens consumed by reasoning.
 *
 * **The empty answer is the defect; the latency merely accompanies it.** A regression check written
 * against wall-clock would pass while a longer prompt still exhausted the budget — so these assert
 * the control REACHES the provider, which is the property that was absent.
 *
 * **Coverage boundary, stated rather than implied:** the `|| undefined` omission branch — an overlay
 * with no `reasoningEffort` leaf keeping the provider's own default — is NOT unit-covered here.
 * Reaching it requires an `askSynthesis` block without the leaf, and the only way to produce one in
 * this process is mutating the shared `AiConfig` singleton, which ADR-0019 B4 forbids outright — ticket-ref-ok: the prohibition is ADR authority, not a preference; without it this reads as an untested branch rather than an unreachable one (it is
 * the mechanism that bled test state into live stores). The branch is one `||` at the call
 * site and is verified by reading; asserting it with a test that cannot vary the input would be
 * theatre. Every assertion below was mutation-proven: removing the call-site line reddens them.
 */
test.describe('Neo.ai.services.knowledge-base.SearchService — ask reasoning-effort pass-through', () => {
    let SearchService, QueryService, GraphService, ChromaManager;
    let originalModel, originalModelUnavailable, originalQueryDocuments;
    let originalListNodeRecordsByType, originalReady, originalGetCollection;

    test.beforeAll(async () => {
        SearchService = (await import('../../../../../../ai/services/knowledge-base/SearchService.mjs')).default;
        QueryService  = (await import('../../../../../../ai/services/knowledge-base/QueryService.mjs')).default;
        GraphService  = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        ChromaManager = (await import('../../../../../../ai/services/knowledge-base/ChromaManager.mjs')).default;

        originalModel                 = SearchService.model;
        originalModelUnavailable      = SearchService.modelUnavailable;
        originalQueryDocuments        = QueryService.queryDocuments;
        originalListNodeRecordsByType = GraphService.listNodeRecordsByType;
        originalReady                 = GraphService.ready;
        originalGetCollection         = ChromaManager.getKnowledgeBaseCollection;
    });

    test.afterEach(() => {
        SearchService.model                      = originalModel;
        SearchService.modelUnavailable           = originalModelUnavailable;
        QueryService.queryDocuments              = originalQueryDocuments;
        GraphService.listNodeRecordsByType       = originalListNodeRecordsByType;
        GraphService.ready                       = originalReady;
        ChromaManager.getKnowledgeBaseCollection = originalGetCollection;
    });

    /**
     * Isolates retrieval so `ask` reaches the synthesis call, and captures the options it passes.
     *
     * The fixture owns the collection count for the reason `SearchService.noModel.spec.mjs` documents
     * at length: the emptiness probe is a second read straight through to the live plane, so
     * a spec that stubs only `queryDocuments` still tracks corpus fill rather than the diff.
     *
     * @returns {Object[]} The captured `generateContent` option objects, in call order.
     */
    function captureSynthesisOptions() {
        const captured = [];

        ChromaManager.getKnowledgeBaseCollection = async () => ({count: async () => 42});
        GraphService.ready                       = true;
        GraphService.listNodeRecordsByType       = async () => [];
        // `queryDocuments` resolves `{results: [...]}` — a bare array reads as `results: undefined`,
        // which `ask` treats as an empty flat result and short-circuits to `#emptyFlatResponse()`
        // before ever reaching synthesis. Each row needs `source` (split for the display name) and
        // `score` (Number-coerced into the reference).
        QueryService.queryDocuments              = async () => ({
            results: [{
                source : 'learn/guides/Architecture.md',
                score  : 0.92,
                content: 'Neo.mjs runs the VDom in a dedicated worker.'
            }]
        });

        SearchService.modelUnavailable = false;
        SearchService.model            = {
            generateContent: async (prompt, options) => {
                captured.push(options);
                return {response: {text: () => 'A grounded answer.'}};
            }
        };

        return captured;
    }

    test('the synthesis call carries reasoning_effort — the control that was absent before #16768', async () => {
        const captured = captureSynthesisOptions();

        await SearchService.ask({query: 'How does Neo run the VDom?'});

        expect(captured).toHaveLength(1);
        // Presence is the assertion. Before this change the key was never sent, so the provider applied
        // its own default and a reasoning model burned the completion budget before answering.
        expect(captured[0]).toHaveProperty('reasoning_effort');
    });

    test('the value is the resolved askSynthesis leaf, not a service-local literal', async () => {
        const captured = captureSynthesisOptions();

        await SearchService.ask({query: 'How does Neo run the VDom?'});

        // The committed TEMPLATE, never the gitignored `config.mjs` overlay. An overlay-resolving test
        // asserts against whatever this machine happens to carry, so it can pass here and fail in CI
        // — or worse, pass in both while measuring a value no other environment has. Defaults resolve
        // through the same `ConfigBase` either way, so this costs the assertion nothing.
        const aiConfig = (await import('../../../../../../ai/mcp/server/knowledge-base/config.template.mjs')).default;

        // Reads the SSOT rather than asserting `'none'`: an operator who sets
        // NEO_KB_ASK_REASONING_EFFORT must see their value reach the provider, and hardcoding the
        // default here would pass against a service that ignored the leaf entirely.
        expect(captured[0].reasoning_effort).toBe(aiConfig.askSynthesis.reasoningEffort || undefined);
    });

    test('the sent value is a non-empty string — never an empty-string placeholder', async () => {
        const captured = captureSynthesisOptions();

        await SearchService.ask({query: 'How does Neo run the VDom?'});

        // Asserts presence FIRST, deliberately. An earlier revision of this test asserted only
        // `not.toBe('')`, which passed identically whether the key was sent or absent — mutation-
        // proven vacuous: removing the call-site line left it green while its two siblings went red.
        // A test that cannot fail on the defect is not covering it.
        expect(captured[0]).toHaveProperty('reasoning_effort');
        expect(typeof captured[0].reasoning_effort).toBe('string');
        expect(captured[0].reasoning_effort.length).toBeGreaterThan(0);
    });

    test('the existing synthesis options are untouched — additive change, no displaced key', async () => {
        const captured = captureSynthesisOptions();

        await SearchService.ask({query: 'How does Neo run the VDom?'});

        // Positive control: without these, the three assertions above would still pass against a
        // call site that had dropped the timeout budget or the priority class while adding the new key.
        expect(captured[0]).toHaveProperty('timeoutMs');
        expect(captured[0].operationLabel).toBe('ask_knowledge_base synthesis');
        expect(captured[0].priority).toBe('interactive');
    });
});
