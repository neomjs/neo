import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'ConceptAnchoredRetrievalTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

import {
    RETRIEVAL_EVENT_SCHEMA,
    resolveConcepts,
    tokenizeQuery
} from '../../../../../../ai/services/graph/conceptAnchoredRetrieval.mjs';

/**
 * Minimal read-only seam fixture: the resolver consumes only listNodeRecordsByType.
 */
function fixtureService(ids) {
    return {
        listNodeRecordsByType({type}) {
            return {records: ids.filter(e => e.type === type).map(e => ({id: e.id}))}
        }
    }
}

const SPINE = fixtureService([
    {type: 'CONCEPT', id: 'golden-path'},
    {type: 'CONCEPT', id: 'CONCEPT:GoldenPath'},
    {type: 'CONCEPT', id: 'CONCEPT:Golden_Path'},
    {type: 'CONCEPT', id: 'CONCEPT:Golden Path Synthesis'},
    {type: 'CONCEPT', id: 'delta-updates'},
    {type: 'CLASS',   id: 'CLASS:DreamPipeline'},
    {type: 'CONCEPT', id: 'dream-pipeline'},
    {type: 'CONCEPT', id: 'CONCEPT:round-robin-routing'}
]);

test.describe('Neo.ai.services.graph.conceptAnchoredRetrieval (#14504)', () => {

    test('tokenizeQuery lowercases, splits, drops short tokens, dedupes', () => {
        expect(tokenizeQuery('How do Golden PATH golden deltas flow?')).toEqual(['how', 'golden', 'path', 'deltas', 'flow']);
        expect(tokenizeQuery('')).toEqual([]);
    });

    test('exact full-query key beats token matches and unifies ALL aliases in one cluster entry', () => {
        const resolved = resolveConcepts({graphService: SPINE, query: 'golden path'});

        expect(resolved[0].clusterKey).toBe('golden-path');
        expect(resolved[0].matchType).toBe('exact-key');
        expect(resolved[0].score).toBe(1.0);
        // Alias tolerance: every minted convention of the fragmented concept in ONE entry.
        expect(resolved[0].members).toEqual(['CONCEPT:GoldenPath', 'CONCEPT:Golden_Path', 'golden-path']);
    });

    test('bigram keys outrank single-token containment', () => {
        const resolved = resolveConcepts({graphService: SPINE, query: 'explain dream pipeline internals'});
        const dream    = resolved.find(c => c.clusterKey === 'dream-pipeline');

        expect(dream).toBeTruthy();
        expect(dream.matchType).toBe('bigram-key');
        expect(dream.members).toEqual(['CLASS:DreamPipeline', 'dream-pipeline']);
    });

    test('no-match queries resolve to an empty set (wrap contributes nothing)', () => {
        expect(resolveConcepts({graphService: SPINE, query: 'kubernetes ingress controllers'})).toEqual([]);
        expect(resolveConcepts({graphService: SPINE, query: ''})).toEqual([]);
    });

    test('resolver is deterministic and bounded by limit', () => {
        const a = resolveConcepts({graphService: SPINE, query: 'golden path dream pipeline delta updates', limit: 2});
        const b = resolveConcepts({graphService: SPINE, query: 'golden path dream pipeline delta updates', limit: 2});

        expect(a).toEqual(b);
        expect(a.length).toBeLessThanOrEqual(2);
    });

    test('the retrieval-event schema names the #14506 feed contract', () => {
        expect(Object.keys(RETRIEVAL_EVENT_SCHEMA)).toEqual(
            ['event', 'query', 'resolvedConcepts', 'walkContributed', 'candidatesAdded', 'filteredOut']
        );
    });
});
