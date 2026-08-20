import {test, expect} from '@playwright/test';

import '../../../../../../src/Neo.mjs';
import '../../../../../../src/core/Base.mjs';

import {
    EMBEDDING_INPUT_FORMAT_ID,
    EMBEDDING_INPUT_FORMAT_METADATA_KEY,
    buildEmbeddingInputHeader,
    buildEmbeddingInputText
}                              from '../../../../../../ai/services/knowledge-base/helpers/embeddingInputFormat.mjs';
import {censusCollection, parseArgs}
                               from '../../../../../../ai/scripts/diagnostics/staleEmbeddingCensus.mjs';
import {
    classifyRowFormat,
    emptyStaleEmbeddingCensus,
    foldStaleEmbeddingCensus,
    mergeStaleEmbeddingCensus
}                              from '../../../../../../ai/services/knowledge-base/helpers/staleEmbeddingCensus.mjs';

/**
 * Builds a stored-row shape as the scan returns it.
 * @param {String} id Row id.
 * @param {Object} metadata Stored metadata.
 * @returns {{id: String, metadata: Object}}
 */
function row(id, metadata) {
    return {id, metadata};
}

test.describe('the provider-input format has a stored identity', () => {
    test('the identity is DERIVED from the format, so a format change cannot leave it behind', () => {
        // The whole point of deriving it: "format changed, identity did not" must be unreachable
        // rather than merely detectable. This arm pins the current value, so ANY change to a string
        // the format produces reddens here and forces a deliberate decision about the corpus.
        //
        // If you are reading this because the arm just went red: that is the mechanism working. A
        // format change invalidates every existing vector's interpretation, so the question to answer
        // is not "what is the new hash" but "who re-embeds the corpus, and who measures it".
        expect(EMBEDDING_INPUT_FORMAT_ID).toBe('kb-embed-input-v1-d1a862171da9');
    });

    test('the identity carries a readable family AND a derived suffix', () => {
        // The prefix is for the operator reading row metadata; the suffix is what carries the
        // guarantee. Asserting the shape rather than only the value keeps a future bump from
        // accidentally dropping either half.
        expect(EMBEDDING_INPUT_FORMAT_ID).toMatch(/^kb-embed-input-v1-[a-f0-9]{12}$/);
    });

    test('the probe set reaches the type-first branch — the sensitivity this depends on', () => {
        // A digest is only as sensitive as the inputs it hashes, so the branch whose reversal already
        // renamed every header once must be reachable from the probes. Asserted through the format's
        // own functions: a chunk with `type` is named by `type`, one without falls back to `kind`.
        // If this pair ever stopped differing, the digest would go blind to that contract while the
        // arm above still passed.
        const withType    = {kind: 'method', name: 'n', className: 'C', type: 'src', content: 'b'},
              withoutType = {kind: 'method', name: 'n', className: 'C', content: 'b'};

        expect(buildEmbeddingInputHeader(withType)).not.toBe(buildEmbeddingInputHeader(withoutType));
        expect(buildEmbeddingInputText(withType)).toContain('src:');
        expect(buildEmbeddingInputText(withoutType)).toContain('method:');
    });
});

test.describe('classifyRowFormat — absence is the discriminator (#17428)', () => {
    test('a PRE-MARKER row and a FRESH row are separated even though their chunk fields are identical', () => {
        // This is the pair the ticket said nothing on disk could distinguish: both carry `kind` and
        // no `type`, same content, same everything a parser wrote. Only the marker differs, and its
        // absence is what names the stale one.
        const shared = {kind: 'method', name: 'sameName', className: 'SameClass', tenantId: 't1'};

        const preMarker = {...shared},
              fresh     = {...shared, [EMBEDDING_INPUT_FORMAT_METADATA_KEY]: EMBEDDING_INPUT_FORMAT_ID};

        expect(classifyRowFormat(preMarker)).toBe('pre-marker');
        expect(classifyRowFormat(fresh)).toBeNull();
    });

    test('a row from a SUPERSEDED format is stale for a different, separately-named reason', () => {
        // Two causes, never merged: an operator reading "1000 stale" cannot tell whether a repair run
        // worked, while "0 pre-marker, 1000 format-changed" says the marker landed and the format
        // then moved.
        expect(classifyRowFormat({[EMBEDDING_INPUT_FORMAT_METADATA_KEY]: 'kb-embed-input-v1-000000000000'}))
            .toBe('format-changed');
    });

    test('IDEMPOTENCE: a repaired row is never selected again', () => {
        // A detector that re-selects its own output turns a bounded repair into a loop, which on a
        // plane paying days of compute is worse than not repairing at all.
        const repaired = {kind: 'method', [EMBEDDING_INPUT_FORMAT_METADATA_KEY]: EMBEDDING_INPUT_FORMAT_ID};

        expect(classifyRowFormat(repaired)).toBeNull();
        // And again on a second pass over the same row — the classification is a pure function of the
        // row, so there is no accumulated state that could flip it.
        expect(classifyRowFormat(repaired)).toBeNull();
    });

    test('every unusable metadata shape fails toward STALE, not toward current', () => {
        // Direction of the wrong answer is the whole design: re-embedding a row that did not need it
        // costs compute, while skipping one that did leaves a stale vector nothing will look at
        // again. So anything that cannot PROVE it is current is treated as stale.
        for (const shape of [undefined, null, 'a string', 42, [], {}, {[EMBEDDING_INPUT_FORMAT_METADATA_KEY]: null},
            {[EMBEDDING_INPUT_FORMAT_METADATA_KEY]: ''}]) {
            expect(classifyRowFormat(shape), `${JSON.stringify(shape) ?? 'undefined'} must not read as current`)
                .toBe('pre-marker');
        }
    });

    test('the comparison target is injectable, so a caller can census against a NAMED format', () => {
        // Needed for the before/after measurement: a repair run has to be able to ask "how many rows
        // are not yet at the format I am writing", including in a test that must not depend on the
        // live digest.
        const stored = {[EMBEDDING_INPUT_FORMAT_METADATA_KEY]: 'kb-embed-input-v1-aaaaaaaaaaaa'};

        expect(classifyRowFormat(stored, 'kb-embed-input-v1-aaaaaaaaaaaa')).toBeNull();
        expect(classifyRowFormat(stored, 'kb-embed-input-v1-bbbbbbbbbbbb')).toBe('format-changed');
    });
});

