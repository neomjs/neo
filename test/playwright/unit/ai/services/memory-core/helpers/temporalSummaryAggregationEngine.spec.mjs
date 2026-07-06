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
    deriveVelocityFields,
    HIGH_IMPACT_THRESHOLD,
    VELOCITY_FIELD_SOURCES
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
    })
});
