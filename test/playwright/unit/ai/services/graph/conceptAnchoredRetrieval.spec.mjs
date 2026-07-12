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
    describeHopProvenance,
    enrichWithConceptWalk,
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

/**
 * Full read-only graph seam: the resolver reads `listNodeRecordsByType`; the walk reads RAW edges via
 * `db.storage.db.prepare().all()` and node labels via `db.nodes.get()` — both faked here (the raw
 * read bypasses the weight-only projection by design), keeping the enrichment test hermetic.
 */
function fixtureGraph({concepts = [], edges = [], nodes = {}}) {
    return {
        listNodeRecordsByType({type}) {
            return {records: concepts.filter(c => c.type === type).map(c => ({id: c.id}))}
        },
        db: {
            nodes  : {get(id) { return nodes[id] || null }},
            storage: {
                db: {
                    prepare() {
                        return {
                            all(nodeId) {
                                return edges
                                    .filter(e => e.source === nodeId || e.target === nodeId)
                                    .map(e => ({
                                        id    : e.id,
                                        source: e.source,
                                        target: e.target,
                                        type  : e.type,
                                        data  : JSON.stringify({properties: e.properties || {}})
                                    }))
                            }
                        }
                    }
                }
            }
        }
    }
}

const WALK_GRAPH = fixtureGraph({
    concepts: [{type: 'CONCEPT', id: 'golden-path'}],
    nodes   : {
        'golden-path': {label: 'CONCEPT'},
        'MEM:1'      : {label: 'MEMORY'},
        'MEM:2'      : {label: 'MEMORY'},
        'FILE:x'     : {label: 'FILE'}
    },
    edges: [
        // authority axis PRESENT (trustTier); reaches an authorized memory
        {id: 'e1', source: 'golden-path', target: 'MEM:1',  type: 'TAGGED_CONCEPT', properties: {trustTier: 'peer-trusted'}},
        // all axes ABSENT; reaches a file the caller gate won't hydrate → filteredOut
        {id: 'e2', source: 'golden-path', target: 'FILE:x', type: 'IMPLEMENTED_BY', properties: {}},
        // all axes absent; reaches an UNauthorized memory (gate returns null) → filteredOut
        {id: 'e3', source: 'golden-path', target: 'MEM:2',  type: 'TAGGED_CONCEPT', properties: {}}
    ]
});

// Caller gate: hydrate + authorize MEM:1 only; FILE:* and MEM:2 are not authorized/retrievable.
async function memoryGate(nodeId) {
    return nodeId === 'MEM:1' ? {id: 'MEM:1', text: 'golden path memory'} : null
}

test.describe('Neo.ai.services.graph.conceptAnchoredRetrieval — enrichWithConceptWalk (#14504)', () => {

    test('describeHopProvenance carries present axes and OMITS absent ones (degrade-by-omission)', () => {
        const prov = describeHopProvenance({
            readAt      : '2026-07-12T00:00:00.000Z',
            axisPresence: {
                authority           : {present: true,  keys: ['trustTier']},
                fidelity            : {present: false, keys: []},
                extractionProvenance: {present: false, keys: []},
                lifecycle           : {present: false, keys: []}
            }
        });

        expect(prov.readAt).toBe('2026-07-12T00:00:00.000Z');
        expect(prov.axes).toEqual({authority: ['trustTier']});   // absent axes OMITTED, never null/false
        expect('fidelity' in prov.axes).toBe(false);
    });

    test('conceptWalk OFF returns the flat candidates by reference — byte-identical, no walk, no event', async () => {
        const flat    = [{id: 'EMB:1'}, {id: 'EMB:2'}];
        let   emitted = 0;

        const result = await enrichWithConceptWalk({
            graphService: WALK_GRAPH, query: 'golden path', candidates: flat,
            conceptWalk : false, resolveCandidate: memoryGate, emit: () => emitted++
        });

        expect(result.candidates).toBe(flat);   // SAME reference — the flat path is untouched
        expect(result.event).toBeNull();
        expect(emitted).toBe(0);
    });

    test('conceptWalk ON but nothing resolves: flat path untouched, honest zero event still emitted', async () => {
        const flat   = [{id: 'EMB:1'}];
        const events = [];

        const result = await enrichWithConceptWalk({
            graphService: WALK_GRAPH, query: 'kubernetes ingress controllers', candidates: flat,
            conceptWalk : true, resolveCandidate: memoryGate, emit: e => events.push(e)
        });

        expect(result.candidates).toBe(flat);
        expect(result.event.resolvedConcepts).toEqual([]);
        expect(result.event.walkContributed).toBe(false);
        expect(result.event.candidatesAdded).toBe(0);
        expect(events).toHaveLength(1);
    });

    test('conceptWalk ON: authorized walk candidates append AFTER the untouched flat set, stamped + evented', async () => {
        const flat   = [{id: 'EMB:1'}];
        const events = [];

        const {candidates, event} = await enrichWithConceptWalk({
            graphService: WALK_GRAPH, query: 'golden path', candidates: flat,
            conceptWalk : true, resolveCandidate: memoryGate, emit: e => events.push(e), maxHops: 1
        });

        // wrap: the embedding candidate is first and untouched
        expect(candidates[0]).toEqual({id: 'EMB:1'});
        expect(candidates).toHaveLength(2);

        // the one authorized walk candidate, appended + fully stamped
        const walked = candidates[1];

        expect(walked.id).toBe('MEM:1');
        expect(walked.via).toBe('concept-walk');
        expect(walked.conceptPath).toEqual({rootConcept: 'golden-path', depth: 1, edgeType: 'TAGGED_CONCEPT', neighborLabel: 'MEMORY'});
        expect(walked.provenance.axes).toEqual({authority: ['trustTier']});   // degrade-by-omission

        // event honesty: the two ungated hops (FILE:x, MEM:2) are counted, not hidden
        expect(event).toMatchObject({
            event          : 'concept-walk-retrieval', query: 'golden path', resolvedConcepts: ['golden-path'],
            walkContributed: true, candidatesAdded: 1, filteredOut: 2
        });
        expect(events).toHaveLength(1);
    });

    test('absent resolveCandidate fails closed — every walk node is filteredOut, nothing surfaces', async () => {
        const flat = [{id: 'EMB:1'}];

        const {candidates, event} = await enrichWithConceptWalk({
            graphService: WALK_GRAPH, query: 'golden path', candidates: flat, conceptWalk: true, maxHops: 1
        });

        expect(candidates).toEqual([{id: 'EMB:1'}]);   // nothing surfaces without a gate
        expect(event.candidatesAdded).toBe(0);
        expect(event.walkContributed).toBe(false);
        expect(event.filteredOut).toBe(3);   // MEM:1, FILE:x, MEM:2 — all ungated
    });

    test('a walk node already in the embedding set is deduped, never duplicated', async () => {
        const flat = [{id: 'EMB:1'}, {id: 'MEM:1'}];   // MEM:1 already came from the flat path

        const {candidates, event} = await enrichWithConceptWalk({
            graphService: WALK_GRAPH, query: 'golden path', candidates: flat,
            conceptWalk : true, resolveCandidate: memoryGate, maxHops: 1
        });

        expect(candidates).toHaveLength(2);                                       // no duplicate MEM:1
        expect(candidates.filter(c => c.id === 'MEM:1')).toHaveLength(1);
        expect(candidates.some(c => c.via === 'concept-walk')).toBe(false);       // MEM:1 stays the flat one
        expect(event.candidatesAdded).toBe(0);
        expect(event.filteredOut).toBe(2);                                        // MEM:1 deduped BEFORE the gate
    });
});