test.describe('foldStaleEmbeddingCensus — the count is a measurement, not an inference (#17428)', () => {
    test('counts scanned, stale and current separately, with causes split', () => {
        const census = foldStaleEmbeddingCensus({rows: [
            row('a', {kind: 'method'}),
            row('b', {kind: 'method', [EMBEDDING_INPUT_FORMAT_METADATA_KEY]: EMBEDDING_INPUT_FORMAT_ID}),
            row('c', {kind: 'method', [EMBEDDING_INPUT_FORMAT_METADATA_KEY]: 'kb-embed-input-v1-000000000000'}),
            row('d', {kind: 'class-config'})
        ]});

        expect(census.scannedCount).toBe(4);
        expect(census.staleCount).toBe(3);
        expect(census.currentCount).toBe(1);
        expect(census.byCause).toEqual({'pre-marker': 2, 'format-changed': 1});
        expect(census.staleIds.sort()).toEqual(['a', 'c', 'd']);
        expect(census.idsTruncated).toBe(false);
    });

    test('scanned = stale + current, so a row can never be silently dropped', () => {
        // The invariant an operator relies on when comparing two runs. A row that classified into
        // neither bucket would make a shrinking stale count look like progress.
        const rows = Array.from({length: 25}, (_, i) => row(`r${i}`,
                  i % 3 === 0 ? {} : {[EMBEDDING_INPUT_FORMAT_METADATA_KEY]: EMBEDDING_INPUT_FORMAT_ID})),
              census = foldStaleEmbeddingCensus({rows});

        expect(census.staleCount + census.currentCount).toBe(census.scannedCount);
        expect(census.scannedCount).toBe(25);
    });

    test('a TRUNCATED id list says so, while the count keeps counting', () => {
        // A truncated list that did not declare itself would read as the complete work set, and a
        // repair driven off it would stop early while reporting success — "no silent partial repair"
        // in its detection half.
        const census = foldStaleEmbeddingCensus({
            rows   : Array.from({length: 10}, (_, i) => row(`r${i}`, {})),
            idLimit: 4
        });

        expect(census.staleCount, 'the count is not capped by the id limit').toBe(10);
        expect(census.staleIds).toHaveLength(4);
        expect(census.idsTruncated).toBe(true);
    });

    test('an empty scan reports zeros rather than absence', () => {
        // A caller that scanned nothing must still emit a measurement: an absent census cannot
        // distinguish "no stale rows" from "never looked", which is the distinction the whole ticket
        // turns on.
        for (const rows of [[], null, undefined]) {
            const census = foldStaleEmbeddingCensus({rows});

            expect(census.scannedCount).toBe(0);
            expect(census.staleCount).toBe(0);
            expect(census.byCause).toEqual({'pre-marker': 0, 'format-changed': 0});
        }

        expect(emptyStaleEmbeddingCensus()).toEqual(foldStaleEmbeddingCensus({rows: []}));
    });
});

