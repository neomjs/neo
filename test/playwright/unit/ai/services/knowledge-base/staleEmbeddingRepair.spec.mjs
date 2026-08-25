import {test, expect}          from '@playwright/test';
import Neo                     from '../../../../../../src/Neo.mjs';
import * as core               from '../../../../../../src/core/_export.mjs';
import {buildChunkRowMetadata} from '../../../../../../ai/services/knowledge-base/helpers/chunkRowMetadata.mjs';
import {
    EMBEDDING_INPUT_FORMAT_ID,
    buildEmbeddingInputText
} from '../../../../../../ai/services/knowledge-base/helpers/embeddingInputFormat.mjs';
import {
    EMBEDDING_INPUT_CHUNK_FIELDS,
    planStaleEmbeddingRepair,
    rebuildChunkFromRowMetadata,
    rebuildEmbeddingInputFromRowMetadata
} from '../../../../../../ai/services/knowledge-base/helpers/staleEmbeddingRepair.mjs';

/**
 * The property under test is FIDELITY, not "a vector was produced".
 *
 * A repair that re-embeds a row with a provider input differing from what ingestion would have built
 * still stamps the row with the current marker. The row then reads as repaired to every future
 * census while carrying a vector no ingestion ever produced — undetectable by construction, and
 * strictly worse than the stale vector it replaced. So the oracle here is equality against
 * `buildEmbeddingInputText` on the ORIGINAL chunk, never "the rebuilt text is non-empty".
 *
 * The fixtures below are the writer's round trip end to end: build metadata with the real
 * `buildChunkRowMetadata`, then rebuild from it. Hand-writing the metadata would let the test agree
 * with a shape the producer never emits.
 */

// One entry per branch the format has, mirroring the format module's own probe rationale: `kind`
// alone, `type` alongside `kind`, absent `className`, `description` over `content`, and neither body
// field. The last two carry explicit nulls, which is the branch that motivated this module.
const ROUND_TRIP_CHUNKS = [
    {kind: 'method', name: 'probeA', className: 'ProbeClass', content: 'probe body'},
    {kind: 'method', name: 'probeA', className: 'ProbeClass', content: 'probe body', type: 'src'},
    {kind: 'class-config', name: 'probeB', content: 'probe body'},
    {kind: 'method', name: 'probeC', className: 'ProbeClass', content: 'body', description: 'probe description'},
    {kind: 'method', name: 'probeD', className: 'ProbeClass'},
    {kind: 'method', name: 'probeE', className: null, content: 'probe body'},
    {kind: 'method', name: 'probeF', className: 'ProbeClass', content: null, description: 'desc'},
    {kind: 'method', name: 'probeG', className: null, content: null, description: null, type: null}
];

test.describe('staleEmbeddingRepair — a rebuilt provider input matches what ingestion would send', () => {
    for (const chunk of ROUND_TRIP_CHUNKS) {
        test(`round trip is byte-identical: ${JSON.stringify(chunk)}`, () => {
            const metadata = buildChunkRowMetadata(chunk);

            expect(rebuildEmbeddingInputFromRowMetadata(metadata)).toBe(buildEmbeddingInputText(chunk))
        });
    }

    test('the null serialisation is REVERSED, not replayed — the defect this module exists for', () => {
        // `buildChunkRowMetadata` writes the STRING 'null'. Replayed literally it is truthy, so
        // `className || ''` yields 'null' and the header reads `in null` where ingestion produced
        // `in `. This asserts the corrected direction rather than merely that a string came back.
        const chunk    = {kind: 'method', name: 'probeE', className: null, content: 'probe body'},
              metadata = buildChunkRowMetadata(chunk);

        expect(metadata.className, 'the writer really does serialise null as a string').toBe('null');
        expect(rebuildChunkFromRowMetadata(metadata).className).toBeNull();
        expect(rebuildEmbeddingInputFromRowMetadata(metadata)).not.toContain('in null')
    });

    test('a field the format reads is enumerated — an unlisted one would rebuild as undefined', () => {
        // The fidelity property above is only as strong as this list, so it is asserted directly
        // rather than left implicit in the round trip.
        for (const field of ['className', 'content', 'description', 'kind', 'name', 'type']) {
            expect(EMBEDDING_INPUT_CHUNK_FIELDS).toContain(field)
        }
    });

    test('the format marker is NOT copied back onto the rebuilt chunk', () => {
        // The row's claim about its format belongs to the module that owns the format. A rebuilt
        // chunk carrying it could re-stamp a row with a marker derived from stored content.
        const metadata = buildChunkRowMetadata({kind: 'method', name: 'probeA', content: 'body'});

        expect(metadata.kbEmbeddingInputFormat).toBe(EMBEDDING_INPUT_FORMAT_ID);
        expect(rebuildChunkFromRowMetadata(metadata).kbEmbeddingInputFormat).toBeUndefined()
    })
});

