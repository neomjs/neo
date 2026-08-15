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

    /**
     * AC-F1 — the supervised-child heap ceiling's fail-closed parse, committed.
     *
     * @neo-gpt-emmy verified this rejection by hand at the merged heap-ceiling head and approved on
     * that evidence; nothing in the tree pinned it. Reviewer execution is not regression coverage —
     * it proves the head she ran, not the next edit.
     *
     * The value of failing closed is not tidiness. `-1` does NOT fail on its own: Node reports
     * `--max-old-space-size=-1` out of bounds, **exits 0**, and continues with a ~4.5 GB heap limit
     * — above the 3 GiB cgroup. So the invalid override yields a LARGER ceiling than any valid one,
     * and trades a catchable `FATAL ERROR: heap limit` for an uncatchable kernel OOM kill that
     * leaves no diagnostic. A permissive parser inverts the property the ceiling exists for.
     *
     * All three branches are asserted because the first draft of this parser was written against a
     * `(value)` signature rather than `(envVarName, {env})` and threw on EVERY input including
     * unset, which would have failed boot for every deployment that never set the override. Only
     * probing all of them caught it.
     */
    test('#16480 — the supervised-child heap ceiling refuses a non-positive override rather than falling back', () => {
        const envName  = 'NEO_SUPERVISED_TASK_HEAP_MB',
              original = process.env[envName];

        // ONE retained instance, refreshed per case, destroyed in `finally`.
        //
        // An earlier revision constructed a fresh fixture per branch, which left every successful one
        // registered and — because the invalid branch throws DURING construction — leaked a
        // half-built provider that no `destroy()` could reach (@neo-gpt-emmy measured registered
        // instances moving 0 -> 1 and staying there after the expected TypeError). `refreshEnv()`
        // re-applies the env layer on a live instance, so the same four branches are exercised with
        // one object whose lifecycle a `finally` can actually own.
        let fixture = null;

        try {
            delete process.env[envName];
            fixture = createOverlayFixture('Neo.ai.unittest.HeapCeilingFixture', null);

            // Unset resolves the leaf default — the branch a value-signature parser would have
            // thrown on, which is how the backwards first draft was caught.
            //
            // Deliberately NOT `FALLBACK_SUPERVISED_TASK_HEAP_MB`. The two were both 384, and
            // `Orchestrator.spec.mjs`'s injection test documents why that collision is a hazard:
            // an assertion on the shared value passes with the injection deleted. They now differ,
            // so this pins the leaf and only the leaf.
            expect(fixture.proxy.orchestrator.supervisedTaskHeapMb).toBe(1024);

            process.env[envName] = '512';
            fixture.instance.refreshEnv();
            expect(fixture.proxy.orchestrator.supervisedTaskHeapMb).toBe(512);

            // Refusal, not fallback. Falling back to 384 here would be silent, and the operator
            // would be running a ~4.5 GB child under a 3 GiB cap with nothing saying so.
            for (const bad of ['-1', '0', '1.5', 'abc']) {
                process.env[envName] = bad;
                expect(() => fixture.instance.refreshEnv(), `${bad} must be refused`).toThrow(TypeError);
            }
        } finally {
            if (original === undefined) {
                delete process.env[envName];
            } else {
                process.env[envName] = original;
            }

            fixture?.instance?.destroy();
        }
    });

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
            expect(ConfigBase.config.data.orchestrator.deploymentMode.default).toBe('cloud');
            // `authorityProfile` has NO default — a role is declared, never inherited. The
            // empty default is also what ARMS its `requiredFor` guard, since requiredness is
            // evaluated on the RESOLVED value.
            expect(ConfigBase.config.data.orchestrator.authorityProfile.default).toBe('');
            expect(proxy.orchestrator.deploymentMode).toBe(process.env.NEO_AI_DEPLOYMENT_MODE || 'cloud');
            expect(proxy.orchestrator.authorityProfile)
                .toBe(process.env.NEO_AI_ORCHESTRATOR_AUTHORITY_PROFILE || '');
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

