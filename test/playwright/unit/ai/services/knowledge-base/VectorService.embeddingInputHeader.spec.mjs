import {setup} from '../../../../setup.mjs';

const appName = 'KBEmbeddingInputHeaderTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: false,
        unitTestMode           : true,
        useDomApiRenderer      : false
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

/**
 * The provider-input header contract: **`type` first, `kind` as fallback**, one authority, and a
 * format whose changes are corpus-level rather than cosmetic.
 *
 * Two obligations that pull against each other, which is why they are asserted together:
 *
 * 1. The published chunk contract (`parser/parsed-chunk-v1.schema.json`) requires `kind` and declares
 *    no `type`, so a chunk from any parser written against it must be named by its `kind`.
 * 2. Where both fields exist they are different facts — the in-repo parsers set `type` to the corpus
 *    bucket (`src` / `app` / `example`) and `kind` to the chunk shape (`method`, `class-config`) — so
 *    preferring `kind` renames the header of every chunk that already carries a `type`.
 *
 * The second obligation is the load-bearing one, because a rename here is undetectable: this string is
 * derived and is not a member of a chunk's `hashInputs`, so it does not participate in the chunk id.
 * Re-ingestion would not re-embed the affected rows — old rows keep vectors built from the old string,
 * new rows carry the new one, and no reconciliation signal separates them. A `kind`-first
 * implementation satisfies obligation 1 and silently splits the corpus.
 *
 * The final arm observes that non-participation through the hash function itself, so the reasoning
 * above is pinned as behaviour rather than left as prose.
 */
