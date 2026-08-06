import {setup} from '../../../../setup.mjs';

const appName = 'KBMergeIdentityContractTest';

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

import {
    assertNoNaturalKeyDivergence,
    classifyIncomingRow,
    DIVERGENCE_SCAN,
    indexByNaturalKey,
    KB_MERGE_NATURAL_KEY_DIVERGENCE,
    NATURAL_KEY_FIELDS,
    naturalKeyOf
} from '../../../../../../ai/services/knowledge-base/helpers/mergeIdentityContract.mjs';

/**
 * The Knowledge Base chunk id is a content digest, so an id-keyed merge cannot tell "same chunk,
 * changed content" from "different chunk" — the two are indistinguishable at the id layer by
 * construction, and a blind upsert therefore produces logical duplicates carrying contradictory
 * metadata for one symbol. Identity for merge purposes has to be a natural key instead.
 *
 * These guards cover the three properties that decide whether the detector is trustworthy: the key
 * is injective (a colliding key would silently merge two distinct entities), a byte-identical re-run
 * is classified as a no-op rather than a divergence (or the guard would fire on every clean merge),
 * and a clean bundle still completes (or the guard would be indistinguishable from "merge is broken").
 */
test.describe('KB merge identity — a content digest is not an identity (#16599)', () => {

    const row = (id, overrides = {}) => ({
        id,
        metadata: {
            tenantId: 'neo-shared',
            repoSlug: 'neo',
            source  : 'src/component/Base.mjs',
            name    : 'src/component/Base.mjs - onConstructed()',
            type    : 'method',
            ...overrides
        }
    });

    test('the natural key is injective — a delimiter join would collide on real values', () => {
        // `source` is a filesystem path and `name` is synthesized prose, so both carry the
        // punctuation any single-character delimiter would use. These two rows are DIFFERENT
        // entities whose field boundary sits on opposite sides of the delimiter.
        const a = row('id-a', {source: 'src/a',   name: 'b-c'}),
              b = row('id-b', {source: 'src/a-b', name: 'c'});

        // The counterfactual is asserted rather than described, and that is the point of this test.
        // `expect(naturalKeyOf(a)).not.toBe(naturalKeyOf(b))` alone is satisfied by ANY framing
        // including a broken one, so it would pass while proving nothing — the guard has to first
        // establish that this pair is genuinely a collision hazard.
        expect(
            NATURAL_KEY_FIELDS.map(field => String(a.metadata[field])).join('-'),
            'fixture guard: this pair must actually collide under a delimiter join, or the assertion below is vacuous'
        ).toBe(NATURAL_KEY_FIELDS.map(field => String(b.metadata[field])).join('-'));

        expect(naturalKeyOf(a), 'injective framing must separate what the delimiter join merged').not.toBe(naturalKeyOf(b));

        // And the positive half: the same tuple must always produce the same key, or the detector
        // would miss divergences rather than invent them.
        expect(naturalKeyOf(row('id-x'))).toBe(naturalKeyOf(row('id-y')));

        // `undefined` and `null` must not collapse onto each other or onto the string "null":
        // a row with no `source` and a row whose source is literally "null" are different rows.
        const missing = naturalKeyOf(row('i', {source: undefined})),
              nulled  = naturalKeyOf(row('i', {source: null})),
              literal = naturalKeyOf(row('i', {source: 'null'}));

        expect(new Set([missing, nulled, literal]).size, 'three distinct absences must stay distinct').toBe(3);
    });

    test('the key names an entity independently of content — which is the whole premise', () => {
        // Two ids, same natural key: this is precisely the shape a content-digest id produces when
        // a hash input (`extends`) resolves on one side and not the other.
        const live     = row('digest-with-extends'),
              incoming = row('digest-without-extends');

        expect(naturalKeyOf(live)).toBe(naturalKeyOf(incoming));
        expect(NATURAL_KEY_FIELDS).not.toContain('content');
        expect(NATURAL_KEY_FIELDS, 'a hashed-content field in the key would defeat its purpose').not.toContain('extends');
    });

    test('a byte-identical re-run is a no-op, NOT a divergence', () => {
        // Order-of-checks guard. The natural key is present on both sides here too, so classifying
        // divergence before identity would misreport every correct no-op as a derivation regression
        // and the merge would refuse on a clean re-run — the guard failing closed on the happy path.
        const live      = [row('same-id')],
              liveIndex = indexByNaturalKey(live),
              liveIds   = new Set(['same-id']);

        expect(classifyIncomingRow({row: row('same-id'), liveIndex, liveIds}).outcome).toBe('overwritten-identical');
    });

    test('a shared natural key under a different id is flagged, and refusal names the count', () => {
        const liveIndex = indexByNaturalKey([row('live-digest')]),
              liveIds   = new Set(['live-digest']),
              verdict   = classifyIncomingRow({row: row('bundle-digest'), liveIndex, liveIds});

        expect(verdict.outcome).toBe('natural-key-divergent');
        expect(verdict.liveIds).toEqual(['live-digest']);

        let thrown;
        try {
            assertNoNaturalKeyDivergence({divergent: [{id: 'bundle-digest', key: verdict.key, liveIds: verdict.liveIds}]});
        } catch (error) {
            thrown = error;
        }

        expect(thrown, 'divergence must refuse, not warn').toBeTruthy();
        expect(thrown.code).toBe(KB_MERGE_NATURAL_KEY_DIVERGENCE);
        expect(thrown.divergent).toBe(1);
        // The message has to be actionable without a re-run: the count, a sample naming the symbol
        // and file, and the statement that nothing was written.
        expect(thrown.message).toContain('1 chunk(s)');
        expect(thrown.message).toContain('src/component/Base.mjs');
        expect(thrown.message).toContain('Nothing was written');
    });

    test('a clean bundle still merges — the negative control', () => {
        // Without this, a guard that refused every merge would pass every other test in this file.
        const liveIndex = indexByNaturalKey([row('live-digest')]),
              liveIds   = new Set(['live-digest']),
              fresh     = row('new-digest', {name: 'src/component/Base.mjs - afterSetMounted()'});

        expect(classifyIncomingRow({row: fresh, liveIndex, liveIds}).outcome).toBe('inserted');
        expect(() => assertNoNaturalKeyDivergence({divergent: []})).not.toThrow();
    });

    test('a colliding natural key on the LIVE side does not hide a divergence', () => {
        // Measured reality: `name` is synthesized and collapses distinct members onto one label
        // (`[computed]()` occurs 16 times in one file), so one natural key can legitimately carry
        // several live ids. The detector must still flag an incoming id that matches none of them —
        // otherwise the 0.26% collision rate becomes a blind spot rather than a known bound.
        const collided = [row('live-1', {name: 'src/collection/Filter.mjs - [computed]()'}),
                           row('live-2', {name: 'src/collection/Filter.mjs - [computed]()'})],
              liveIndex = indexByNaturalKey(collided),
              liveIds   = new Set(['live-1', 'live-2']),
              incoming  = row('bundle-3', {name: 'src/collection/Filter.mjs - [computed]()'}),
              verdict   = classifyIncomingRow({row: incoming, liveIndex, liveIds});

        expect(verdict.outcome).toBe('natural-key-divergent');
        expect(verdict.liveIds.sort(), 'every colliding live id is reported, not just the first').toEqual(['live-1', 'live-2']);
    });

    test('the scan states which zero it found, so a clean receipt is not confused with an unscanned one', () => {
        // A `naturalKeyDivergent: 0` carries no information without this: an empty target makes
        // divergence impossible, which is exactly why the 2026-08-06 disposable-collection restore
        // reported three passing integrity checks and proved nothing about merge semantics.
        expect(new Set(Object.values(DIVERGENCE_SCAN)).size, 'the states must be distinguishable').toBe(3);
        expect(DIVERGENCE_SCAN.performed).not.toBe(DIVERGENCE_SCAN.skippedEmptyTarget);
        expect(Object.isFrozen(DIVERGENCE_SCAN)).toBe(true);
    });
});
