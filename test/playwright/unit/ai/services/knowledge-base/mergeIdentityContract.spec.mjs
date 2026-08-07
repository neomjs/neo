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

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../src/core/_export.mjs';
import fs              from 'node:fs';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..');

import {
    assertNoNaturalKeyDivergence,
    classifyIncomingRow,
    decodeNaturalKey,
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

    test('an id already present is NOT a divergence, and is not called identical either', () => {
        // Order-of-checks guard. The natural key is present on both sides here too, so classifying
        // divergence before identity would misreport every correct re-run as a derivation regression
        // and the merge would refuse on a clean merge — the guard failing closed on the happy path.
        const live      = [row('same-id')],
              liveIndex = indexByNaturalKey(live),
              liveIds   = new Set(['same-id']);

        // `id-already-present`, not `overwritten-identical`. The id is a digest over content plus
        // hashed fields and does NOT cover the embedding vector, so a matching id proves the hashed
        // content is unchanged and proves nothing about the row as stored — two rows can share an id
        // and carry different vectors. The row is also still upserted, so "identical no-op" claimed
        // both a stronger guarantee and a skip that does not happen.
        expect(classifyIncomingRow({row: row('same-id'), liveIndex, liveIds}).outcome).toBe('id-already-present');
    });

    test('a literal metadata value cannot impersonate an ABSENT field — the reserved-value class is gone', () => {
        // The encoding was `absence -> a reserved string`, injective only until a row's metadata
        // literally contains that string. Then two different rows frame to the same key, and a key
        // collision silently merges two distinct entities — the exact failure this module exists to
        // prevent, reintroduced by its own encoding.
        //
        // ASCII-only sentinel on purpose. The original defect was authored as a space-prefixed
        // literal that was actually carrying a NUL byte, which made git classify the source file as
        // BINARY and render every diff of it as "Binary file not shown".
        const SENTINEL = '--absent--';

        const absent  = row('id-a', {source: undefined}),
              literal = row('id-b', {source: SENTINEL});

        const sentinelEncode = metadata => JSON.stringify(NATURAL_KEY_FIELDS.map(field => {
            const value = metadata[field];
            return value === undefined ? SENTINEL : value === null ? '--null--' : String(value);
        }));

        // Fixture guard FIRST. Under a sentinel encoding these two rows collide; asserting only that
        // the shipped keys differ would pass under every encoding including the broken one.
        expect(
            sentinelEncode(absent.metadata),
            'fixture guard: a sentinel encoding must genuinely collide here, or the assertion below is vacuous'
        ).toBe(sentinelEncode(literal.metadata));

        // Type tagging removes the reserved-value class entirely: an absence tag and a tagged string
        // cannot coincide for any value a caller supplies.
        expect(naturalKeyOf(absent), 'an absent field and a literal look-alike must stay distinct')
            .not.toBe(naturalKeyOf(literal));

        const keys = [
            naturalKeyOf(row('i', {source: undefined})),
            naturalKeyOf(row('i', {source: null})),
            naturalKeyOf(row('i', {source: 'null'})),
            naturalKeyOf(row('i', {source: SENTINEL}))
        ];

        expect(new Set(keys).size, 'four distinct field states must produce four distinct keys').toBe(4);
    });

    test('the refusal message decodes the key — an operator never sees raw tags', () => {
        // The message is the only part of a fail-loud guard an operator consumes, so an encoding
        // change that skipped the decoder would ship a diagnostic full of raw tag fragments.
        const verdict = classifyIncomingRow({
            row      : row('bundle-digest'),
            liveIndex: indexByNaturalKey([row('live-digest')]),
            liveIds  : new Set(['live-digest'])
        });

        let thrown;
        try {
            assertNoNaturalKeyDivergence({divergent: [{id: 'bundle-digest', key: verdict.key, liveIds: verdict.liveIds}]});
        } catch (error) {
            thrown = error;
        }

        expect(thrown.message).toContain('src/component/Base.mjs');
        expect(thrown.message).toContain('neo-shared/neo');
        expect(thrown.message, 'raw tag arrays must never reach the operator').not.toMatch(/\[\s*2\s*,/);

        expect(decodeNaturalKey(naturalKeyOf(row('x', {source: undefined})))).toContain('<absent>');
    });

    test('THE SOURCE FILES CARRY NO NUL BYTE — a control character makes git treat them as binary', () => {
        // Not hygiene. A NUL in a source file makes git classify it as BINARY, so every diff renders
        // as "Binary file not shown" and a reviewer reads the change blind. @neo-gpt found the
        // injectivity defect in this module from exactly such a diff.
        //
        // `grep -P '\x00'` does NOT detect this — it exits 1 (no match) and reads as clean, which is
        // how I reported both files NUL-free while one still carried three. `od` is the instrument
        // that actually sees it.
        for (const relative of [
            'ai/services/knowledge-base/helpers/mergeIdentityContract.mjs',
            'test/playwright/unit/ai/services/knowledge-base/mergeIdentityContract.spec.mjs'
        ]) {
            const bytes = fs.readFileSync(path.resolve(repoRoot, relative));

            expect(bytes.includes(0), `${relative} contains a NUL byte, which makes git render it as binary`).toBe(false);
        }
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