test.describe('fleet.port — the domain type, not the generic one', () => {
    // `'number'` would admit 0, which binds an EPHEMERAL port: the listener comes up somewhere
    // random and the cockpit's fixed URL reaches nothing. The prior inline `Number(env) || 8083`
    // caught 0 by ACCIDENT — via falsiness — and let -1, 80.5 and 70000 through. This drives the
    // leaf's OWN declared parser rather than a parser the test picked, so it fails if the binding
    // changes even when `Env.parsePort` itself is fine.
    const portLeaf = () => ConfigBase.config.data.fleet.port;

    test('declares the port domain type and the 8083 default', () => {
        expect(portLeaf().default).toBe(8083);
        expect(portLeaf().type).toBe('port');
        expect(portLeaf().env).toBe('NEO_FLEET_PORT');
    });

    test('a valid port resolves; every invalid shape falls back to the default', () => {
        const resolve = raw => portLeaf().parse('NEO_FLEET_PORT', {
            env : {NEO_FLEET_PORT: raw},
            warn: () => {}   // the parser warns on rejection; silence it, the return value is the assertion
        });

        // Resolves.
        expect(resolve('9999')).toBe(9999);

        // Falls back — `undefined` means "leaf default applies".
        for (const invalid of ['0', '-1', '80.5', '70000', 'abc', '']) {
            expect(resolve(invalid), `NEO_FLEET_PORT="${invalid}" must not resolve`).toBeUndefined();
        }
    })
});

test.describe('orchestrator.wakeDispatch.pollIntervalMs — a multiplicand, not a delay', () => {
    // The wake daemon multiplies this leaf into its retry backoff (`nextAttemptAt = now +
    // pollIntervalMs * attempts`), so an out-of-domain value is not a slower or faster daemon: `0`,
    // a negative and a fraction all put `nextAttemptAt` at or before `now`, which makes every queued
    // entry perpetually due and spins the retry path; `Infinity` parks it forever. `'number'` would
    // admit all four. The env is readable by the production daemon — the same shape that let
    // `NEO_FLEET_PORT` through above — so the domain is the containment, not a promise that only
    // tests set it.
    //
    // The parser is driven with an explicit `env` object rather than by assigning `process.env`:
    // Playwright runs several spec FILES per worker, so a module- or test-scope env write here
    // would leak into siblings (the defect this ticket's own PR had to fix).
    const cadenceLeaf = () => ConfigBase.config.data.orchestrator.wakeDispatch.pollIntervalMs;

    test('declares the positiveInt domain and the shipped 3000ms default', () => {
        expect(cadenceLeaf().default).toBe(3000);
        expect(cadenceLeaf().type).toBe('positiveInt');
        expect(cadenceLeaf().env).toBe('NEO_WAKE_DAEMON_POLL_INTERVAL_MS');
    });

    test('a valid cadence resolves; every malformed shape falls back to the default', () => {
        const resolve = raw => cadenceLeaf().parse('NEO_WAKE_DAEMON_POLL_INTERVAL_MS', {
            env : {NEO_WAKE_DAEMON_POLL_INTERVAL_MS: raw},
            warn: () => {}   // the parser warns on rejection; silence it, the return value is the assertion
        });

        // Resolves — including the sub-second value the daemon's own specs pin.
        expect(resolve('50')).toBe(50);
        expect(resolve('3000')).toBe(3000);

        // Falls back — `undefined` means "leaf default applies".
        for (const malformed of ['0', '-1', '-3000', '0.5', '2999.9', 'Infinity', '-Infinity', 'NaN', 'abc', '']) {
            expect(
                resolve(malformed),
                `NEO_WAKE_DAEMON_POLL_INTERVAL_MS="${malformed}" must not resolve`
            ).toBeUndefined();
        }
    });

    test('no malformed value can make a retry backoff immediately due', () => {
        // The consequence the domain exists to prevent, asserted directly rather than inferred from
        // the parser returning undefined. `??` mirrors ConfigProvider#applyEnvLayer, which writes the
        // env layer only when the parser returned a value — so a rejected override leaves the default.
        const effectiveCadence = raw => cadenceLeaf().parse('NEO_WAKE_DAEMON_POLL_INTERVAL_MS', {
            env : {NEO_WAKE_DAEMON_POLL_INTERVAL_MS: raw},
            warn: () => {}
        }) ?? cadenceLeaf().default;

        const now = 1_000_000;

        for (const malformed of ['0', '-1', '-3000', '0.5', 'Infinity', 'abc', '']) {
            const cadence = effectiveCadence(malformed);

            // Every backoff the daemon computes from this cadence — first enqueue, the linear
            // `* attempts` retry, and the harder `* (attempts + 2)` unknown-outcome deferral — must
            // land strictly in the future for every attempt count the daemon can reach.
            for (let attempts = 0; attempts <= 5; attempts++) {
                expect(
                    Math.min(now + cadence, now + cadence * Math.max(attempts, 1), now + cadence * (attempts + 2)),
                    `"${malformed}" at attempt ${attempts} must not be immediately due`
                ).toBeGreaterThan(now);
            }

            expect(Number.isFinite(cadence), `"${malformed}" must not park the daemon forever`).toBe(true);
        }
    })
});
