import { setup } from '../../../../setup.mjs';

const appName = 'MemoryServiceConceptWalkTest';

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
import MemoryService  from '../../../../../../ai/services/memory-core/MemoryService.mjs';
import StorageRouter  from '../../../../../../ai/services/memory-core/managers/StorageRouter.mjs';

/**
 * The `query_raw_memories` surface of concept-anchored retrieval: the memory-side twin of the
 * `ask_knowledge_base` opt-in probe. Proves the wrap is genuinely OPT-IN at the surface —
 * `conceptWalk:true` rides the retrieval event on the result envelope; the default path omits it
 * (byte-identical to the pre-wrap shape). The RLS gate + walk internals are exhaustively covered by
 * {@link conceptWalkMemoryGate} + {@link conceptAnchoredRetrieval}; this asserts only the surface
 * wiring, hermetically — a spy collection returns the flat candidate, and GraphService resolves no
 * CONCEPT so the walk short-circuits to an honest zero event (no live store / graph).
 */
function createSpyCollection() {
    const rows = new Map();

    return {
        rows,
        async add({ids, metadatas, documents}) {
            ids.forEach((id, i) => rows.set(id, {id, metadata: metadatas?.[i] ?? {}, document: documents?.[i] ?? ''}))
        },
        async get({ids} = {}) {
            const entries = ids ? ids.map(id => rows.get(id)).filter(Boolean) : Array.from(rows.values());
            return {ids: entries.map(e => e.id), metadatas: entries.map(e => e.metadata), documents: entries.map(e => e.document)}
        },
        async query({nResults = 10} = {}) {
            const entries = Array.from(rows.values()).slice(0, nResults);
            return {
                ids      : [entries.map(e => e.id)],
                distances: [entries.map(() => 0)],
                metadatas: [entries.map(e => e.metadata)],
                documents: [entries.map(e => e.document)]
            }
        }
    }
}

test.describe('MemoryService — concept-walk opt-in surface (query_raw_memories) (#14504)', () => {
    let spyCollection, GraphService;
    let originalGetMemoryCollection, originalListNodeRecordsByType;

    test.beforeAll(async () => {
        GraphService = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default
    });

    test.beforeEach(() => {
        spyCollection                     = createSpyCollection();
        originalGetMemoryCollection       = StorageRouter.getMemoryCollection;
        StorageRouter.getMemoryCollection = async () => spyCollection;
        // No CONCEPT nodes → resolveConcepts returns nothing → the walk short-circuits to an honest
        // zero event, never touching the raw-edge reader. Proves the surface wiring without a graph.
        originalListNodeRecordsByType      = GraphService.listNodeRecordsByType;
        GraphService.listNodeRecordsByType = () => ({records: []})
    });

    test.afterEach(() => {
        StorageRouter.getMemoryCollection  = originalGetMemoryCollection;
        GraphService.listNodeRecordsByType = originalListNodeRecordsByType
    });

    test('conceptWalk:true rides the event on the envelope; the default path omits it — byte-identical', async () => {
        await spyCollection.add({
            ids      : ['m1'],
            metadatas: [{memoryType: 'general', timestamp: '2026-07-04T10:00:00.000Z'}],
            documents: ['a seeded memory']
        });

        // opt-in ON: the retrieval event rides the result; the flat memories are still returned
        const walked = await MemoryService.queryMemories({query: 'seeded', nResults: 5, conceptWalk: true});
        expect(walked.conceptWalk).toBeTruthy();
        expect(walked.conceptWalk.walkContributed).toBe(false);
        expect(walked.conceptWalk.candidatesAdded).toBe(0);
        expect(walked.conceptWalk.resolvedConcepts).toEqual([]);
        expect(Array.isArray(walked.results)).toBe(true);

        // default (opt-out): NO conceptWalk key — byte-identical to the pre-wrap envelope
        const flat = await MemoryService.queryMemories({query: 'seeded', nResults: 5});
        expect('conceptWalk' in flat).toBe(false)
    })
});
