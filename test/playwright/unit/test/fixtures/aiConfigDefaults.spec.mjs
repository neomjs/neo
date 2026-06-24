import {setup} from '../../../setup.mjs';

const appName = 'AiConfigDefaultsFixtureTest';

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
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';

/**
 * @summary Contract tests for the shared Tier-1 test fixture.
 *
 * The fixture's value depends on two invariants:
 *
 *   1. **Reference isolation** — nested groups in `TIER1_DEFAULTS` are NOT
 *      the same references as the corresponding groups on the live
 *      `AiConfig.data`. Mutating the live singleton in any spec must not
 *      mutate the snapshot.
 *
 *   2. **Deep freeze** — nested groups (`auth`, `ollama`, `openAiCompatible`,
 *      `engines.chroma`, …) are themselves frozen. Accidental in-test writes
 *      to nested groups throw in strict mode instead of silently mutating.
 *
 * An earlier cycle shipped a shallow `Object.freeze({...AiConfig.data})`
 * which top-level-froze but kept nested references — the failure mode this
 * spec is designed to regression-anchor.
 */
test.describe('aiConfigDefaults fixture contract (#11977 cycle-2)', () => {
    let TIER1_DEFAULTS;
    let AiConfig;
    let originalConfig;
    let originalClassHierarchy;

    test.beforeAll(async () => {
        const mod = await import('../../../fixtures/aiConfigDefaults.mjs');
        TIER1_DEFAULTS = mod.TIER1_DEFAULTS;

        originalConfig         = Neo.ai?.Config;
        originalClassHierarchy = Neo.classHierarchyMap?.['Neo.ai.Config'];

        if (Neo.ai?.Config) {
            delete Neo.ai.Config;
        }
        if (Neo.classHierarchyMap?.['Neo.ai.Config']) {
            delete Neo.classHierarchyMap['Neo.ai.Config'];
        }

        AiConfig = (await import('../../../../../ai/config.template.mjs')).default;
    });

    test.afterAll(() => {
        if (originalConfig !== undefined) {
            Neo.ai.Config = originalConfig;
        } else if (Neo.ai?.Config) {
            delete Neo.ai.Config;
        }

        if (originalClassHierarchy !== undefined) {
            Neo.classHierarchyMap['Neo.ai.Config'] = originalClassHierarchy;
        } else if (Neo.classHierarchyMap?.['Neo.ai.Config']) {
            delete Neo.classHierarchyMap['Neo.ai.Config'];
        }
    });

    test('top-level snapshot is frozen', () => {
        expect(Object.isFrozen(TIER1_DEFAULTS)).toBe(true);
    });

    test('nested groups are frozen (deep freeze contract)', () => {
        // Cycle-1 regression: shallow `Object.freeze` left these mutable.
        expect(Object.isFrozen(TIER1_DEFAULTS.auth)).toBe(true);
        expect(Object.isFrozen(TIER1_DEFAULTS.ollama)).toBe(true);
        expect(Object.isFrozen(TIER1_DEFAULTS.openAiCompatible)).toBe(true);
        expect(Object.isFrozen(TIER1_DEFAULTS.engines)).toBe(true);
        expect(Object.isFrozen(TIER1_DEFAULTS.engines.chroma)).toBe(true);
        expect(Object.isFrozen(TIER1_DEFAULTS.orchestrator)).toBe(true);
        expect(Object.isFrozen(TIER1_DEFAULTS.orchestrator.intervals)).toBe(true);
        expect(Object.isFrozen(TIER1_DEFAULTS.orchestrator.recoveryActuator)).toBe(true);
    });

    test('nested groups are independent references from live AiConfig.data', () => {
        // Cycle-1 regression: shallow spread preserved nested references; any
        // mutation to `AiConfig.data.auth.realm` would alter
        // `TIER1_DEFAULTS.auth.realm` because both pointed at the same object.
        expect(TIER1_DEFAULTS.auth).not.toBe(AiConfig.data.auth);
        expect(TIER1_DEFAULTS.ollama).not.toBe(AiConfig.data.ollama);
        expect(TIER1_DEFAULTS.openAiCompatible).not.toBe(AiConfig.data.openAiCompatible);
        expect(TIER1_DEFAULTS.engines).not.toBe(AiConfig.data.engines);
        expect(TIER1_DEFAULTS.engines.chroma).not.toBe(AiConfig.data.engines.chroma);
        expect(TIER1_DEFAULTS.orchestrator.intervals).not.toBe(AiConfig.data.orchestrator.intervals);
        expect(TIER1_DEFAULTS.orchestrator.recoveryActuator).not.toBe(AiConfig.data.orchestrator.recoveryActuator);
    });

    test('mutating live AiConfig.data does NOT leak into TIER1_DEFAULTS snapshot', () => {
        const originalRealm     = TIER1_DEFAULTS.auth.realm;
        const liveOriginalRealm = AiConfig.data.auth.realm;

        try {
            AiConfig.data.auth.realm = 'cycle-2-mutation-probe';

            expect(TIER1_DEFAULTS.auth.realm).toBe(originalRealm);
            expect(TIER1_DEFAULTS.auth.realm).not.toBe('cycle-2-mutation-probe');
            expect(AiConfig.data.auth.realm).toBe('cycle-2-mutation-probe');
        } finally {
            // Restore the live singleton so sibling specs don't observe drift.
            AiConfig.data.auth.realm = liveOriginalRealm;
        }
    });

    test('values match the tracked template defaults (sanity check)', () => {
        // Anchor that the snapshot is reading from the template, not the overlay.
        expect(TIER1_DEFAULTS.modelProvider).toBe(process.env.NEO_MODEL_PROVIDER || 'openAiCompatible');
        expect(TIER1_DEFAULTS.embeddingProvider).toBe(process.env.NEO_EMBEDDING_PROVIDER || 'openAiCompatible');
        expect(TIER1_DEFAULTS.vectorDimension).toBe(Number(process.env.NEO_VECTOR_DIMENSION) || 4096);
        expect(TIER1_DEFAULTS.orchestrator.recoveryActuator.enabled).toBe(true);
        expect(TIER1_DEFAULTS.orchestrator.recoveryActuator.blockedSupervisedTasks).toEqual([]);
        expect(TIER1_DEFAULTS.orchestrator.recoveryActuator.blockedComposeServices).toEqual([]);
        expect(TIER1_DEFAULTS.orchestrator.recoveryActuator.blockedDeployTargets).toEqual([]);
    });
});
