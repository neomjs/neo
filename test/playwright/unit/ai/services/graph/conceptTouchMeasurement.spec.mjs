import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'ConceptTouchMeasurementTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

import {
    VISIBILITY_TIERS,
    buildConceptTouchMeasurement,
    buildConceptTouchProfiles,
    detectRederivationCandidates,
    extractConceptTouchEvents,
    readTaggedConceptGraph,
    renderConceptTouchMeasurementMarkdown,
    resolveAggregateTrustTier,
    resolveAggregateVisibility,
    resolveVisibilityTier
} from '../../../../../../ai/services/graph/conceptTouchMeasurement.mjs';

const NODES = [
    {
        id        : 'MESSAGE:1',
        type      : 'MESSAGE',
        properties: {
            from     : '@neo-gpt',
            sentAt   : '2026-07-02T10:00:00.000Z',
            sessionId: 'session-1',
            userId   : 'neo-gpt',
            trustTier: 'peer-trusted'
        }
    },
    {
        id        : 'MESSAGE:2',
        type      : 'MESSAGE',
        properties: {
            from        : '@neo-gpt',
            sentAt      : '2026-07-02T12:00:00.000Z',
            sessionId   : 'session-2',
            visibility  : 'team',
            sharedEntity: true,
            trustTier   : 'peer-trusted'
        }
    },
    {
        id        : 'MESSAGE:3',
        type      : 'MESSAGE',
        properties: {
            from      : '@neo-opus-vega',
            sentAt    : '2026-07-02T13:00:00.000Z',
            sessionId : 'session-3',
            visibility: 'public',
            trustTier : 'external'
        }
    },
    {
        id        : 'MESSAGE:missing-tier',
        type      : 'MESSAGE',
        properties: {
            from     : '@neo-gpt',
            sentAt   : '2026-07-02T14:00:00.000Z',
            sessionId: 'session-4'
        }
    },
    {
        id        : 'CONCEPT:GoldenPath',
        type      : 'CONCEPT',
        properties: {
            visibility: 'team',
            trustTier : 'peer-trusted'
        }
    },
    {
        id        : 'CONCEPT:DreamPipeline',
        type      : 'CONCEPT',
        properties: {
            visibility: 'public',
            trustTier : 'peer-trusted'
        }
    }
];

const EDGES = [
    {
        id        : 'e1',
        source    : 'MESSAGE:1',
        target    : 'CONCEPT:GoldenPath',
        type      : 'TAGGED_CONCEPT',
        properties: {
            timestamp: '2026-07-02T10:00:01.000Z',
            userId   : 'neo-gpt',
            weight   : 1.0
        }
    },
    {
        id        : 'e2',
        source    : 'MESSAGE:2',
        target    : 'CONCEPT:GoldenPath',
        type      : 'TAGGED_CONCEPT',
        properties: {
            timestamp   : '2026-07-02T12:00:01.000Z',
            sharedEntity: true,
            weight      : 1.0
        }
    },
    {
        id        : 'e3',
        source    : 'MESSAGE:3',
        target    : 'CONCEPT:DreamPipeline',
        type      : 'TAGGED_CONCEPT',
        properties: {
            timestamp : '2026-07-02T13:00:01.000Z',
            visibility: 'public',
            weight    : 0.8
        }
    },
    {
        id        : 'e4',
        source    : 'MESSAGE:missing-tier',
        target    : 'CONCEPT:DreamPipeline',
        type      : 'TAGGED_CONCEPT',
        properties: {
            timestamp: '2026-07-02T14:00:01.000Z',
            weight   : 1.0
        }
    }
];

