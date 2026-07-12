import {test, expect}                                             from '@playwright/test';
import {buildKbFileResolveCandidate, normalizeFileNodeIdToSource} from '../../../../../../ai/services/knowledge-base/conceptWalkKbFileGate.mjs';

/**
 * The KB FILE resolver for concept-anchored retrieval's second surface: a walk-reached FILE node
 * resolves to the KB doc whose `metadata.source` matches, under the KB's tenant filtering (injected).
 * Pure + injectable, so the label gate, the `file:`/`file-` id-dialect normalization, and fail-closed
 * behavior are unit-tested with a mock lookup (no live KB store).
 */

function makeLookup(bySource, {throwOnGet = false} = {}) {
    const state = {calls: 0};

    return {
        state,
        fn: async source => {
            state.calls++;
            if (throwOnGet) throw new Error('kb lookup failure');
            return bySource[source] ?? null
        }
    }
}

test.describe('Neo.ai.services.knowledge-base.conceptWalkKbFileGate (#14504)', () => {

    test('normalizeFileNodeIdToSource strips the file: and file- dialects to a bare source path', () => {
        expect(normalizeFileNodeIdToSource('file:src/vdom/Helper.mjs')).toBe('src/vdom/Helper.mjs');
        expect(normalizeFileNodeIdToSource('file-src/vdom/Helper.mjs')).toBe('src/vdom/Helper.mjs');
        expect(normalizeFileNodeIdToSource('src/no/prefix.mjs')).toBe('src/no/prefix.mjs'); // no dialect → unchanged
        expect(normalizeFileNodeIdToSource('')).toBeNull();
        expect(normalizeFileNodeIdToSource(null)).toBeNull();
    });

    test('a non-FILE neighbor is rejected with NO lookup', async () => {
        const lookup = makeLookup({}),
              gate   = buildKbFileResolveCandidate({findKbDocBySource: lookup.fn});

        expect(await gate('MEM:1', {neighborLabel: 'AGENT_MEMORY'})).toBeNull();
        expect(await gate('CONCEPT:x', {neighborLabel: 'CONCEPT'})).toBeNull();
        expect(await gate('n', {})).toBeNull();          // missing label → rejected
        expect(lookup.state.calls).toBe(0);              // never hit the KB store
    });

    test('a FILE node resolves to the KB doc whose source matches — both id dialects hit the same doc', async () => {
        const doc    = {id: 'kb-doc-1', title: 'VDom Helper', snippet: '…'},
              lookup = makeLookup({'src/vdom/Helper.mjs': doc}),
              gate   = buildKbFileResolveCandidate({findKbDocBySource: lookup.fn});

        const viaColon  = await gate('file:src/vdom/Helper.mjs', {neighborLabel: 'FILE'}),
              viaHyphen = await gate('file-src/vdom/Helper.mjs', {neighborLabel: 'FILE'});

        expect(viaColon).toMatchObject({id: 'kb-doc-1', title: 'VDom Helper', source: 'src/vdom/Helper.mjs'});
        expect(viaHyphen).toMatchObject({id: 'kb-doc-1', source: 'src/vdom/Helper.mjs'});
    });

    test('a source with no matching (or unauthorized) KB doc resolves to null', async () => {
        const lookup = makeLookup({'src/present.mjs': {id: 'k1'}}),
              gate   = buildKbFileResolveCandidate({findKbDocBySource: lookup.fn});

        expect(await gate('file:src/absent.mjs', {neighborLabel: 'FILE'})).toBeNull(); // lookup returns null (absent/filtered)
    });

    test('a KB lookup error fails closed (null), never a throw', async () => {
        const lookup = makeLookup({}, {throwOnGet: true}),
              gate   = buildKbFileResolveCandidate({findKbDocBySource: lookup.fn});

        expect(await gate('file:src/x.mjs', {neighborLabel: 'FILE'})).toBeNull();
    });

    test('an absent findKbDocBySource fails closed', async () => {
        const gate = buildKbFileResolveCandidate({});

        expect(await gate('file:src/x.mjs', {neighborLabel: 'FILE'})).toBeNull();
    });
});
