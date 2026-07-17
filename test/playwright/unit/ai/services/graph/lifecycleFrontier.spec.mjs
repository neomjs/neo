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

    // The FULL row a predicate actually emits — a partial fixture would let the guard's item-shape
    // checks pass vacuously.
    const item = (overrides = {}) => ({
        id             : 'pr-1',
        stage          : 'own-pr-repair',
        kind           : 'changes-requested',
        state          : 'OPEN',
        source         : 'github-workflow',
        subjectId      : 'pr-15231',
        headSha        : 'head-2',
        actionableSince: '2026-07-16T09:00:00.000Z',
        checkedAt      : '2026-07-16T10:00:00.000Z',
        citations      : ['https://github.com/neomjs/neo/pull/15231'],
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

        // A non-PR stage has no head to move under it, so null there is correct rather than a gap.
        const task = buildLifecycleFrontier(base({
            items: [item({stage: 'claimed-a2a-task', source: 'memory-core-a2a', subjectId: 't-1', headSha: undefined})]
        }));

        expect(task.items[0].headSha).toBeNull();
        expect(validateLifecycleFrontier(task, {shapeOnly: true}).valid).toBe(true);
    });

    test('the PRODUCER refuses to mint a headless PR row — a malformed frontier is a producer bug', () => {
        // Closing this at the consumer alone left the producer happily minting rows that cannot support
        // the head-change reset: the guard would catch them, but only AFTER a malformed frontier
        // existed and only for readers that ran the guard. Normalizing the omission to `null` dressed
        // it up as a decision.
        expect(() => buildLifecycleFrontier(base({items: [item({headSha: undefined})]})))
            .toThrow(/items\[0\]\.headSha \(PR-derived stage "own-pr-repair" resets on head change\)/);

        expect(() => buildLifecycleFrontier(base({items: [item({headSha: ''})]})))
            .toThrow(/items\[0\]\.headSha/);
    });

    test('the CONSUMER independently rejects a torn PR row the producer never made', () => {
        // Defence in depth, and not redundant: the guard's whole job is envelopes this producer did not
        // build — a legacy writer, a torn file, another version. So the torn row is hand-built here
        // rather than minted, which is exactly how it would arrive.
        const torn = {
            schemaVersion  : 'lifecycle-frontier.v1',
            status         : 'fresh',
            capturedAt     : '2026-07-16T12:00:00.000Z',
            sourceWatermark: 'w-1',
            expiresAt      : '2026-07-16T12:05:00.000Z',
            scope          : {resolution: 'agent-instance', agentId: '@neo-opus-ada'},
            coverage       : {sources: ['pull-requests'], degradedSources: []},
            items          : [{
                id             : 'pr-1',
                stage          : 'own-pr-repair',
                kind           : 'changes-requested',
                state          : 'OPEN',
                source         : 'github-workflow',
                subjectId      : 'pr-15231',
                headSha        : null,
                actionableSince: '2026-07-16T09:00:00.000Z',
                checkedAt      : '2026-07-16T10:00:00.000Z',
                citations      : []
            }],
            notAuthority: true
        };

        const result = validateLifecycleFrontier(torn, {shapeOnly: true});

        expect(result.valid).toBe(false);
        expect(result.errors.join(' ')).toContain('headSha is required for the PR-derived stage "own-pr-repair"');
    });

    test('an UNPARSEABLE reader clock fails the guard — it must not skip the check it promised', () => {
        // The reviewer's second falsifier: a 2020-expired envelope passed with `now: 'not-a-time'`,
        // because the guard silently skipped expiry when it could not parse the clock. The caller asked
        // for expiry validation; the guard could not perform it and returned valid anyway.
        const expired = buildLifecycleFrontier(base({
            capturedAt: '2020-01-01T00:00:00.000Z',
            expiresAt : '2020-01-01T00:05:00.000Z',
            items     : []
        }));

        const result = validateLifecycleFrontier(expired, {now: 'not-a-time', agentId: '@neo-opus-ada'});

        expect(result.valid).toBe(false);
        expect(result.errors.join(' ')).toContain('is not a parseable time; expiry could not be validated');
    });

    test('validateLifecycleFrontier accepts a good envelope and NEVER throws on bad input', () => {
        const good = buildLifecycleFrontier(base({items: [item()]}));
        expect(validateLifecycleFrontier(good, {shapeOnly: true})).toEqual({valid: true, errors: []});

        expect(validateLifecycleFrontier(null, {shapeOnly: true}).valid).toBe(false);
        expect(validateLifecycleFrontier({schemaVersion: 'legacy'}, {shapeOnly: true}).valid).toBe(false);

        const foreign = validateLifecycleFrontier({
            schemaVersion: 'lifecycle-frontier.v1',
            status       : 'fresh',
            notAuthority : true,
            scope        : {resolution: 'omitted'},
            items        : [{stage: 'own-pr-repair', actionableSince: '2026-07-16T09:00:00.000Z'}]
        }, {shapeOnly: true});

        expect(foreign.valid).toBe(false);
        expect(foreign.errors.some(error => /omitted scope must carry zero items/.test(error))).toBe(true);
    });

    test('exposes the five stages in contract order', () => {
        expect(LIFECYCLE_STAGES).toEqual([
            'own-pr-repair', 'own-pr-reviewer-routing', 'requested-review', 'claimed-a2a-task', 'direct-message'
        ]);
    });

    test('called BARE, the guard refuses rather than silently skipping expiry and reader binding', () => {
        // The reviewer's falsifier: without reader args, an EXPIRED envelope scoped to ANOTHER agent
        // returned valid:true — the two failures the guard exists to catch. Optional reader facts were
        // themselves a fail-open, so the shape-only choice must now be made at the call site.
        const expiredForeign = {
            schemaVersion  : 'lifecycle-frontier.v1',
            status         : 'empty',
            capturedAt     : '2020-01-01T00:00:00.000Z',
            sourceWatermark: 'w',
            expiresAt      : '2020-01-01T00:05:00.000Z',
            scope          : {resolution: 'agent-instance', agentId: '@some-other-peer'},
            coverage       : {sources: [], degradedSources: []},
            items          : [],
            notAuthority   : true
        };

        expect(validateLifecycleFrontier(expiredForeign).valid).toBe(false);
        expect(validateLifecycleFrontier(expiredForeign).errors.join(' ')).toContain('requires now + agentId');

        // With the reader's facts, BOTH failures are named rather than skipped.
        const checked = validateLifecycleFrontier(expiredForeign, {now: '2026-07-16T12:00:00.000Z', agentId: '@neo-opus-ada'});

        expect(checked.valid).toBe(false);
        expect(checked.errors.join(' ')).toContain('expired at');
        expect(checked.errors.join(' ')).toContain('not the consuming agent');

        // shape-only is legitimate — but it must be SAID, so the unchecked expiry is visible in the code
        expect(validateLifecycleFrontier(expiredForeign, {shapeOnly: true}).valid).toBe(true);
    });

    test('an envelope that expires before it was captured was never valid for an instant', () => {
        const inverted = validateLifecycleFrontier({
            schemaVersion  : 'lifecycle-frontier.v1',
            status         : 'empty',
            capturedAt     : '2026-07-16T12:00:00.000Z',
            sourceWatermark: 'w',
            expiresAt      : '2026-07-16T11:00:00.000Z',
            scope          : {resolution: 'omitted', agentId: null},
            coverage       : {sources: [], degradedSources: []},
            items          : [],
            notAuthority   : true
        }, {shapeOnly: true});

        // Both stamps parse individually; that says nothing about whether they describe a real window.
        expect(inverted.valid).toBe(false);
        expect(inverted.errors.join(' ')).toContain('is not after capturedAt');
    });

    test('EVERY emitted item field is validated, members included — not the interesting ones', () => {
        const bad = validateLifecycleFrontier({
            schemaVersion  : 'lifecycle-frontier.v1',
            status         : 'fresh',
            capturedAt     : '2026-07-16T12:00:00.000Z',
            sourceWatermark: 'w',
            expiresAt      : '2026-07-16T12:05:00.000Z',
            scope          : {resolution: 'agent-instance', agentId: '@neo-opus-ada'},
            coverage       : {sources: ['pull-requests'], degradedSources: []},
            // missing state, missing checkedAt, and citations that cite nothing followable
            items          : [{
                id             : 'pr-1',
                stage          : 'own-pr-repair',
                kind           : 'changes-requested',
                source         : 'github-workflow',
                subjectId      : 'pr-1',
                actionableSince: '2026-07-16T09:00:00.000Z',
                citations      : [42]
            }],
            notAuthority: true
        }, {shapeOnly: true});

        expect(bad.valid).toBe(false);
        expect(bad.errors.join(' ')).toContain('items[0].state is required');
        expect(bad.errors.join(' ')).toContain('items[0].checkedAt is required');
        // `citations: [42]` passes an is-array check and cites nothing a reader can follow
        expect(bad.errors.join(' ')).toContain('items[0].citations must contain only strings');
    });

    test('a STRUCTURALLY INCOMPLETE envelope is rejected — a guard that passes one is worse than none', () => {
        // The reviewer's falsifier: this shape previously returned valid:true. A reader would then act
        // on a frontier with no capture time (stale vs current is undecidable), no expiry (expired vs
        // live is undecidable), and no scope (whose obligations are these?) — each omission converting
        // a DETECTABLE tear into a confident wrong answer.
        const {valid, errors} = validateLifecycleFrontier({
            schemaVersion: 'lifecycle-frontier.v1',
            status       : 'empty',
            notAuthority : true,
            items        : []
        }, {shapeOnly: true});

        expect(valid).toBe(false);
        expect(errors.join(' ')).toContain('capturedAt must be a parseable ISO timestamp');
        expect(errors.join(' ')).toContain('sourceWatermark is required');
        expect(errors.join(' ')).toContain('expiresAt must be a parseable ISO timestamp');
        expect(errors.join(' ')).toContain('scope is required');
        expect(errors.join(' ')).toContain('coverage is required');
    });

    test('the guard rejects a foreign-capable scope and a missing coverage shape, still without throwing', () => {
        const attestedNoId = validateLifecycleFrontier({
            schemaVersion  : 'lifecycle-frontier.v1',
            status         : 'fresh',
            capturedAt     : '2026-07-16T12:00:00.000Z',
            sourceWatermark: '2026-07-16T12:00:00.000Z',
            expiresAt      : '2026-07-16T12:05:00.000Z',
            scope          : {resolution: 'agent-instance', agentId: null},
            coverage       : {sources: [], degradedSources: []},
            items          : [],
            notAuthority   : true
        }, {shapeOnly: true});

        // an attested category with no identity cannot be checked against the reader — reject it
        expect(attestedNoId.valid).toBe(false);
        expect(attestedNoId.errors.join(' ')).toContain('attested scope must carry a non-empty agentId');

        const badCoverage = validateLifecycleFrontier({
            schemaVersion  : 'lifecycle-frontier.v1',
            status         : 'degraded',
            capturedAt     : '2026-07-16T12:00:00.000Z',
            sourceWatermark: '2026-07-16T12:00:00.000Z',
            expiresAt      : '2026-07-16T12:05:00.000Z',
            scope          : {resolution: 'omitted', agentId: null},
            coverage       : {sources: 'all'},
            items          : [],
            notAuthority   : true
        }, {shapeOnly: true});

        expect(badCoverage.valid).toBe(false);
        expect(badCoverage.errors.join(' ')).toContain('coverage.sources must be an array');
    });
});
