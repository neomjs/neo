import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import '../../../../src/core/_export.mjs';
import ConfigBase                from '../../../../ai/configBase.mjs';
import {createConfigProxy, leaf} from '../../../../ai/ConfigProvider.mjs';

/**
 * The overlay-drift ROOT-FIX proof: an operator overlay written as a delta-only subclass of
 * `Neo.ai.ConfigBase` inherits every base leaf BY CONSTRUCTION — a leaf added to the base reaches
 * the subclass instance with zero overlay edits. The mechanism under test is `Neo.setupClass`'s
 * descriptor-driven hierarchical merge (the `merge: 'deep'` descriptor on the Provider's `data_`),
 * NOT any hand-rolled merge — snapshot-copy overlays drift precisely because they opt out of it.
 *
 * Fixture classes use distinct classNames (never `Neo.ai.Config`): `setupClass` throws on namespace
 * collision in unitTestMode, and the real singleton name belongs to the template/overlay world.
 */
test.describe('ai/configBase — delta-only subclass overlays (overlay-drift root fix)', () => {
    /**
     * @summary Builds a setupClass'd delta-only subclass fixture + a non-singleton instance of it.
     * @param {String} className Distinct fixture className (never the real singleton name).
     * @param {Object} data Delta-only data overrides.
     * @returns {{cls: Function, instance: Neo.ai.ConfigProvider, proxy: Proxy}}
     */
    function createOverlayFixture(className, data) {
        const cls = Neo.setupClass(class extends ConfigBase {
            static config = {
                className,
                ...(data ? {data} : {})
            }
        });
        const instance = Neo.create(cls);
        return {cls, instance, proxy: createConfigProxy(instance)};
    }

    test('a base leaf NOT named in the delta resolves through the subclass — zero overlay edits (AC-1)', () => {
        // Deltas are leaf() declarations exactly like the base — the data plane's invariant.
        // (A bare primitive merged over a leaf descriptor does not survive construction; the
        // leaf-shaped delta also keeps env/type declared where the value changes.)
        const {instance, proxy} = createOverlayFixture('Neo.ai.unittest.OverlayInheritsFixture', {
            modelName: leaf('unit-test-model-delta')
        });

        try {
            // The delta applied (env-free base leaf → deterministic)…
            expect(proxy.modelName).toBe('unit-test-model-delta');
            // …and leaves the delta never mentioned resolve from the base by construction.
            expect(proxy.transport).toBe(process.env.NEO_TRANSPORT || 'stdio');
            expect(proxy.mcpHttpPort).toBe(Number(process.env.MCP_HTTP_PORT) || 3000);
            expect(proxy.orchestrator.deploymentMode).toBe('local');
        } finally {
            instance.destroy();
        }
    });

    test('nested deltas deep-merge: sibling base leaves survive a nested override', () => {
        const {instance, proxy} = createOverlayFixture('Neo.ai.unittest.OverlayDeepMergeFixture', {
            ollama: {
                model: leaf('unit-test-model', 'NEO_UNIT_OVERLAY_MODEL', 'string')
            }
        });

        try {
            expect(proxy.ollama.model).toBe(process.env.NEO_UNIT_OVERLAY_MODEL || 'unit-test-model');
            // Sibling leaves of the overridden nested key stay inherited — the deep-merge proof.
            expect(proxy.ollama.host).toBe(process.env.NEO_OLLAMA_HOST || 'http://127.0.0.1:11434');
            expect(proxy.ollama.embeddingModel).toBe(process.env.NEO_OLLAMA_EMBEDDING_MODEL || 'qwen3-embedding');
        } finally {
            instance.destroy();
        }
    });

    test('Stop-hook projection binding + row/byte budgets are config-owned and inherited by overlays', () => {
        const {instance, proxy} = createOverlayFixture('Neo.ai.unittest.HookProjectionConfigFixture', null);

        try {
            expect(proxy.stopHook.projection.capability).toBe('self-awareness');
            expect(proxy.stopHook.projection.maxRows).toBe(12);
            expect(proxy.stopHook.projection.maxBytes).toBe(4096);

            proxy.setEnvOverride('NEO_HOOK_PROJECTION_PATH', '/runtime/hook/current.json');
            proxy.setEnvOverride('NEO_HOOK_PROJECTION_TARGET_ID', 'target-id');
            proxy.setEnvOverride('NEO_AGENT_IDENTITY', 'neo-gpt');
            proxy.setEnvOverride('NEO_HOOK_PROJECTION_HARNESS_TYPE', 'codex');
            proxy.setEnvOverride('NEO_HOOK_PROJECTION_INSTANCE_KEY_DIGEST', 'instance-digest');
            proxy.setEnvOverride('NEO_HOOK_PROJECTION_WORKSPACE_KEY_DIGEST', 'workspace-digest');
            proxy.setEnvOverride('NEO_HOOK_PROJECTION_MAX_ROWS', 7);
            proxy.setEnvOverride('NEO_HOOK_PROJECTION_MAX_BYTES', 2048);

            expect(proxy.stopHook.projection).toMatchObject({
                path              : '/runtime/hook/current.json',
                targetId          : 'target-id',
                agentId           : 'neo-gpt',
                harnessType       : 'codex',
                instanceKeyDigest : 'instance-digest',
                workspaceKeyDigest: 'workspace-digest',
                maxRows           : 7,
                maxBytes          : 2048
            });
        } finally {
            instance.destroy();
        }
    });

    test('base formulas are inherited: the chroma coordinate formulas resolve on a subclass instance', () => {
        const {instance, proxy} = createOverlayFixture('Neo.ai.unittest.OverlayFormulaFixture', null);

        try {
            // The unit harness resolves the test-side coordinates via the inherited formulas.
            expect(proxy.engines.chroma.port).toBe(proxy.engines.chroma.useTestDatabase
                ? proxy.engines.chroma.portTest
                : proxy.engines.chroma.portProd);
            expect(proxy.engines.chroma.dataDir).toBe(proxy.engines.chroma.useTestDatabase
                ? proxy.engines.chroma.dataDirTest
                : proxy.engines.chroma.dataDirProd);
        } finally {
            instance.destroy();
        }
    });

    test('the base registers its class WITHOUT instantiating — zero side effects on import', () => {
        // The base module's setupClass registers `Neo.ai.ConfigBase` as a CLASS (non-singleton);
        // the eager `Neo.ai.Config` singleton belongs to the template/overlay, never the base.
        expect(ConfigBase.isClass).toBe(true);
        expect(typeof ConfigBase).toBe('function');
        expect(ConfigBase.config.className).toBe('Neo.ai.ConfigBase');
        expect(ConfigBase.config.singleton).toBeFalsy();
    });
});
