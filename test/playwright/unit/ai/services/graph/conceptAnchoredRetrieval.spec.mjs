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
    CONCEPT_EXPANSION_EDGE_TYPES,
    KB_TERMINAL_EDGE_TYPES,
    MEMORY_TERMINAL_EDGE_TYPES,
    RETRIEVAL_EVENT_SCHEMA,
    WALK_BUDGET,
    describeHopProvenance,
    enrichWithConceptWalk,
    resolveConcepts,
    tokenizeQuery
} from '../../../../../../ai/services/graph/conceptAnchoredRetrieval.mjs';
import GraphService from '../../../../../../ai/services/memory-core/GraphService.mjs';

/**
 * Minimal read-only seam fixture: the resolver consumes only listNodeRecordsByType.
 */
function fixtureService(ids) {
    return {
        listNodeRecordsByType({type}) {
            return {records: ids.filter(e => e.type === type).map(e => ({id: e.id, properties: e.properties || {}}))}
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

    test('resolveConcepts degrades on a not-ready / throwing graph — returns empty, never propagates (#15071 GraphService.ready coverage)', () => {
        // A not-ready graph (mid-init / locked store) whose listNodeRecordsByType throws must degrade to
        // no concepts, not propagate. This is why a proactive GraphService.ready() check is redundant:
        // BOTH enrich graph-read sites are guarded — resolveConcepts here, and the raw-edge walk — so a
        // not-ready graph simply contributes nothing and the flat embedding path stands untouched.
        const notReadyGraph = {listNodeRecordsByType: () => { throw new Error('graph not ready'); }};

        expect(resolveConcepts({graphService: notReadyGraph, query: 'golden path'})).toEqual([]);
    });

    test('resolveConcepts consumes the concept-spine canonicalConceptId — a stamped aliasOf synonym unifies into its canonical cluster (#14528 alias RA)', () => {
        // "Golden Path Synthesis" normalizes to a DIFFERENT mechanical key (golden-path-synthesis), so
        // the plain normalizer keeps it separate (the "honest scope boundary" above). But the defrag
        // stamped it aliasOf golden-path — consuming that canonicalConceptId folds it into the
        // golden-path cluster (the concept-spine alias-map unification).
        const stamped = fixtureService([
            {type: 'CONCEPT', id: 'golden-path'},
            {type: 'CONCEPT', id: 'CONCEPT:Golden Path Synthesis', properties: {canonicalConceptId: 'golden-path'}}
        ]);

        const resolved = resolveConcepts({graphService: stamped, query: 'golden path'});

        expect(resolved[0].clusterKey).toBe('golden-path');
        // the stamped synonym now shares the canonical cluster — not its own separate entry
        expect(resolved[0].members).toContain('CONCEPT:Golden Path Synthesis');
        expect(resolved[0].members).toContain('golden-path');
        expect(resolved.some(cluster => cluster.clusterKey === 'golden-path-synthesis')).toBe(false);
    });

    test('resolver is deterministic and bounded by limit', () => {
        const a = resolveConcepts({graphService: SPINE, query: 'golden path dream pipeline delta updates', limit: 2});
        const b = resolveConcepts({graphService: SPINE, query: 'golden path dream pipeline delta updates', limit: 2});

        expect(a).toEqual(b);
        expect(a.length).toBeLessThanOrEqual(2);
    });

    test('the retrieval-event schema names the #14506 feed contract', () => {
        expect(Object.keys(RETRIEVAL_EVENT_SCHEMA)).toEqual(
            ['event', 'query', 'resolvedConcepts', 'walkContributed', 'candidatesAdded', 'filteredOut', 'walkDurationMs', 'truncated']
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

    test('conceptWalk ON but the graph store THROWS mid-walk: degrades to the flat set, never breaks the query (#14504 robustness)', async () => {
        const flat   = [{id: 'EMB:1'}, {id: 'EMB:2'}];
        const events = [];

        // The concept resolves (so the walk runs), but the raw-edge query throws — the graph-down case
        // that MUST degrade rather than crash: readRawNodeEdges guards a MISSING db, not a db that
        // throws on the query. augment-never-displace has to hold even when the graph is unavailable.
        const throwingGraph = {
            listNodeRecordsByType: ({type}) => ({records: type === 'CONCEPT' ? [{id: 'golden-path'}] : []}),
            db                   : {
                nodes  : {get: () => ({label: 'CONCEPT'})},
                storage: {db: {prepare() { throw new Error('graph store unavailable') }}}
            }
        };

        const {candidates, event} = await enrichWithConceptWalk({
            graphService: throwingGraph, query: 'golden path', candidates: flat,
            conceptWalk : true, resolveCandidate: memoryGate, emit: e => events.push(e)
        });

        expect(candidates).toEqual(flat);          // the flat set is returned intact — the opt-in never broke the query
        expect(candidates).toHaveLength(2);
        expect(event.walkContributed).toBe(false); // honest: nothing surfaced
        expect(event.candidatesAdded).toBe(0);
        expect(events).toHaveLength(1);            // the event still emits — degradation is observable, not silent
    });

    test('request-global hop budget: an exhausting first member truncates + stops later members; an exact-fit budget walks all + does NOT overfire truncated (#14504 cycle-2 gate 2)', async () => {
        // Two resolvable concepts, each with one edge to an authorizable memory. With a shared hopBudget
        // of 1, the FIRST member's walk consumes the whole request-global budget (→ 0), so the second
        // member is NOT walked and its memory never surfaces. A per-member reset (the pre-fix behavior)
        // would have walked both and added two — this asserts the budget is genuinely request-global.
        const budgetGraph = fixtureGraph({
            concepts: [{type: 'CONCEPT', id: 'alpha'}, {type: 'CONCEPT', id: 'beta'}],
            nodes   : {
                alpha  : {label: 'CONCEPT'},
                beta   : {label: 'CONCEPT'},
                'MEM:A': {label: 'MEMORY'},
                'MEM:B': {label: 'MEMORY'}
            },
            edges   : [
                {id: 'ea', source: 'alpha', target: 'MEM:A', type: 'TAGGED_CONCEPT', properties: {}},
                {id: 'eb', source: 'beta',  target: 'MEM:B', type: 'TAGGED_CONCEPT', properties: {}}
            ]
        });
        const gate   = async nodeId => (nodeId === 'MEM:A' || nodeId === 'MEM:B') ? {id: nodeId, text: 'mem'} : null;
        const events = [];

        const {candidates, event} = await enrichWithConceptWalk({
            graphService    : budgetGraph, query: 'alpha beta', candidates: [], conceptWalk: true,
            resolveCandidate: gate, emit: e => events.push(e), maxHops: 1, hopBudget: 1
        });

        expect(event.resolvedConcepts.length).toBeGreaterThanOrEqual(2); // both concepts resolved → 2 members to walk
        expect(event.candidatesAdded).toBe(1);  // only the FIRST member's memory — the shared budget stopped the second
        expect(candidates).toHaveLength(1);
        expect(event.truncated).toBe(true);      // honest: the request-global edge budget was cut short

        // exact-fit: a budget that EXACTLY covers both members walks both and must NOT overfire truncated
        // (nothing was cut — the last member consumed the budget with nothing left to walk). Euclid falsifier.
        const exact = await enrichWithConceptWalk({
            graphService    : budgetGraph, query: 'alpha beta', candidates: [], conceptWalk: true,
            resolveCandidate: gate, maxHops: 1, hopBudget: 2
        });
        expect(exact.event.candidatesAdded).toBe(2);   // both members walked
        expect(exact.event.truncated).toBe(false);     // exact fit → NOT truncated (the overfire fix)
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

    test('per-consumer traversableLabels: CONCEPT-only expansion treats FILE as terminal — a node reachable ONLY through a FILE is not surfaced (fork-1: KB result boundary)', async () => {
        // golden-path → FILE:x → MEM:deep. Default expansion (CONCEPT+FILE) traverses THROUGH FILE:x and
        // reaches MEM:deep at depth 2. A KB-style consumer passing traversableLabels ['CONCEPT'] makes
        // FILE terminal: FILE:x is still reached (depth 1) but never expanded through, so MEM:deep past
        // the FILE result boundary is unreachable.
        const twoHop = fixtureGraph({
            concepts: [{type: 'CONCEPT', id: 'golden-path'}],
            nodes   : {
                'golden-path': {label: 'CONCEPT'},
                'FILE:x'     : {label: 'FILE'},
                'MEM:deep'   : {label: 'MEMORY'}
            },
            edges: [
                {id: 'f1', source: 'golden-path', target: 'FILE:x',   type: 'IMPLEMENTED_BY', properties: {}},
                {id: 'f2', source: 'FILE:x',      target: 'MEM:deep', type: 'TAGGED_CONCEPT', properties: {}}
            ]
        });
        const deepGate = async nodeId => nodeId === 'MEM:deep' ? {id: 'MEM:deep', text: 'deep'} : null;

        // CONCEPT-only: FILE terminal → MEM:deep (only reachable THROUGH FILE) is NOT surfaced
        const conceptOnly = await enrichWithConceptWalk({
            graphService    : twoHop, query: 'golden path', candidates: [], conceptWalk: true,
            resolveCandidate: deepGate, traversableNodeLabels: ['MEMORY'], traversableLabels: ['CONCEPT'], maxHops: 2
        });
        expect(conceptOnly.event.candidatesAdded).toBe(0);

        // default expansion (CONCEPT+FILE): the walk traverses THROUGH FILE:x and reaches MEM:deep
        const throughFile = await enrichWithConceptWalk({
            graphService    : twoHop, query: 'golden path', candidates: [], conceptWalk: true,
            resolveCandidate: deepGate, traversableNodeLabels: ['MEMORY'], maxHops: 2
        });
        expect(throughFile.event.candidatesAdded).toBe(1);
    });

    test('rlsPredicate gates PATH traversal: a node reachable ONLY through an RLS-rejected intermediate is not surfaced — terminal-candidate auth does not authorize the crossed path (#14504 gate 1 RLS Depth-Floor)', async () => {
        // golden-path → MEM:private (other-tenant intermediate) → MEM:deep. The rlsPredicate rejects
        // MEM:private, so the walk never traverses THROUGH it and MEM:deep — reachable only via the
        // private intermediate — is unreachable. Without the predicate the walk crosses it to reach deep.
        const pathGraph = fixtureGraph({
            concepts: [{type: 'CONCEPT', id: 'golden-path'}],
            nodes   : {
                'golden-path': {label: 'CONCEPT'},
                'MEM:private': {label: 'MEMORY'},
                'MEM:deep'   : {label: 'MEMORY'}
            },
            edges: [
                {id: 'p1', source: 'golden-path', target: 'MEM:private', type: 'TAGGED_CONCEPT', properties: {}},
                {id: 'p2', source: 'MEM:private', target: 'MEM:deep',    type: 'TAGGED_CONCEPT', properties: {}}
            ]
        });
        const deepGate = async nodeId => nodeId === 'MEM:deep' ? {id: 'MEM:deep', text: 'deep'} : null;
        const opts     = {graphService: pathGraph, query: 'golden path', candidates: [], conceptWalk: true, resolveCandidate: deepGate, traversableNodeLabels: ['MEMORY'], traversableLabels: ['CONCEPT', 'MEMORY'], maxHops: 2};

        // rlsPredicate rejects the private intermediate → the path THROUGH it is not walked → MEM:deep absent
        const gated = await enrichWithConceptWalk({...opts, rlsPredicate: nodeId => nodeId !== 'MEM:private'});
        expect(gated.event.candidatesAdded).toBe(0);

        // no predicate → the walk crosses the private intermediate and reaches MEM:deep
        const ungated = await enrichWithConceptWalk(opts);
        expect(ungated.event.candidatesAdded).toBe(1);
    });

    test('node-RLS gates a DIRECT terminal BEFORE hydration: a visible admitted IMPLEMENTED_BY edge to a node-RLS-invisible FILE is NOT hydrated even with a working hydrator — zero-hydration regression (#15071 private-terminal leak, @neo-gpt exact-head repro)', async () => {
        // The exact reproduced leak: golden-path --IMPLEMENTED_BY--> FILE:private (1 hop). The edge is
        // visible, its edge-type is an ADMITTED KB terminal, and the hydrator resolves FILE:private
        // successfully — yet the FILE is node-RLS-INVISIBLE. Pre-fix the terminal was pushed + hydrated
        // (candidatesAdded=1, private conceptPath). Node-RLS is applied BEFORE hops.push/budget/path, so the
        // private terminal never becomes a candidate: terminal-edge-type admission + a working hydrator do
        // NOT authorize the NODE.
        const privateTerminalGraph = fixtureGraph({
            concepts: [{type: 'CONCEPT', id: 'golden-path'}],
            nodes   : {
                'golden-path' : {label: 'CONCEPT'},
                'FILE:private': {label: 'FILE'}
            },
            edges: [
                {id: 'f1', source: 'golden-path', target: 'FILE:private', type: 'IMPLEMENTED_BY', properties: {}}
            ]
        });
        // a SUCCESSFUL collection hydrator — FILE:private resolves to a real doc, so a non-zero result is a
        // genuine leak, not a broken hydrator or an un-admitted edge type
        const fileGate = async nodeId => nodeId === 'FILE:private' ? {id: nodeId, source: nodeId} : null;
        const opts     = {
            graphService     : privateTerminalGraph, query: 'golden path', candidates: [], conceptWalk: true,
            resolveCandidate : fileGate, getCandidateId: c => c.source, traversableNodeLabels: ['FILE'],
            terminalEdgeTypes: KB_TERMINAL_EDGE_TYPES, maxHops: 1
        };

        // node-RLS rejects the private FILE → ZERO hydration (the terminal never becomes a candidate)
        const gated = await enrichWithConceptWalk({...opts, rlsPredicate: nodeId => nodeId !== 'FILE:private'});
        expect(gated.event.candidatesAdded).toBe(0);

        // control: the SAME graph + hydrator with the FILE node-RLS-VISIBLE DOES hydrate — proving the zero
        // above is the node-RLS gate, not a broken hydrator or an un-admitted edge type
        const ungated = await enrichWithConceptWalk(opts);
        expect(ungated.event.candidatesAdded).toBe(1);
    });

    test('traversableEdgeTypes gates PATH expansion by edge.type: a candidate reachable ONLY through an arbitrary edge is not surfaced — the (i) edge-policy, threaded enrich→walk (#14504)', async () => {
        // golden-path --RELATES_TO--> CONCEPT:sib --TAGGED_CONCEPT--> MEM:viaConcept   (retrieval-bearing expansion path)
        // golden-path --DISCUSSED_IN--> ISSUE:x   --TAGGED_CONCEPT--> MEM:viaArbitrary (arbitrary edge → ISSUE:x never expanded)
        const edgeGraph = fixtureGraph({
            concepts: [{type: 'CONCEPT', id: 'golden-path'}],
            nodes   : {
                'golden-path'     : {label: 'CONCEPT'},
                'CONCEPT:sib'     : {label: 'CONCEPT'},
                'ISSUE:x'         : {label: 'ISSUE'},
                'MEM:viaConcept'  : {label: 'MEMORY'},
                'MEM:viaArbitrary': {label: 'MEMORY'}
            },
            edges: [
                {id: 'c1', source: 'golden-path', target: 'CONCEPT:sib',      type: 'RELATES_TO',     properties: {}},
                {id: 'c2', source: 'CONCEPT:sib', target: 'MEM:viaConcept',   type: 'TAGGED_CONCEPT', properties: {}},
                {id: 'a1', source: 'golden-path', target: 'ISSUE:x',          type: 'DISCUSSED_IN',   properties: {}},
                {id: 'a2', source: 'ISSUE:x',     target: 'MEM:viaArbitrary', type: 'TAGGED_CONCEPT', properties: {}}
            ]
        });
        const memGate = async nodeId => nodeId.startsWith('MEM:') ? {id: nodeId, text: 'm'} : null;
        // permissive labels so ONLY the edge-type gate decides expansion
        const opts = {graphService: edgeGraph, query: 'golden path', candidates: [], conceptWalk: true, resolveCandidate: memGate, traversableNodeLabels: ['MEMORY'], traversableLabels: ['CONCEPT', 'ISSUE', 'MEMORY'], maxHops: 2};

        // allow-list expands through RELATES_TO (→sib→MEM:viaConcept) but NOT DISCUSSED_IN (ISSUE:x not expanded → MEM:viaArbitrary unreachable)
        const gated = await enrichWithConceptWalk({...opts, traversableEdgeTypes: CONCEPT_EXPANSION_EDGE_TYPES});
        expect(gated.event.candidatesAdded).toBe(1);

        // no edge-type gate → DISCUSSED_IN is traversed, ISSUE:x expanded, MEM:viaArbitrary also reached
        const ungatedEdges = await enrichWithConceptWalk(opts);
        expect(ungatedEdges.event.candidatesAdded).toBe(2);
    });

    test('terminalEdgeTypes gates candidate ADMISSION per consumer: an arbitrary SENT_TO edge to an authorized terminal is rejected, the canonical relation admitted — RLS does not authorize the selecting relation (#14504 Cycle-4 falsifier, both consumers)', async () => {
        // concept --{canonical relation}--> T:canonical  (admitted)   ·   concept --SENT_TO--> T:arbitrary (rejected)
        const makeGraph = (goodType, terminalLabel) => fixtureGraph({
            concepts: [{type: 'CONCEPT', id: 'golden-path'}],
            nodes   : {
                'golden-path': {label: 'CONCEPT'},
                'T:canonical': {label: terminalLabel},
                'T:arbitrary': {label: terminalLabel}
            },
            edges: [
                {id: 't1', source: 'golden-path', target: 'T:canonical', type: goodType,  properties: {}},
                {id: 't2', source: 'golden-path', target: 'T:arbitrary', type: 'SENT_TO',  properties: {}}
            ]
        });
        const termGate = async nodeId => nodeId.startsWith('T:') ? {id: nodeId, source: nodeId} : null; // BOTH terminals pass RLS

        // KB: IMPLEMENTED_BY→FILE admitted; SENT_TO→FILE rejected DESPITE passing RLS
        const kb = await enrichWithConceptWalk({
            graphService     : makeGraph('IMPLEMENTED_BY', 'FILE'), query: 'golden path', candidates: [], conceptWalk: true,
            resolveCandidate : termGate, getCandidateId: c => c.source, traversableNodeLabels: ['FILE'],
            terminalEdgeTypes: KB_TERMINAL_EDGE_TYPES, maxHops: 1
        });
        expect(kb.event.candidatesAdded).toBe(1);

        // Memory: TAGGED_CONCEPT→AGENT_MEMORY admitted; SENT_TO→AGENT_MEMORY rejected
        const mem = await enrichWithConceptWalk({
            graphService     : makeGraph('TAGGED_CONCEPT', 'AGENT_MEMORY'), query: 'golden path', candidates: [], conceptWalk: true,
            resolveCandidate : termGate, getCandidateId: c => c.source, traversableNodeLabels: ['AGENT_MEMORY'],
            terminalEdgeTypes: MEMORY_TERMINAL_EDGE_TYPES, maxHops: 1
        });
        expect(mem.event.candidatesAdded).toBe(1);

        // default null (probe mode) → the arbitrary SENT_TO terminal is admitted too (byte-identical to pre-gate)
        const ungated = await enrichWithConceptWalk({
            graphService    : makeGraph('IMPLEMENTED_BY', 'FILE'), query: 'golden path', candidates: [], conceptWalk: true,
            resolveCandidate: termGate, getCandidateId: c => c.source, traversableNodeLabels: ['FILE'], maxHops: 1
        });
        expect(ungated.event.candidatesAdded).toBe(2);
    });

    test('enrich binds the GraphService isNodeVisibleToRequester seam BY DEFAULT — a private intermediate is RLS-blocked with no explicit rlsPredicate (#14504 gate 1 seam)', async () => {
        const base = fixtureGraph({
            concepts: [{type: 'CONCEPT', id: 'golden-path'}],
            nodes   : {
                'golden-path': {label: 'CONCEPT'},
                'MEM:private': {label: 'MEMORY'},
                'MEM:deep'   : {label: 'MEMORY'}
            },
            edges: [
                {id: 'q1', source: 'golden-path', target: 'MEM:private', type: 'TAGGED_CONCEPT', properties: {}},
                {id: 'q2', source: 'MEM:private', target: 'MEM:deep',    type: 'TAGGED_CONCEPT', properties: {}}
            ]
        });
        // the GraphService-owned seam rejects the private intermediate; enrich must bind it by default
        const graphService = {...base, isNodeVisibleToRequester: nodeId => nodeId !== 'MEM:private'};
        const deepGate     = async nodeId => nodeId === 'MEM:deep' ? {id: 'MEM:deep', text: 'deep'} : null;

        // NO explicit rlsPredicate → enrich binds graphService.isNodeVisibleToRequester → MEM:private is
        // not traversed THROUGH → MEM:deep (reachable only via it) is not surfaced.
        const {event} = await enrichWithConceptWalk({
            graphService, query: 'golden path', candidates: [], conceptWalk: true,
            resolveCandidate: deepGate, traversableNodeLabels: ['MEMORY'], traversableLabels: ['CONCEPT', 'MEMORY'], maxHops: 2
        });
        expect(event.candidatesAdded).toBe(0);
    });

    test('KB_TERMINAL_EDGE_TYPES admits all 3 concept→FILE ontology edges (IMPLEMENTED_BY / EXPLAINED_BY / EXEMPLIFIED_BY); an arbitrary edge is rejected — #14504 guide/source retrieval (@neo-gpt value correction)', async () => {
        const fileGate = async nodeId => nodeId.startsWith('FILE:') ? {id: nodeId, source: nodeId} : null;
        const probe    = async edgeType => {
            const g = fixtureGraph({
                concepts: [{type: 'CONCEPT', id: 'golden-path'}],
                nodes   : {'golden-path': {label: 'CONCEPT'}, 'FILE:doc': {label: 'FILE'}},
                edges   : [{id: 'f1', source: 'golden-path', target: 'FILE:doc', type: edgeType, properties: {}}]
            });
            const r = await enrichWithConceptWalk({
                graphService     : g, query: 'golden path', candidates: [], conceptWalk: true,
                resolveCandidate : fileGate, getCandidateId: c => c.source, traversableNodeLabels: ['FILE'],
                terminalEdgeTypes: KB_TERMINAL_EDGE_TYPES, maxHops: 1
            });
            return r.event.candidatesAdded
        };

        expect(await probe('IMPLEMENTED_BY')).toBe(1);
        expect(await probe('EXPLAINED_BY')).toBe(1);
        expect(await probe('EXEMPLIFIED_BY')).toBe(1);
        expect(await probe('SENT_TO')).toBe(0) // arbitrary edge still rejected
    });

    test('enrich binds the GraphService isEdgeVisibleToRequester seam BY DEFAULT — a foreign edge between visible nodes contributes zero even past node-RLS (#14504 edge-RLS ruling)', async () => {
        const base = fixtureGraph({
            concepts: [{type: 'CONCEPT', id: 'golden-path'}],
            nodes   : {'golden-path': {label: 'CONCEPT'}, 'FILE:own': {label: 'FILE'}, 'FILE:foreign': {label: 'FILE'}},
            edges   : [
                {id: 'own',     source: 'golden-path', target: 'FILE:own',     type: 'IMPLEMENTED_BY', properties: {userId: 'me'}},
                {id: 'foreign', source: 'golden-path', target: 'FILE:foreign', type: 'IMPLEMENTED_BY', properties: {userId: 'other'}}
            ]
        });
        const fileGate = async nodeId => nodeId.startsWith('FILE:') ? {id: nodeId, source: nodeId} : null; // BOTH FILE nodes pass node-RLS
        // the GraphService-owned EDGE seam rejects the foreign-owned edge; enrich must bind it with no explicit predicate
        const graphService = {...base, isEdgeVisibleToRequester: edge => edge.properties?.userId !== 'other'};

        const {candidates, event} = await enrichWithConceptWalk({
            graphService, query: 'golden path', candidates: [], conceptWalk: true,
            resolveCandidate : fileGate, getCandidateId: c => c.source, traversableNodeLabels: ['FILE'],
            terminalEdgeTypes: KB_TERMINAL_EDGE_TYPES, maxHops: 1
        });

        // only the own-edge FILE surfaces; the foreign-edge FILE contributes zero DESPITE its node passing RLS
        expect(event.candidatesAdded).toBe(1);
        expect(candidates.some(c => c.source === 'FILE:foreign')).toBe(false)
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

    test('post-hydration dedup: two id-dialects hydrating to the same source yield ONE candidate (#15071 cycle-2)', async () => {
        // file:x and file-x are DISTINCT nodes (both pass the raw-nodeId dedup) that hydrate to the SAME
        // source — the pre-fix dedup (by raw nodeId) admitted both; the fix dedups by the resolved id.
        const graph = fixtureGraph({
            concepts: [{type: 'CONCEPT', id: 'golden-path'}],
            nodes   : {'golden-path': {label: 'CONCEPT'}, 'file:src/x.mjs': {label: 'FILE'}, 'file-src/x.mjs': {label: 'FILE'}},
            edges   : [
                {id: 'e1', source: 'golden-path', target: 'file:src/x.mjs', type: 'IMPLEMENTED_BY', properties: {}},
                {id: 'e2', source: 'golden-path', target: 'file-src/x.mjs', type: 'IMPLEMENTED_BY', properties: {}}
            ]
        });
        // a FILE resolver that normalizes both id-dialects to the same source (like the KB FILE gate)
        const fileGate = async nodeId => {
            const source = String(nodeId).replace(/^file[:-]/, '');
            return {id: source, source}
        };

        const {candidates} = await enrichWithConceptWalk({
            graphService         : graph,
            query                : 'golden path',
            candidates           : [{id: 'EMB:1'}],
            conceptWalk          : true,
            resolveCandidate     : fileGate,
            getCandidateId       : c => c.source ?? c.id,
            traversableNodeLabels: ['FILE'],
            maxHops              : 1
        });

        // both dialects resolve to 'src/x.mjs' → exactly ONE walk candidate, not two
        const walked = candidates.filter(c => c.via === 'concept-walk');
        expect(walked).toHaveLength(1);
        expect(walked[0].source).toBe('src/x.mjs');
    });

    // RLS Depth-Floor (Emmy's KB cycle-2 review): terminal-candidate authorization does NOT authorize the
    // PATH used to reach it. A KB walk must not traverse THROUGH a private AGENT_MEMORY intermediate
    // (another tenant's) to reach a public FILE. Fixed via the enrich-scoped PUBLIC_TRAVERSABLE_LABELS
    // allow-list (CONCEPT + FILE only, fail-closed) passed to walkConceptNeighborhood as traversableLabels:
    // the AGENT_MEMORY intermediate is recorded as a hop but never expanded through, so the FILE beyond it
    // is unreachable. This is the reserved regression bar for that fix.
    test('intermediate-hop RLS: a FILE reachable ONLY via a private AGENT_MEMORY intermediate is NOT appended (#15071 cycle-2 Depth-Floor)', async () => {
        const graph = fixtureGraph({
            concepts: [{type: 'CONCEPT', id: 'golden-path'}],
            nodes   : {'golden-path': {label: 'CONCEPT'}, 'mem:other-tenant': {label: 'AGENT_MEMORY'}, 'file:src/x.mjs': {label: 'FILE'}},
            edges   : [
                {id: 'e1', source: 'golden-path',      target: 'mem:other-tenant', type: 'TAGGED_CONCEPT', properties: {}},
                {id: 'e2', source: 'mem:other-tenant', target: 'file:src/x.mjs',   type: 'IMPLEMENTED_BY', properties: {}}
            ]
        });
        // a FILE gate that WOULD authorize the terminal file on its own — the leak is the PATH, not the terminal
        const fileGate = async (nodeId, {neighborLabel}) =>
            neighborLabel === 'FILE' ? {id: String(nodeId).replace(/^file[:-]/, ''), source: String(nodeId).replace(/^file[:-]/, '')} : null;

        const {candidates} = await enrichWithConceptWalk({
            graphService         : graph,
            query                : 'golden path',
            candidates           : [{id: 'EMB:1'}],
            conceptWalk          : true,
            resolveCandidate     : fileGate,
            getCandidateId       : c => c.source ?? c.id,
            traversableNodeLabels: ['FILE'],
            maxHops              : 2
        });

        // the FILE is reachable ONLY by crossing the private AGENT_MEMORY intermediate → it must NOT appear
        expect(candidates.some(c => c.source === 'src/x.mjs')).toBe(false);
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
        expect(WALK_BUDGET).toEqual({conceptLimit: 5, maxHops: 2, hopBudget: 80, maxCandidates: 40});
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

    test('maxCandidates bounds hydration and the event flags truncation honestly', async () => {
        const gate = async nodeId => nodeId.startsWith('MEM:') ? {id: nodeId} : null; // authorize both memories

        const {candidates, event} = await enrichWithConceptWalk({
            graphService    : WALK_GRAPH, query: 'golden path', candidates: [], conceptWalk: true,
            resolveCandidate: gate, maxHops: 1, maxCandidates: 1
        });

        // two memories were authorizable, but the ceiling stops hydration at one — and says so
        expect(candidates).toHaveLength(1);
        expect(event.candidatesAdded).toBe(1);
        expect(event.truncated).toBe(true);
    });

    test('maxCandidates counts rejected hydrations — a reject consumes ceiling budget, bounding total gate round-trips (#15071 cycle-2 overflow)', async () => {
        // gate rejects FILE:x (a round-trip returning null), authorizes both memories
        const gate = async nodeId => nodeId.startsWith('MEM:') ? {id: nodeId} : null;

        const {candidates, event} = await enrichWithConceptWalk({
            graphService    : WALK_GRAPH, query: 'golden path', candidates: [], conceptWalk: true,
            resolveCandidate: gate, maxHops: 1, maxCandidates: 2
        });

        // walk order is MEM:1, FILE:x, MEM:2. The FILE:x REJECT is a hydration attempt that counts:
        // MEM:1 (attempt 1, added) + FILE:x (attempt 2, rejected) hits the ceiling of 2 before MEM:2 is
        // reached. Without counting rejects, all three would hydrate (3 round-trips for a ceiling of 2) and
        // MEM:2 would be appended — the overflow the cycle-2 probe caught.
        expect(candidates.map(c => c.id)).toEqual(['MEM:1']); // MEM:2 never hydrated — the reject spent the budget
        expect(event.filteredOut).toBe(1);                    // FILE:x
        expect(event.truncated).toBe(true);                   // ceiling hit at 2 attempts
    });
});

test.describe('Neo.ai.services.memory-core.GraphService.isNodeVisibleToRequester — path-RLS seam (#14504)', () => {
    // Exercise the real seam via `.call` with a mock `this.db.storage` — the raw-read → isRlsVisible →
    // resolveRlsUserId composition + the fail-closed paths, without constructing a live graph db.
    const mockThis = (nodeRow, userId) => ({
        db: {
            storage: {
                db                   : {prepare: () => ({get: () => nodeRow})},
                RequestContextService: {getUserId: () => userId}
            }
        }
    });
    const nodeRow = userId => ({data: JSON.stringify({properties: {userId}})});
    const call    = (row, requester, id = 'MEM:x') => GraphService.isNodeVisibleToRequester.call(mockThis(row, requester), id);

    test('own-tenant node is visible; other-tenant is not; public (null userId) is visible', () => {
        expect(call(nodeRow('agent-a'), 'agent-a')).toBe(true);   // own
        expect(call(nodeRow('agent-b'), 'agent-a')).toBe(false);  // other-tenant → path not authorized
        expect(call(nodeRow(null),      'agent-a')).toBe(true);   // public (ownerUserId null)
    });

    test('fail-closed: a missing node, an absent db, and an invalid id all return false', () => {
        expect(call(undefined, 'agent-a', 'MEM:gone')).toBe(false);                          // raw read yields nothing
        expect(GraphService.isNodeVisibleToRequester.call({db: {storage: {}}}, 'MEM:x')).toBe(false); // absent db
        expect(call(nodeRow('agent-a'), 'agent-a', '')).toBe(false);                         // invalid node id
    });
});