test.describe('mergeStaleEmbeddingCensus — pagination cannot lose a row (#17428)', () => {
    test('a paged scan totals exactly what one big scan would', () => {
        // The property that makes pagination safe to add: folding pages then merging must equal
        // folding everything at once. Without it, a corpus larger than one page reports a number
        // nobody can act on.
        const all = Array.from({length: 30}, (_, i) => row(`r${i}`,
                  i % 4 === 0 ? {} : {[EMBEDDING_INPUT_FORMAT_METADATA_KEY]: EMBEDDING_INPUT_FORMAT_ID})),
              whole = foldStaleEmbeddingCensus({rows: all});

        let paged = emptyStaleEmbeddingCensus();

        for (let offset = 0; offset < all.length; offset += 7) {
            paged = mergeStaleEmbeddingCensus(paged, foldStaleEmbeddingCensus({rows: all.slice(offset, offset + 7)}));
        }

        expect(paged.scannedCount).toBe(whole.scannedCount);
        expect(paged.staleCount).toBe(whole.staleCount);
        expect(paged.currentCount).toBe(whole.currentCount);
        expect(paged.byCause).toEqual(whole.byCause);
        expect(paged.staleIds.sort()).toEqual(whole.staleIds.sort());
    });

    test('truncation is detected when two UNDER-limit pages merge into an over-limit list', () => {
        // The case that carrying only the inputs' flags would miss: neither page truncated on its
        // own, so a naive OR of two `false`s reports a complete list that is not one.
        const left  = foldStaleEmbeddingCensus({rows: [row('a', {}), row('b', {})], idLimit: 10}),
              right = foldStaleEmbeddingCensus({rows: [row('c', {}), row('d', {})], idLimit: 10});

        expect(left.idsTruncated, 'neither input may already be truncated, or the arm proves nothing').toBe(false);
        expect(right.idsTruncated).toBe(false);

        const merged = mergeStaleEmbeddingCensus(left, right, 3);

        expect(merged.staleIds).toHaveLength(3);
        expect(merged.staleCount, 'the count still totals both pages').toBe(4);
        expect(merged.idsTruncated).toBe(true);
    });
});

test.describe('the census walk — pagination and scope at the script boundary (#17428)', () => {
    /**
     * A collection stub that pages a fixed row set and records every request it received.
     * @param {Array<{id: String, metadata: Object}>} rows Rows to serve.
     * @returns {Object} Stub with a `calls` log.
     */
    function stubCollection(rows) {
        const calls = [];

        return {
            calls,
            async get(request) {
                calls.push(request);

                const page = rows.slice(request.offset, request.offset + request.limit);

                return {ids: page.map(r => r.id), metadatas: page.map(r => r.metadata)}
            }
        };
    }

    test('a corpus larger than one page is fully counted, and the walk terminates', async () => {
        // 4501 rows against a 2000-row page is three pages plus a short one. A walk that mishandled
        // the offset would either loop forever or stop early, and both look like a smaller corpus.
        const rows = Array.from({length: 4501}, (_, i) => row(`r${i}`, i % 2 === 0 ? {} :
                  {[EMBEDDING_INPUT_FORMAT_METADATA_KEY]: EMBEDDING_INPUT_FORMAT_ID})),
              stub   = stubCollection(rows),
              census = await censusCollection(stub, null, 10);

        expect(census.scannedCount, 'every row must be reached exactly once').toBe(4501);
        expect(census.staleCount).toBe(2251);
        expect(census.currentCount).toBe(2250);
        expect(census.staleIds).toHaveLength(10);
        expect(census.idsTruncated).toBe(true);

        // Offsets advance by what was RETURNED, and the walk asks once more after the last full page
        // rather than inferring the end from a full page — the inference that stops a census early.
        expect(stub.calls.map(c => c.offset)).toEqual([0, 2000, 4000, 4501]);
    });

    test('an empty collection yields a measurement of zero, in ONE request', async () => {
        const stub   = stubCollection([]),
              census = await censusCollection(stub, null, 10);

        expect(census.scannedCount).toBe(0);
        expect(census.staleCount).toBe(0);
        expect(stub.calls).toHaveLength(1);
    });

    test('the walk reads METADATA ONLY, and passes a tenant scope through untouched', async () => {
        // Pulling vectors would make the diagnostic cost what the work it measures costs; and a scope
        // silently dropped would report a whole-corpus number under a tenant label.
        const stub = stubCollection([row('a', {})]);

        await censusCollection(stub, {tenantId: 't7'}, 5);

        expect(stub.calls[0].include).toEqual(['metadatas']);
        expect(stub.calls[0].where).toEqual({tenantId: 't7'});
    });

    test('no scope means no `where` key at all, rather than an empty filter', async () => {
        // An empty object is a filter, and a filter is not the same request as no filter.
        const stub = stubCollection([row('a', {})]);

        await censusCollection(stub, null, 5);

        expect('where' in stub.calls[0]).toBe(false);
    });
});

test.describe('the census flags refuse what they do not understand (#17428)', () => {
    test('a mistyped flag fails loud instead of censusing something else', () => {
        // Silently ignoring `--tenat` would report every tenant under a run the operator believed was
        // scoped, and nothing in the output would say so.
        expect(() => parseArgs(['--tenat', 't1'])).toThrow(/unknown argument/);
        expect(() => parseArgs(['--ids', 'lots'])).toThrow(/non-negative integer/);
        expect(() => parseArgs(['--ids', '-3'])).toThrow(/non-negative integer/);
    });

    test('the accepted flags parse, and the id cap has a default', () => {
        expect(parseArgs([])).toEqual({tenant: null, idLimit: 20, json: null, help: false});
        expect(parseArgs(['--tenant', 't1', '--ids', '0'])).toMatchObject({tenant: 't1', idLimit: 0});
        expect(parseArgs(['--help'])).toMatchObject({help: true});
    });
});