// Deliberately NOT `mode: 'serial'`, unlike its sibling KB specs: serial skips the remaining arms once
// one fails, which makes per-arm specificity unobservable — and specificity is what this file trades
// on. Nothing here mutates shared state.
test.describe('KB provider input — header names type first, kind as fallback', () => {
    let KB_VectorService, KB_IngestionService;

    const baseChunk = {
        name     : 'Foo',
        className: 'Foo',
        content  : 'export default class Foo {}'
    };

    /**
     * Reads the first line, which is the header the assertions are about.
     * @param {String} text
     * @returns {String}
     */
    const firstLine = text => text.split('\n')[0];

    test.beforeAll(async () => {
        KB_VectorService    = (await import('../../../../../../ai/services/knowledge-base/VectorService.mjs')).default;
        KB_IngestionService = (await import('../../../../../../ai/services/knowledge-base/IngestionService.mjs')).default;
    });

    test('a chunk shaped as the published contract requires is named by its kind', () => {
        // `kind` present and no `type` key is exactly what the schema's `required` list mandates and its
        // `properties` map permits — the shape every external parser emits, not a degenerate fixture.
        const schemaShaped = {...baseChunk, kind: 'class'};

        expect(firstLine(KB_VectorService.buildEmbeddingInputText(schemaShaped))).toBe('class: Foo in Foo');
        expect(
            KB_VectorService.buildEmbeddingInputText(schemaShaped),
            'the literal word `undefined` must not reach the provider input'
        ).not.toContain('undefined');
    });

    test('a chunk carrying BOTH fields with DIFFERENT values is named by type', () => {
        // The real in-repo parser shape: `SourceParser` emits `{type: 'src', kind: 'method'}` for every
        // method chunk. A `kind`-first implementation returns `method: …` here, passes every other arm
        // in this file, and splits the corpus.
        const bothFields = {...baseChunk, type: 'src', kind: 'method'};

        expect(
            firstLine(KB_VectorService.buildEmbeddingInputText(bothFields)),
            'naming by kind renames the header of every chunk that already works, and nothing re-embeds them'
        ).toBe('src: Foo in Foo');
    });

    test('neither field present yields a string, not a throw', () => {
        // The schema requires `kind`, so this chunk is malformed. It must still produce a string: a
        // throw inside the embed path surfaces as a provider error rather than as the contract
        // violation it is.
        const malformed = {...baseChunk};

        expect(() => KB_VectorService.buildEmbeddingInputText(malformed)).not.toThrow();
        expect(firstLine(KB_VectorService.buildEmbeddingInputText(malformed))).toBe('undefined: Foo in Foo');
    });

    test('the ingestion guardrail and the vector service read ONE authority', () => {
        // Compared against each other rather than against a literal: a hardcoded header on both sides
        // asserts an expectation twice and their agreement never. The guardrail measures the input the
        // provider receives, so a divergence here means one of them is budgeting for a different string.
        for (const chunk of [
            {...baseChunk, kind: 'class'},
            {...baseChunk, type: 'src', kind: 'method'},
            {...baseChunk, type: 'app', description: 'a described chunk'},
            {...baseChunk}
        ]) {
            expect(
                KB_IngestionService.buildEmbeddingInputText(chunk),
                `the two consumers disagree for ${JSON.stringify(chunk)}`
            ).toBe(KB_VectorService.buildEmbeddingInputText(chunk));
        }
    });

    test('the header is a genuine prefix of the provider input text', () => {
        // What makes measuring the header equivalent to measuring the real prefix.
        const chunk  = {...baseChunk, kind: 'module-context'},
              header = KB_VectorService.buildEmbeddingInputHeader(chunk);

        expect(KB_VectorService.buildEmbeddingInputText(chunk).startsWith(header)).toBe(true);
    });

    test('the byte-budget planner measures that header rather than restating its format', () => {
        // The subject is the planner's budget, observed through the splitter's own output. Two chunks
        // identical but for header LENGTH: a planner measuring the real header leaves the shorter-header
        // chunk more room, so its first part is longer by exactly the difference. A planner carrying its
        // own copy of the format gives both the same budget and the difference collapses to zero.
        //
        // The fixtures vary `type`, not `kind`, which keeps this arm's subject separate from the
        // field-order arms above — this one is about where the number comes from, not which field names
        // the chunk.
        const content    = 'a'.repeat(600),
              guardrail  = {contextLimitTokens: 200, safeProcessingLimitTokens: 200},
              createHash = () => 'fixed-hash',

              shortKind = {...baseChunk, type: 'fn', kind: 'class', content},
              longKind  = {...baseChunk, type: 'module-context', kind: 'class', content},

              shortParts = KB_VectorService.splitOversizedEmbeddingChunk({chunk: shortKind, guardrail, createHash}),
              longParts  = KB_VectorService.splitOversizedEmbeddingChunk({chunk: longKind, guardrail, createHash});

        // Non-vacuity: without a real split this compares two whole chunks and passes regardless.
        expect(shortParts.length, 'the band must force a split or this arm proves nothing').toBeGreaterThan(1);
        expect(longParts.length, 'the band must force a split or this arm proves nothing').toBeGreaterThan(1);

        expect(
            shortParts[0].content.length - longParts[0].content.length,
            'the planner is not measuring the header it hands the provider — a restated format gives both chunks the same budget'
        ).toBe('module-context'.length - 'fn'.length);
    });

    test('CORPUS INVARIANT: provider input can change without changing the chunk id', () => {
        // Observed through `createChunkHash` itself, because this is the property the type-first
        // contract rests on: a header-format change cannot be repaired by re-ingestion.
        //
        // `className` is the stage-matched control — schema-valid, a genuine contributor to the provider
        // input, and NOT a member of `hashInputs`. `kind` is the positive: also in the provider input,
        // and a listed identity input. Both directions are required, because either alone is equally
        // consistent with a hash that ignores its inputs or one that folds in everything.
        const tenantContext = {tenantId: 't1', repoSlug: 'org/r'},

              base = {
                  ...baseChunk,
                  kind         : 'class',
                  sourcePath   : 'src/Foo.mjs',
                  parserId     : 'ext-source',
                  parserVersion: '1.1.0',
                  hashInputs   : ['kind', 'name', 'content', 'sourcePath', 'parserId', 'parserVersion']
              },
              movedClassName = {...base, className: 'Renamed'},
              movedKind      = {...base, kind: 'method'},

              hash = chunk => KB_IngestionService.createChunkHash(chunk, tenantContext);

        expect(
            KB_VectorService.buildEmbeddingInputText(movedClassName),
            'the control must actually move the provider input, or it witnesses nothing'
        ).not.toBe(KB_VectorService.buildEmbeddingInputText(base));

        expect(
            hash(movedClassName),
            'a provider-input change that is not a hashInputs member must leave the chunk id alone — ' +
            'this is why a header-format change cannot be repaired by re-ingestion'
        ).toBe(hash(base));

        expect(
            hash(movedKind),
            'a listed identity input must change the id — without this the assertion above is equally ' +
            'consistent with a hash that ignores everything'
        ).not.toBe(hash(base));
    });
});