test.describe('Neo.ai.services.graph.conceptTouchMeasurement (#14506)', () => {
    test('resolveVisibilityTier maps live RLS fields instead of a phantom privacyTier', () => {
        expect(resolveVisibilityTier({properties: {visibility: 'private'}})).toBe(VISIBILITY_TIERS.PRIVATE);
        expect(resolveVisibilityTier({properties: {visibility: 'team'}})).toBe(VISIBILITY_TIERS.TEAM);
        expect(resolveVisibilityTier({properties: {sharedEntity: true}})).toBe(VISIBILITY_TIERS.TEAM);
        expect(resolveVisibilityTier({properties: {userId: 'neo-gpt'}})).toBe(VISIBILITY_TIERS.PRIVATE);
        expect(resolveVisibilityTier({properties: {userId: null}})).toBe(VISIBILITY_TIERS.PUBLIC);
        expect(resolveVisibilityTier({properties: {}})).toBeNull();
    });

    test('resolveAggregateVisibility excludes missing tiers and propagates the most restrictive boundary', () => {
        const aggregate = resolveAggregateVisibility([
            {id: 'public', properties: {visibility: 'public'}},
            {id: 'team', properties: {visibility: 'team'}},
            {id: 'private', properties: {userId: 'neo-gpt'}}
        ]);

        expect(aggregate.visibilityTier).toBe('private');
        expect(aggregate.missing).toEqual([]);

        const missing = resolveAggregateVisibility([
            {id: 'known', properties: {visibility: 'team'}},
            {id: 'unknown', properties: {}}
        ]);

        expect(missing.visibilityTier).toBeNull();
        expect(missing.missing).toEqual(['unknown']);
    });

    test('resolveAggregateTrustTier uses most-restrictive-source semantics', () => {
        expect(resolveAggregateTrustTier([
            {properties: {trustTier: 'peer-trusted'}},
            {properties: {sourceTrustTier: 'external'}}
        ])).toBe('external');

        expect(resolveAggregateTrustTier([{properties: {}}])).toBe('unclassified');
    });

    test('extractConceptTouchEvents builds eligible events and excludes missing visibility boundaries', () => {
        const {events, excluded} = extractConceptTouchEvents({nodes: NODES, edges: EDGES});

        expect(events).toHaveLength(3);
        expect(excluded).toEqual([
            {
                edgeId   : 'e4',
                conceptId: 'CONCEPT:DreamPipeline',
                reason   : 'missing-visibility-tier',
                missing  : ['MESSAGE:missing-tier', 'e4']
            }
        ]);

        expect(events[0]).toMatchObject({
            agentId       : '@neo-gpt',
            conceptId     : 'CONCEPT:GoldenPath',
            sessionId     : 'session-1',
            visibilityTier: 'private',
            trustTier     : 'peer-trusted',
            weightBucket  : 'weight-1.0'
        });

        expect(events[2]).toMatchObject({
            agentId     : '@neo-opus-vega',
            conceptId   : 'CONCEPT:DreamPipeline',
            trustTier   : 'external',
            weightBucket: 'weight-other'
        });
    });

    test('buildConceptTouchProfiles normalizes by each agent own history', () => {
        const {events} = extractConceptTouchEvents({nodes: NODES, edges: EDGES});
        const profiles = buildConceptTouchProfiles(events);

        const gpt = profiles.find(profile => profile.agentId === '@neo-gpt');

        expect(gpt.touchCount).toBe(2);
        expect(gpt.conceptsTouched).toBe(1);
        expect(gpt.revisitCount).toBe(1);
        expect(gpt.normalizedRevisitRate).toBe(0.5);
        expect(gpt.visibilityMix).toEqual({private: 1, team: 1});
    });

    test('detectRederivationCandidates emits confidence-bearing candidates, not verdicts', () => {
        const {events} = extractConceptTouchEvents({nodes: NODES, edges: EDGES});

        expect(detectRederivationCandidates({events})).toEqual([
            expect.objectContaining({
                agentId         : '@neo-gpt',
                conceptId       : 'CONCEPT:GoldenPath',
                confidence      : 0.5,
                reason          : 'history-only-no-retrieval-log-yet',
                currentSessionId: 'session-2'
            })
        ]);

        expect(detectRederivationCandidates({
            events,
            retrievalEvents: [{
                agentId         : '@neo-gpt',
                sessionId       : 'session-2',
                occurredAt      : '2026-07-02T11:59:00.000Z',
                resolvedConcepts: ['CONCEPT:GoldenPath'],
                walkContributed : true
            }]
        })).toEqual([]);

        expect(detectRederivationCandidates({
            events: events
                .filter(event => event.agentId === '@neo-gpt')
                .map(event => ({...event, sessionId: null}))
        })).toEqual([
            expect.objectContaining({
                confidence: 0.35,
                reason    : 'history-only-missing-session-boundary'
            })
        ]);
    });

    test('buildConceptTouchMeasurement + renderConceptTouchMeasurementMarkdown produce the artifact shape', () => {
        const report = buildConceptTouchMeasurement({
            nodes      : NODES,
            edges      : EDGES,
            generatedAt: '2026-07-02T15:00:00.000Z'
        });

        expect(report.counts).toEqual({
            taggedConceptEdges : 4,
            eligibleEvents     : 3,
            eventsWithSessionId: 3,
            excludedEvents     : 1,
            retrievalEvents    : 0
        });
        expect(report.profiles).toHaveLength(2);
        expect(report.rederivationEvents).toHaveLength(1);

        const md = renderConceptTouchMeasurementMarkdown(report);

        expect(md).toContain('Diagnostics-only measurement');
        expect(md).toContain('current substrate has no `privacyTier` field');
        expect(md).toContain('| @neo-gpt | 2 | 1 | 1 | 1 | 0.5 | private:1, team:1 | peer-trusted:2 | weight-1.0:2 |');
        expect(md).toContain('## Study Codebook Mapping');
        expect(md).toContain('#14504 retrieval events add');
    });

    test('readTaggedConceptGraph reads SQLite rows and performs zero writes', () => {
        let   wrote        = false;
        const graphService = {
            db: {
                storage: {
                    db: {
                        prepare(sql) {
                            if (/INSERT|UPDATE|DELETE/i.test(sql)) {
                                wrote = true;
                            }

                            if (sql.startsWith('SELECT id, source, target, type, data, user_id FROM Edges')) {
                                return {
                                    all: () => [{
                                        id     : 'edge-1',
                                        source : 'MESSAGE:1',
                                        target : 'CONCEPT:GoldenPath',
                                        type   : 'TAGGED_CONCEPT',
                                        data   : JSON.stringify({properties: {timestamp: '2026-07-02T10:00:00.000Z'}}),
                                        user_id: 'neo-gpt'
                                    }]
                                }
                            }

                            if (sql.startsWith('SELECT id, data, user_id FROM Nodes')) {
                                return {
                                    get: id => ({
                                        id,
                                        data   : JSON.stringify({
                                            label     : id.startsWith('CONCEPT:') ? 'CONCEPT' : 'MESSAGE',
                                            properties: {visibility: 'team'}
                                        }),
                                        user_id: null
                                    })
                                }
                            }

                            throw new Error(`Unexpected SQL: ${sql}`)
                        }
                    }
                }
            }
        };

        const graph = readTaggedConceptGraph({graphService});

        expect(wrote).toBe(false);
        expect(graph.edges).toHaveLength(1);
        expect(graph.nodes.map(node => node.id).sort()).toEqual(['CONCEPT:GoldenPath', 'MESSAGE:1']);
        expect(typeof graph.readAt).toBe('string');
    });
});