test.describe('planStaleEmbeddingRepair — selection is the census predicate, never a second one', () => {
    const staleRow   = id => ({id, metadata: {kind: 'method', name: id, content: 'body'}}),
          currentRow = id => ({
              id,
              metadata: buildChunkRowMetadata({kind: 'method', name: id, content: 'body'})
          });

    test('selects stale rows and skips current ones', () => {
        const plan = planStaleEmbeddingRepair({rows: [staleRow('a'), currentRow('b'), staleRow('c')]});

        expect(plan.selectedCount).toBe(2);
        expect(plan.targets.map(t => t.id)).toEqual(['a', 'c']);
        expect(plan.skippedCurrentCount).toBe(1)
    });

    test('IDEMPOTENCE: a repaired row is not re-selected by a second run', () => {
        // End to end, not only at the classifier. Re-selecting its own output turns a bounded repair
        // into a loop, which on a plane paying days of provider compute is worse than not repairing.
        const repaired = currentRow('a'),
              plan     = planStaleEmbeddingRepair({rows: [repaired]});

        expect(plan.selectedCount).toBe(0);
        expect(plan.targets).toEqual([]);
        expect(plan.skippedCurrentCount).toBe(1)
    });

    test('POSITIVE CONTROL: the same fixture DOES select before it carries the marker', () => {
        // Without this, the idempotence arm above would pass against a planner that selects nothing.
        const {kbEmbeddingInputFormat, ...withoutMarker} = buildChunkRowMetadata({
            kind: 'method', name: 'a', content: 'body'
        });

        expect(planStaleEmbeddingRepair({rows: [{id: 'a', metadata: withoutMarker}]}).selectedCount).toBe(1)
    });

    test('a limit stops selection and SAYS so, rather than reporting a short run as complete', () => {
        const plan = planStaleEmbeddingRepair({rows: [staleRow('a'), staleRow('b'), staleRow('c')], limit: 2});

        expect(plan.selectedCount).toBe(2);
        expect(plan.limitReached).toBe(true)
    });

    test('an un-embeddable row is reported, not sent to the provider', () => {
        // A header with nothing to identify or describe would spend provider compute to store a
        // vector of nothing and then stamp it current, hiding the row from every future census.
        const plan = planStaleEmbeddingRepair({rows: [{id: 'empty', metadata: {}}]});

        expect(plan.emptyInputIds).toEqual(['empty']);
        expect(plan.targets).toEqual([])
    });

    test('every target carries the cause, so a run can report the same split the census does', () => {
        const plan = planStaleEmbeddingRepair({
            rows: [
                staleRow('pre'),
                {id: 'chg', metadata: {kind: 'method', name: 'chg', content: 'b', kbEmbeddingInputFormat: 'older'}}
            ]
        });

        expect(plan.targets.find(t => t.id === 'pre').cause).toBe('pre-marker');
        expect(plan.targets.find(t => t.id === 'chg').cause).toBe('format-changed')
    })
});
