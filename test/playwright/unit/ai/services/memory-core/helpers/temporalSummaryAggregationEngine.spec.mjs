import {setup} from '../../../../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'TemporalSummaryAggregationEngineTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';

import {
    buildTemporalSummaryDocument,
    composeAgentRecord,
    composeUnifiedRecord,
    deriveAgentVelocityFields,
    deriveVelocityFields,
    HIGH_IMPACT_THRESHOLD,
    planDailyWindows,
    resolveDailyWindow,
    resolvePartitionKeys,
    VELOCITY_FIELD_SOURCES,
    WINDOW_SCOPED_VELOCITY_FIELDS
} from '../../../../../../../ai/services/memory-core/helpers/temporalSummaryAggregationEngine.mjs';

test.describe('Neo.ai.services.memory-core.temporalSummaryAggregationEngine', () => {
    test('VELOCITY_FIELD_SOURCES pins all six velocity fields to a named source', () => {
        expect(Object.keys(VELOCITY_FIELD_SOURCES).sort()).toEqual([
            'adrsLanded', 'devCommits', 'highImpactSessions', 'mergedPrs', 'sandboxesGraduated', 'sessionsPerAgent'
        ]);
        // every binding names a substrate — prose is never the source of truth
        Object.values(VELOCITY_FIELD_SOURCES).forEach(source => expect(source.length).toBeGreaterThan(0))
    });

    test('deriveVelocityFields folds counts, per-agent sessions, and the impact threshold', () => {
        const fields = deriveVelocityFields({
            mergedPrs : [{number: 1}, {number: 2}, {number: 3}],
            devCommits: [{sha: 'a'}, {sha: 'b'}],
            sessions  : [
                {agentIdentity: '@neo-opus-ada', impact: 95},
                {agentIdentity: '@neo-opus-ada', impact: 40},
                {agentIdentity: '@neo-gpt',      impact: HIGH_IMPACT_THRESHOLD}
            ],
            adrsLanded        : [{id: 'ADR-0028'}],
            sandboxesGraduated: [{ref: 'discussion #1'}, {ref: 'discussion #2'}]
        });

        expect(fields.mergedPrs).toBe(3);
        expect(fields.devCommits).toBe(2);
        expect(fields.adrsLanded).toBe(1);
        expect(fields.sandboxesGraduated).toBe(2);
        // impact >= 90 counts (boundary inclusive); the impact-40 row is excluded
        expect(fields.highImpactSessions).toBe(2);
        expect(fields.sessionsPerAgent).toEqual({'@neo-opus-ada': 2, '@neo-gpt': 1})
    });

    test('deriveVelocityFields folds an empty/absent window to honest zeros — never faked or omitted', () => {
        const fields = deriveVelocityFields();

        expect(fields).toEqual({
            mergedPrs         : 0,
            devCommits        : 0,
            adrsLanded        : 0,
            sandboxesGraduated: 0,
            highImpactSessions: 0,
            sessionsPerAgent  : {}
        })
    });

    test('deriveVelocityFields ignores session rows with no agentIdentity in the per-agent fold', () => {
        const fields = deriveVelocityFields({
            sessions: [{impact: 99}, {agentIdentity: '@neo-opus-ada', impact: 10}]
        });

        expect(fields.sessionsPerAgent).toEqual({'@neo-opus-ada': 1});
        expect(fields.highImpactSessions).toBe(1)
    });

    test('buildTemporalSummaryDocument mints an id + five-field metadata; velocity fields ride the payload, not metadata', () => {
        const velocityFields = deriveVelocityFields({mergedPrs: [{number: 1}]});
        const doc            = buildTemporalSummaryDocument({
            level      : 'daily',
            partition  : 'unified',
            windowStart: '2026-07-05T00:00:00.000Z',
            windowEnd  : '2026-07-06T00:00:00.000Z',
            version    : 1,
            velocityFields
        });

        // metadata is exactly the five-field contract — no velocity leakage into the strict metadata
        expect(Object.keys(doc.metadata).sort()).toEqual(['level', 'partition', 'version', 'windowEnd', 'windowStart']);
        expect(doc.velocityFields.mergedPrs).toBe(1);
        expect(doc.id).toContain('temporal-summary-daily-unified-');
        expect(doc.id).toContain('-v1')
    });

    test('buildTemporalSummaryDocument is idempotent per window+track+version; a version bump mints a new id', () => {
        const base = {
            level         : 'session',
            partition     : '@neo-opus-ada',
            windowStart   : '2026-07-05T00:00:00.000Z',
            windowEnd     : '2026-07-05T01:00:00.000Z',
            velocityFields: {}
        };

        const v1      = buildTemporalSummaryDocument({...base, version: 1});
        const v1again = buildTemporalSummaryDocument({...base, version: 1});
        const v2      = buildTemporalSummaryDocument({...base, version: 2});

        expect(v1.id).toBe(v1again.id);
        expect(v2.id).not.toBe(v1.id)
    });

    test('buildTemporalSummaryDocument fails closed on invalid metadata (inverted window)', () => {
        expect(() => buildTemporalSummaryDocument({
            level         : 'daily',
            partition     : 'unified',
            windowStart   : '2026-07-06T00:00:00.000Z',
            windowEnd     : '2026-07-05T00:00:00.000Z',
            version       : 1,
            velocityFields: {}
        })).toThrow(/windowStart must be strictly before windowEnd/)
    });

    test('resolveDailyWindow returns half-open UTC-day bounds for any anchor within the day', () => {
        const {windowStart, windowEnd} = resolveDailyWindow('2026-07-05T14:37:12.500Z');

        expect(windowStart).toBe('2026-07-05T00:00:00.000Z');
        expect(windowEnd).toBe('2026-07-06T00:00:00.000Z')
    });

    test('resolveDailyWindow fails closed on an unparseable anchor', () => {
        expect(() => resolveDailyWindow('not-a-timestamp')).toThrow(/invalid anchor/)
    });

    test('resolvePartitionKeys returns unified first + a sorted, de-duped per-agent track set', () => {
        expect(resolvePartitionKeys(['@neo-gpt', '@neo-opus-ada', '@neo-gpt'])).toEqual([
            'unified', '@neo-gpt', '@neo-opus-ada'
        ]);
        // blank / non-'@' identities are dropped; an empty window folds to the unified track only
        expect(resolvePartitionKeys(['', 'plain', '@'])).toEqual(['unified']);
        expect(resolvePartitionKeys()).toEqual(['unified'])
    });

    test('composeUnifiedRecord folds the whole window under the unified partition', () => {
        const record = composeUnifiedRecord({
            level      : 'daily',
            windowStart: '2026-07-05T00:00:00.000Z',
            windowEnd  : '2026-07-06T00:00:00.000Z',
            sources    : {mergedPrs: [{n: 1}, {n: 2}], sessions: [{agentIdentity: '@neo-opus-ada', impact: 95}]}
        });

        expect(record.metadata.partition).toBe('unified');
        expect(record.metadata.level).toBe('daily');
        expect(record.metadata.version).toBe(1);
        expect(record.velocityFields.mergedPrs).toBe(2);
        expect(record.velocityFields.highImpactSessions).toBe(1);
        expect(record.id).toContain('temporal-summary-daily-unified-')
    });

    test('WINDOW_SCOPED_VELOCITY_FIELDS pins exactly the four non-agent-attributable window facts', () => {
        expect([...WINDOW_SCOPED_VELOCITY_FIELDS].sort()).toEqual([
            'adrsLanded', 'devCommits', 'mergedPrs', 'sandboxesGraduated'
        ]);
        // the two agent-attributable fields are deliberately absent — they carry measurements per track
        expect(WINDOW_SCOPED_VELOCITY_FIELDS).not.toContain('sessionsPerAgent');
        expect(WINDOW_SCOPED_VELOCITY_FIELDS).not.toContain('highImpactSessions')
    });

    test('deriveAgentVelocityFields nulls every window-scoped field — never 0, never the repeated window count', () => {
        const fields = deriveAgentVelocityFields({
            partition: '@neo-opus-ada',
            sources  : {
                mergedPrs         : [{n: 1}, {n: 2}, {n: 3}],
                devCommits        : [{sha: 'a'}],
                adrsLanded        : [{id: 'ADR-0028'}],
                sandboxesGraduated: [{ref: 'd#1'}],
                sessions          : [{agentIdentity: '@neo-opus-ada', impact: 95}]
            }
        });

        // null asserts "not attributed at this partition" — 0 would assert an unmeasured contribution,
        // and repeating the window count (3 mergedPrs) would double-count across tracks
        WINDOW_SCOPED_VELOCITY_FIELDS.forEach(field => expect(fields[field]).toBeNull());
        expect(fields.mergedPrs).not.toBe(0);
        expect(fields.mergedPrs).not.toBe(3)
    });

    test('deriveAgentVelocityFields attributes only the partition agent\'s sessions', () => {
        const sources = {
            sessions: [
                {agentIdentity: '@neo-opus-ada', impact: 95},
                {agentIdentity: '@neo-opus-ada', impact: 20},
                {agentIdentity: '@neo-gpt',      impact: 99}
            ]
        };

        const ada = deriveAgentVelocityFields({partition: '@neo-opus-ada', sources});

        expect(ada.sessionsPerAgent).toEqual({'@neo-opus-ada': 2});
        // @neo-gpt's impact-99 session belongs to its own track, never to Ada's
        expect(ada.highImpactSessions).toBe(1);

        const gpt = deriveAgentVelocityFields({partition: '@neo-gpt', sources});

        expect(gpt.sessionsPerAgent).toEqual({'@neo-gpt': 1});
        expect(gpt.highImpactSessions).toBe(1)
    });

    test('deriveAgentVelocityFields folds an agent with no sessions in the window to honest empties', () => {
        const fields = deriveAgentVelocityFields({partition: '@neo-opus-vega', sources: {mergedPrs: [{n: 1}]}});

        expect(fields.sessionsPerAgent).toEqual({});
        expect(fields.highImpactSessions).toBe(0);
        expect(fields.mergedPrs).toBeNull()
    });

    test('deriveAgentVelocityFields fails closed on the unified track or a malformed identity', () => {
        expect(() => deriveAgentVelocityFields({partition: 'unified'})).toThrow(/expected a per-agent/);
        expect(() => deriveAgentVelocityFields({partition: 'plain'})).toThrow(/expected a per-agent/);
        expect(() => deriveAgentVelocityFields({partition: '@'})).toThrow(/expected a per-agent/);
        expect(() => deriveAgentVelocityFields({})).toThrow(/expected a per-agent/)
    });

    test('composeAgentRecord composes a per-agent track record; the unified track keeps the window facts', () => {
        const
            window  = {level: 'daily', windowStart: '2026-07-05T00:00:00.000Z', windowEnd: '2026-07-06T00:00:00.000Z'},
            sources = {mergedPrs: [{n: 1}, {n: 2}], sessions: [{agentIdentity: '@neo-opus-ada', impact: 95}]},
            agent   = composeAgentRecord({...window, partition: '@neo-opus-ada', sources}),
            unified = composeUnifiedRecord({...window, sources});

        expect(agent.metadata.partition).toBe('@neo-opus-ada');
        expect(agent.velocityFields.mergedPrs).toBeNull();
        expect(agent.velocityFields.highImpactSessions).toBe(1);
        expect(agent.id).toContain('temporal-summary-daily-neo-opus-ada-');

        // same window, same source rows: the window fact is attributed once, on the unified track only
        expect(unified.velocityFields.mergedPrs).toBe(2);
        expect(agent.id).not.toBe(unified.id)
    });

    test('planDailyWindows returns contiguous most-recent-first UTC-day windows, bounded by dayCount', () => {
        const windows = planDailyWindows({anchor: '2026-07-06T14:00:00.000Z', dayCount: 3});

        expect(windows).toEqual([
            {windowStart: '2026-07-06T00:00:00.000Z', windowEnd: '2026-07-07T00:00:00.000Z'},
            {windowStart: '2026-07-05T00:00:00.000Z', windowEnd: '2026-07-06T00:00:00.000Z'},
            {windowStart: '2026-07-04T00:00:00.000Z', windowEnd: '2026-07-05T00:00:00.000Z'}
        ]);
        // contiguous: each window's end is the next-newer window's start
        expect(windows[1].windowEnd).toBe(windows[0].windowStart);
        // dayCount coerces to >= 1
        expect(planDailyWindows({anchor: '2026-07-06T00:00:00.000Z', dayCount: 0})).toHaveLength(1)
    })
});
