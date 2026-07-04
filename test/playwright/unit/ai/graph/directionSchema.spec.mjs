import {setup} from '../../../setup.mjs';

const appName = 'DirectionSchemaTest';

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

test.describe('directionSchema + directionAttribution — the direction contract mechanized (ADR 0033, #14567)', () => {
    let schema, attribution;

    test.beforeAll(async () => {
        schema      = await import('../../../../../ai/graph/directionSchema.mjs');
        attribution = await import('../../../../../ai/graph/directionAttribution.mjs');
    });

    test('deterministic identity: goal ids, cluster keys, and append-only-under-version fact ids (§2.1)', () => {
        expect(schema.createEvolutionGoalId('Outward Traction!')).toBe('evolution-goal-outward-traction');
        expect(schema.createClusterDirectionKey('memory substrate')).toBe('cluster-memory-substrate');

        // Same (motion, direction, version) → same id: re-runs are idempotent.
        const idV1 = schema.createAttributionFactId({motionId: 'issue-14567', directionKey: 'evolution-goal-outward-traction', mappingVersion: 1});
        expect(schema.createAttributionFactId({motionId: 'issue-14567', directionKey: 'evolution-goal-outward-traction', mappingVersion: 1})).toBe(idV1);

        // A new mapping version mints a NEW fact id — history is append-only under version.
        const idV2 = schema.createAttributionFactId({motionId: 'issue-14567', directionKey: 'evolution-goal-outward-traction', mappingVersion: 2});
        expect(idV2).not.toBe(idV1);

        expect(() => schema.createEvolutionGoalId('')).toThrow();
        expect(() => schema.createAttributionFactId({motionId: 'issue-1', directionKey: 'not-a-direction', mappingVersion: 1})).toThrow();
    });

    test('minimal-key regressions: short cluster keys valid, empty suffixes invalid (review cycle-1 identity-contract fix)', () => {
        // The drift class: a shared length bound tied cluster validity to the longer goal prefix.
        expect(schema.isDirectionKey('cluster-x')).toBe(true);
        expect(schema.isDirectionKey(schema.createClusterDirectionKey('x'))).toBe(true);

        // Empty suffixes are never identities — for EITHER prefix.
        expect(schema.isDirectionKey('evolution-goal-')).toBe(false);
        expect(schema.isDirectionKey('cluster-')).toBe(false);
        expect(() => schema.parseBreakdownKey('evolution-goal-@1')).toThrow();

        // End-to-end: a 1-char cluster id attributes cleanly (the throw path the review caught).
        const result = attribution.attributeMotion({
            motionEvents   : [{id: 'issue-1', conceptIds: ['c']}],
            declaredGoals  : [],
            clusterMapping : {c: 'x'},
            mappingVersion : 1,
            filterSet      : 'excludeClasses:[chore]',
            falsifyingQuery: 'replay'
        });

        expect(result.errors).toEqual([]);
        expect(result.breakdown['cluster-x@1']).toBe(1);
    });

    test('breakdown keys compose and parse symmetrically — the falsifier can pin the measured version (§2.4)', () => {
        const key = schema.composeBreakdownKey('cluster-memory-substrate', 3);

        expect(key).toBe('cluster-memory-substrate@3');
        expect(schema.parseBreakdownKey(key)).toEqual({directionKey: 'cluster-memory-substrate', mappingVersion: 3});
        expect(() => schema.composeBreakdownKey('evolution-goal-x', 0)).toThrow();
        expect(() => schema.parseBreakdownKey('no-version-here')).toThrow();
    });

    test('EVOLUTION_GOAL validation: shared five-field contract + operator-owned intent + seed classes', () => {
        const valid = schema.validateEvolutionGoalProperties({
            claimClass        : 'measured',
            falsifyingQuery   : 'attribution facts for this goal in window W, same filter set',
            windowSemantics   : 'week:iso',
            confoundDisclaimer: 'cannot isolate operator steering from organic drift',
            publicFlag        : false,
            slug              : 'outward-traction',
            lifecycle         : 'active',
            intentWeight      : 0.6,
            seedClass         : 'operator'
        });

        expect(valid.valid).toBe(true);

        const invalid = schema.validateEvolutionGoalProperties({slug: 'x', lifecycle: 'active', intentWeight: 2, seedClass: 'vibes'});

        expect(invalid.valid).toBe(false);
        expect(invalid.errors.join(' ')).toContain('falsifyingQuery');
        expect(invalid.errors.join(' ')).toContain('intentWeight');
        expect(invalid.errors.join(' ')).toContain('seedClass');
    });

    test('the declared-anchor cap counts only active operator anchors — release-train seeds are free (§2.5)', () => {
        const goals = [
            ...Array.from({length: 12}, (_, i) => ({seedClass: 'operator', lifecycle: 'active', id: `evolution-goal-g${i}`})),
            {seedClass: 'release-train', lifecycle: 'active', id: 'evolution-goal-release-train-v13-2'},
            {seedClass: 'operator', lifecycle: 'retired', id: 'evolution-goal-old'}
        ];

        const check = schema.checkDeclaredAnchorCap(goals);

        expect(check).toEqual({atCap: true, operatorActiveCount: 12, cap: 12});
        expect(schema.checkDeclaredAnchorCap(goals.slice(1)).atCap).toBe(false);
    });

    test('conservation: the identity holds, the pool is mandatory, malformed keys are defects (§2.3)', () => {
        const ok = schema.validateConservation({
            'evolution-goal-outward-traction@1': 0.5,
            'cluster-memory-substrate@1'       : 0.25,
            [schema.UNATTRIBUTED_DIRECTION_KEY]: 0.25
        });

        expect(ok.valid).toBe(true);
        expect(ok.unattributedShare).toBe(0.25);

        const missingPool = schema.validateConservation({'evolution-goal-x@1': 1});
        expect(missingPool.valid).toBe(false);
        expect(missingPool.errors.join(' ')).toContain('unattributed');

        const leaky = schema.validateConservation({
            'evolution-goal-x@1'               : 0.5,
            [schema.UNATTRIBUTED_DIRECTION_KEY]: 0.1
        });
        expect(leaky.valid).toBe(false);
        expect(leaky.errors.join(' ')).toContain('conservation violated');
    });

    test('attributeMotion: hybrid matching, equal-split measure, first-class pool, conservation-by-construction (§2.2/§2.3)', () => {
        const result = attribution.attributeMotion({
            motionEvents: [
                {id: 'issue-100', conceptIds: ['golden-path']},                       // declared match
                {id: 'issue-101', conceptIds: ['docking-layout']},                    // cluster match
                {id: 'issue-102', conceptIds: ['golden-path', 'docking-layout']},     // both → split 0.5/0.5
                {id: 'issue-103', conceptIds: ['something-new']}                      // unattributed
            ],
            declaredGoals: [
                {id: 'evolution-goal-gp-direction', lifecycle: 'active', matchers: ['golden-path']},
                {id: 'evolution-goal-starved-one', lifecycle: 'active', matchers: ['nobody-works-this']},
                {id: 'evolution-goal-retired-one', lifecycle: 'retired', matchers: ['golden-path']}
            ],
            clusterMapping : {'docking-layout': 'body engine'},
            mappingVersion : 1,
            filterSet      : 'excludeClasses:[chore]',
            falsifyingQuery: 'replay window W under filterSet excludeClasses:[chore] @ mapping v1'
        });

        expect(result.errors).toEqual([]);
        expect(result.conservation.valid).toBe(true);

        // issue-100 → goal (1.0) · issue-101 → cluster (1.0) · issue-102 → 0.5 + 0.5 · issue-103 → pool.
        expect(result.breakdown['evolution-goal-gp-direction@1']).toBeCloseTo(0.375, 10); // (1 + 0.5) / 4
        expect(result.breakdown['cluster-body-engine@1']).toBeCloseTo(0.375, 10);
        expect(result.breakdown[schema.UNATTRIBUTED_DIRECTION_KEY]).toBeCloseTo(0.25, 10);

        // Every fact is validated, version-pinned, filter-stamped.
        expect(result.facts).toHaveLength(4);
        expect(result.facts.every(fact => fact.mappingVersion === 1 && fact.filterSet === 'excludeClasses:[chore]')).toBe(true);

        // The retired goal never matches; the unserved ACTIVE goal is INTENT_STARVED — the June-class alarm.
        expect(result.states.aligned).toEqual(['evolution-goal-gp-direction']);
        expect(result.states.starved).toEqual(['evolution-goal-starved-one']);
        expect(result.states.unattributedShare).toBeCloseTo(0.25, 10);
    });

    test('empty window: the pool carries the whole measure — never a faked split, never a crash', () => {
        const result = attribution.attributeMotion({
            motionEvents   : [],
            declaredGoals  : [{id: 'evolution-goal-x', lifecycle: 'active', matchers: ['x']}],
            mappingVersion : 1,
            filterSet      : 'excludeClasses:[chore]',
            falsifyingQuery: 'replay empty window'
        });

        expect(result.breakdown[schema.UNATTRIBUTED_DIRECTION_KEY]).toBe(1);
        expect(result.conservation.valid).toBe(true);
        expect(result.states.starved).toEqual(['evolution-goal-x']);
    });
});
