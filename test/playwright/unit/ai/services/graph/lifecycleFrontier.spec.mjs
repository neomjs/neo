import {setup} from '../../../../setup.mjs';

const appName = 'LifecycleFrontierContractTest';

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
 * Contract tests for the lifecycle-frontier.v1 envelope: stage ordering, never-foreign enforcement,
 * honest status independence, and the consumer-side fail-open guard.
 */
test.describe('lifecycleFrontier — lifecycle-frontier.v1 contract', () => {
    let buildLifecycleFrontier, validateLifecycleFrontier, LIFECYCLE_STAGES, LIFECYCLE_FRONTIER_STATUSES;

    const base = (overrides = {}) => ({
        scope          : {agentId: '@neo-opus-ada', harnessInstance: 'inst-1', resolution: 'agent-instance'},
        status         : 'fresh',
        capturedAt     : '2026-07-16T10:00:00.000Z',
        sourceWatermark: 'wm-1',
        expiresAt      : '2026-07-16T10:10:00.000Z',
        coverage       : {sources: ['github-workflow', 'memory-core-a2a'], degradedSources: []},
        items          : [],
        ...overrides
    });

    const item = (overrides = {}) => ({
        id             : 'pr-1',
        stage          : 'own-pr-repair',
        source         : 'github-workflow',
        subjectId      : 'pr-15231',
        actionableSince: '2026-07-16T09:00:00.000Z',
        ...overrides
    });

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/services/graph/lifecycleFrontier.mjs');
        buildLifecycleFrontier      = mod.buildLifecycleFrontier;
        validateLifecycleFrontier   = mod.validateLifecycleFrontier;
        LIFECYCLE_STAGES            = mod.LIFECYCLE_STAGES;
        LIFECYCLE_FRONTIER_STATUSES = mod.LIFECYCLE_FRONTIER_STATUSES;
    });

    test('stamps the schema + notAuthority and deeply freezes the envelope', () => {
        const frontier = buildLifecycleFrontier(base({items: [item()]}));

        expect(frontier.schemaVersion).toBe('lifecycle-frontier.v1');
        expect(frontier.notAuthority).toBe(true);
        expect(Object.isFrozen(frontier)).toBe(true);
        expect(Object.isFrozen(frontier.items)).toBe(true);
        expect(Object.isFrozen(frontier.items[0])).toBe(true);
    });

    test('orders by stage rank FIRST — an own-PR repair outranks a review request regardless of age', () => {
        // The older review-request must still sort below the newer own-PR repair: the stage order is
        // the contract (a blocked lane you own beats someone else's queue), not an age race.
        const frontier = buildLifecycleFrontier(base({
            items: [
                item({id: 'rr-1', stage: 'requested-review',       actionableSince: '2026-07-01T00:00:00.000Z'}),
                item({id: 'pr-1', stage: 'own-pr-repair',          actionableSince: '2026-07-16T09:00:00.000Z'}),
                item({id: 'dm-1', stage: 'direct-message',         actionableSince: '2026-07-02T00:00:00.000Z'}),
                item({id: 'rt-1', stage: 'own-pr-reviewer-routing', actionableSince: '2026-07-15T00:00:00.000Z'})
            ]
        }));

        expect(frontier.items.map(entry => entry.stage)).toEqual([
            'own-pr-repair', 'own-pr-reviewer-routing', 'requested-review', 'direct-message'
        ]);
    });

    test('within a stage, oldest actionableSince first, then STABLE id — no fabricated movement', () => {
        // Equal-aged rows must not swap between passes: a consumer diffing consecutive frontiers would
        // otherwise report movement that never happened.
        const build = () => buildLifecycleFrontier(base({
            items: [
                item({id: 'pr-c', actionableSince: '2026-07-16T09:00:00.000Z'}),
                item({id: 'pr-a', actionableSince: '2026-07-16T09:00:00.000Z'}),
                item({id: 'pr-b', actionableSince: '2026-07-16T08:00:00.000Z'})
            ]
        }));

        expect(build().items.map(entry => entry.id)).toEqual(['pr-b', 'pr-a', 'pr-c']);
        // deterministic across passes
        expect(build().items.map(entry => entry.id)).toEqual(build().items.map(entry => entry.id));
    });

    test('NEVER-FOREIGN: an omitted scope carrying items is a producer error, not a warning', () => {
        // Leaking another peer's obligations is worse than absence — so this fails loud rather than
        // silently dropping the rows.
        expect(() => buildLifecycleFrontier(base({
            scope: {resolution: 'omitted'},
            items: [item()]
        }))).toThrow(/omitted scope must carry zero items/);

        const omitted = buildLifecycleFrontier(base({
            scope        : {resolution: 'omitted'},
            status       : 'missing',
            items        : [],
            omittedReason: 'identity-conflicted'
        }));

        expect(omitted.items).toEqual([]);
        expect(omitted.scope.omittedReason).toBe('identity-conflicted');
        expect(omitted.scope.agentId).toBeNull();
    });

    test('status is independent of item count — missing/degraded is never normalized to empty', () => {
        for (const status of [...LIFECYCLE_FRONTIER_STATUSES]) {
            const frontier = buildLifecycleFrontier(base({status, items: []}));
            expect(frontier.status).toBe(status);
        }

        // a degraded source is honest coverage, NOT a contract violation
        const degraded = buildLifecycleFrontier(base({
            status  : 'degraded',
            coverage: {sources: ['github-workflow'], degradedSources: ['memory-core-a2a']},
            items   : [item()]
        }));

        expect(degraded.status).toBe('degraded');
        expect(degraded.coverage.degradedSources).toEqual(['memory-core-a2a']);
        expect(degraded.items).toHaveLength(1);
    });

    test('every item must name its stage, subject and actionableSince — an undateable row is unreasonable-about', () => {
        expect(() => buildLifecycleFrontier(base({items: [item({stage: 'bogus'})]}))).toThrow(/stage must be one of/);
        expect(() => buildLifecycleFrontier(base({items: [item({actionableSince: undefined})]}))).toThrow(/actionableSince must be a non-empty string/);
        expect(() => buildLifecycleFrontier(base({items: [item({subjectId: ''})]}))).toThrow(/subjectId must be a non-empty string/);
        expect(() => buildLifecycleFrontier(base({status: 'bogus'}))).toThrow(/status must be one of/);
        expect(() => buildLifecycleFrontier(base({scope: {resolution: 'guessed'}}))).toThrow(/scope.resolution must be one of/);
    });

    test('a PR-derived row carries the head it was observed against', () => {
        const frontier = buildLifecycleFrontier(base({items: [item({headSha: '94dc70926f'})]}));

        expect(frontier.items[0].headSha).toBe('94dc70926f');
        // absent head is explicit null, never undefined-shaped
        expect(buildLifecycleFrontier(base({items: [item()]})).items[0].headSha).toBeNull();
    });

    test('validateLifecycleFrontier accepts a good envelope and NEVER throws on bad input', () => {
        const good = buildLifecycleFrontier(base({items: [item()]}));
        expect(validateLifecycleFrontier(good)).toEqual({valid: true, errors: []});

        expect(validateLifecycleFrontier(null).valid).toBe(false);
        expect(validateLifecycleFrontier({schemaVersion: 'legacy'}).valid).toBe(false);

        const foreign = validateLifecycleFrontier({
            schemaVersion: 'lifecycle-frontier.v1',
            status       : 'fresh',
            notAuthority : true,
            scope        : {resolution: 'omitted'},
            items        : [{stage: 'own-pr-repair', actionableSince: '2026-07-16T09:00:00.000Z'}]
        });

        expect(foreign.valid).toBe(false);
        expect(foreign.errors.some(error => /omitted scope must carry zero items/.test(error))).toBe(true);
    });

    test('exposes the five stages in contract order', () => {
        expect(LIFECYCLE_STAGES).toEqual([
            'own-pr-repair', 'own-pr-reviewer-routing', 'requested-review', 'claimed-a2a-task', 'direct-message'
        ]);
    });
});
