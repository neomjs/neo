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
    WALK_BUDGET,
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

    test('exact full-query key beats token matches and unifies the format/case/separator variants in one cluster', () => {
        const resolved = resolveConcepts({graphService: SPINE, query: 'golden path'});

        expect(resolved[0].clusterKey).toBe('golden-path');
        expect(resolved[0].matchType).toBe('exact-key');
        expect(resolved[0].score).toBe(1.0);
        // the case/separator/format variants share the normalized cluster key → one entry
        expect(resolved[0].members).toEqual(['CONCEPT:GoldenPath', 'CONCEPT:Golden_Path', 'golden-path']);

        // honest scope boundary: a semantically-distinct form normalizes to a DIFFERENT key, so it is
        // correctly ITS OWN cluster — NOT folded into golden-path (unifying true aliasOf synonyms via
        // the canonical concept-spine map is the follow-up alias RA, not the normalizer's job).
        const synthesis = resolved.find(c => c.clusterKey === 'golden-path-synthesis');
        expect(synthesis?.members).toEqual(['CONCEPT:Golden Path Synthesis']);
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
            ['event', 'query', 'resolvedConcepts', 'walkContributed', 'candidatesAdded', 'filteredOut', 'walkDurationMs']
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
        expect(walked.conceptPath.rootConcept).toBe('golden-path');
        expect(walked.conceptPath.depth).toBe(1);
        expect(walked.conceptPath.hops).toHaveLength(1);
        expect(walked.conceptPath.hops[0]).toMatchObject({edgeType: 'TAGGED_CONCEPT', neighborLabel: 'MEMORY', axes: {authority: ['trustTier']}}); // degrade-by-omission
        expect(typeof walked.conceptPath.hops[0].readAt).toBe('string');     // churn stamp present (value clock-derived — not asserted)
        expect(walked.provenance).toBeUndefined();                            // provenance now lives PER-HOP inside conceptPath

        // event honesty: the two ungated hops (FILE:x, MEM:2) are counted, not hidden
        expect(event).toMatchObject({
            event          : 'concept-walk-retrieval', query: 'golden path', resolvedConcepts: ['golden-path'],
            walkContributed: true, candidatesAdded: 1, filteredOut: 2
        });
        expect(events).toHaveLength(1);
    });

    test('conceptPath carries the COMPLETE ordered path with per-hop provenance at depth 2 (not terminal-only)', async () => {
        // golden-path --IMPLEMENTED_BY--> FILE:helper --TAGGED_CONCEPT--> MEM:deep
        const deepGraph = fixtureGraph({
            concepts: [{type: 'CONCEPT', id: 'golden-path'}],
            nodes   : {
                'golden-path': {label: 'CONCEPT'},
                'FILE:helper': {label: 'FILE'},
                'MEM:deep'   : {label: 'MEMORY'}
            },
            edges: [
                {id: 'd1', source: 'golden-path', target: 'FILE:helper', type: 'IMPLEMENTED_BY', properties: {}},
                {id: 'd2', source: 'FILE:helper', target: 'MEM:deep',    type: 'TAGGED_CONCEPT', properties: {trustTier: 'peer-trusted'}}
            ]
        });

        // authorize only the terminal MEM:deep — FILE:helper is an intermediate hop, not a candidate
        const gate = async nodeId => nodeId === 'MEM:deep' ? {id: 'MEM:deep'} : null;

        const {candidates} = await enrichWithConceptWalk({
            graphService: deepGraph, query: 'golden path', candidates: [], conceptWalk: true, resolveCandidate: gate, maxHops: 2
        });

        const deep = candidates.find(c => c.id === 'MEM:deep');
        expect(deep, 'the depth-2 memory surfaced').toBeTruthy();
        expect(deep.conceptPath.rootConcept).toBe('golden-path');
        expect(deep.conceptPath.depth).toBe(2);
        // BOTH hops, ordered root→candidate — hop-1 (the intermediate FILE edge) is NOT dropped
        expect(deep.conceptPath.hops.map(h => h.edgeType)).toEqual(['IMPLEMENTED_BY', 'TAGGED_CONCEPT']);
        expect(deep.conceptPath.hops.map(h => h.neighborLabel)).toEqual(['FILE', 'MEMORY']);
        expect(deep.conceptPath.hops[0].axes).toEqual({});                          // hop-1: absent axes omitted
        expect(deep.conceptPath.hops[1].axes).toEqual({authority: ['trustTier']})   // hop-2: present axis carried
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

    test('resolveCandidate receives the hop neighborLabel + edgeType so the gate can skip by type', async () => {
        const seenMeta = [];

        // a label-aware gate: authorize MEMORY-labeled neighbors, skip everything else WITHOUT hydrating
        const labelAwareGate = async (nodeId, meta) => {
            seenMeta.push(meta);
            return meta?.neighborLabel === 'MEMORY' ? {id: nodeId} : null
        };

        const {candidates, event} = await enrichWithConceptWalk({
            graphService: WALK_GRAPH, query: 'golden path', candidates: [],
            conceptWalk : true, resolveCandidate: labelAwareGate, maxHops: 1
        });

        // the gate saw both a MEMORY neighbor and a FILE neighbor, each with an edgeType
        expect(seenMeta.some(m => m.neighborLabel === 'MEMORY')).toBe(true);
        expect(seenMeta.some(m => m.neighborLabel === 'FILE')).toBe(true);
        expect(seenMeta.every(m => 'edgeType' in m)).toBe(true);

        // only MEMORY-labeled nodes authorized; FILE:x skipped by label (never hydrated)
        expect(candidates.map(c => c.id).sort()).toEqual(['MEM:1', 'MEM:2']);
        expect(event.candidatesAdded).toBe(2);
        expect(event.filteredOut).toBe(1);
    });

    test('WALK_BUDGET is the frozen, config-declared traversal budget (the bounded-latency defaults)', () => {
        expect(WALK_BUDGET).toEqual({conceptLimit: 5, maxHops: 2, hopBudget: 80});
        expect(Object.isFrozen(WALK_BUDGET)).toBe(true);
    });

    test('the retrieval event records walkDurationMs from the injected clock (bounded-latency telemetry)', async () => {
        let   clock = 1000;
        const now   = () => { const value = clock; clock += 7; return value }; // each read advances 7ms

        const {event} = await enrichWithConceptWalk({
            graphService    : WALK_GRAPH, query: 'golden path', candidates: [], conceptWalk: true,
            resolveCandidate: memoryGate, now, maxHops: 1
        });

        // now() is read once at walk-start and once at event-build → a deterministic 7ms span
        expect(typeof event.walkDurationMs).toBe('number');
        expect(event.walkDurationMs).toBe(7);
    });

    test('traversableNodeLabels pre-filters candidate types before the gate (a type skip is NOT filteredOut)', async () => {
        const gate = async nodeId => ({id: nodeId}); // authorize anything asked → filteredOut reflects only the type filter

        const {candidates, event} = await enrichWithConceptWalk({
            graphService    : WALK_GRAPH, query: 'golden path', candidates: [], conceptWalk: true,
            resolveCandidate: gate, traversableNodeLabels: ['MEMORY'], maxHops: 1
        });

        // FILE:x is skipped by the type allow-list BEFORE the gate; only the two MEMORY nodes reach it
        expect(candidates.map(c => c.id).sort()).toEqual(['MEM:1', 'MEM:2']);
        expect(event.filteredOut).toBe(0); // the FILE skip is a type-filter skip, not a gate/RLS rejection
    });
});
