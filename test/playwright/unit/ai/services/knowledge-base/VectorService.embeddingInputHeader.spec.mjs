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
import fs             from 'fs-extra';
import path           from 'path';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

/**
 * The embedding input header must name the chunk's kind, and must not rewrite the header of a chunk
 * that already has one.
 *
 * Two obligations that pull in opposite directions, which is why they are asserted together. The
 * published chunk contract (`parser/parsed-chunk-v1.schema.json`) requires `kind` and declares no
 * `type`, so a chunk from any parser written against it rendered the literal string `undefined` as
 * the first token of the text that gets embedded. But `type` and `kind` are not synonyms where both
 * exist: the in-repo parsers set `type` to the corpus bucket (`src` / `app` / `example`) and `kind`
 * to the chunk shape (`method`, `class-config`). So the obvious repair — read `kind` first, matching
 * the sibling metadata sites — would rewrite the header of every chunk that already works.
 *
 * That rewrite would also be UNDETECTABLE. This text is derived and is not a member of `hashInputs`,
 * so re-ingestion would not re-embed the affected rows: existing rows would keep vectors built from
 * the old string while new rows carried the new one, with no reconciliation signal separating them.
 * The no-drift arm below is therefore the load-bearing one, not the red-proof — a `kind`-first
 * implementation passes the red-proof and ships the corpus split.
 */
// Deliberately NOT `mode: 'serial'`, unlike its sibling KB specs. Serial skips the remaining arms
// once one fails, which makes per-arm mutation specificity unmeasurable — and specificity is the
// property this file exists to carry: reading `kind` first must redden the no-drift arm ALONE, and
// that is only observable if the others still report. Nothing here mutates shared state; the builders
// are pure and the last arm only reads a file.
test.describe('VectorService — the embedding input header names the chunk kind', () => {
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

    test('RED-PROOF: a chunk shaped as the published contract requires names its kind', () => {
        // Against the pre-fix tree this asserted `undefined: Foo in Foo`. `kind` present and NO `type`
        // key is not a degenerate fixture — it is exactly what the schema's `required` list mandates
        // and its `properties` map permits, so it is the shape every external parser emits.
        const schemaShaped = {...baseChunk, kind: 'class'};

        expect(firstLine(KB_VectorService.buildEmbeddingInputText(schemaShaped))).toBe('class: Foo in Foo');
        expect(
            KB_VectorService.buildEmbeddingInputText(schemaShaped),
            'the literal word `undefined` must not reach the provider input at all'
        ).not.toContain('undefined');
    });

    test('NO-DRIFT: a chunk carrying BOTH fields with DIFFERENT values still names type', () => {
        // The arm that matters most. `type` is the corpus bucket and `kind` the chunk shape, so this
        // fixture is the real in-repo parser shape rather than a contrived one — `SourceParser` emits
        // `{type: 'src', kind: 'method'}` for every method chunk it produces.
        //
        // A `kind`-first implementation returns `method: …` here and passes every other arm in this
        // file. It would also silently split the corpus, because the header is not in `hashInputs`.
        const bothFields = {...baseChunk, type: 'src', kind: 'method'};

        expect(
            firstLine(KB_VectorService.buildEmbeddingInputText(bothFields)),
            'reading kind first rewrites the header of every chunk that already works, and nothing re-embeds them'
        ).toBe('src: Foo in Foo');
    });

    test('NEITHER field present is unchanged, not a new throw', () => {
        // The schema requires `kind`, so this chunk is malformed — and a guard that assumes compliance
        // is the reason this defect existed. A malformed chunk previously produced a string; it must
        // still produce one rather than starting to throw inside the embed path, where the failure
        // would surface as a provider error rather than as the contract violation it is.
        const malformed = {...baseChunk};

        expect(() => KB_VectorService.buildEmbeddingInputText(malformed)).not.toThrow();
        expect(firstLine(KB_VectorService.buildEmbeddingInputText(malformed))).toBe('undefined: Foo in Foo');
    });

    test('the two builders agree, compared against EACH OTHER rather than against a literal', () => {
        // `IngestionService.buildEmbeddingInputText`'s docblock has always claimed "the same shape as
        // `VectorService.embedChunks`" while its body was a second copy — and the copies drifted, which
        // is how the guardrail came to measure one string while the provider received another.
        //
        // Asserted as equality between the two, not as each matching a hardcoded header: a literal on
        // both sides is two assertions about my expectation and none about their agreement.
        for (const chunk of [
            {...baseChunk, kind: 'class'},
            {...baseChunk, type: 'src', kind: 'method'},
            {...baseChunk, type: 'app', description: 'a described chunk'},
            {...baseChunk}
        ]) {
            expect(
                KB_IngestionService.buildEmbeddingInputText(chunk),
                `the two builders disagree for ${JSON.stringify(chunk)}`
            ).toBe(KB_VectorService.buildEmbeddingInputText(chunk));
        }
    });

    test('the header is a genuine prefix of the provider input text', () => {
        // Cheap, and it is what makes measuring the header equivalent to measuring the real prefix.
        const chunk  = {...baseChunk, kind: 'module-context'},
              header = KB_VectorService.buildEmbeddingInputHeader(chunk);

        expect(KB_VectorService.buildEmbeddingInputText(chunk).startsWith(header)).toBe(true);
    });

    test('the byte-budget PLANNER measures that header rather than restating its template', () => {
        // Subject discipline: an earlier version of this arm asserted the BUILDER's byte delta and was
        // vacuous against the requirement — restoring the planner's own copy of the template left it
        // green. The subject has to be `splitOversizedEmbeddingChunk`'s budget, observed through its
        // output, and the observable is a comparison rather than an arithmetic restatement.
        //
        // Two chunks identical but for header length. A planner that measures the real header leaves
        // the shorter-header chunk MORE room for content, so its first part is longer by exactly the
        // header difference. A planner restating `chunk.type` renders `undefined: …` for both — the
        // budgets become equal and the difference collapses to zero.
        // The fixtures vary `type`, not `kind`, and that keeps this arm's subject SEPARATE from the
        // field-order arms above: reverting the header to `chunk.type` alone must redden the red-proof
        // and leave this one green, because this one is about where the planner gets its number, not
        // about which field the header names. Varying `kind` here coupled the two and cost this arm its
        // specificity.
        const content    = 'a'.repeat(600),
              guardrail  = {contextLimitTokens: 200, safeProcessingLimitTokens: 200},
              createHash = () => 'fixed-hash',

              shortKind = {...baseChunk, type: 'fn', kind: 'class', content},
              longKind  = {...baseChunk, type: 'module-context', kind: 'class', content},

              shortParts = KB_VectorService.splitOversizedEmbeddingChunk({chunk: shortKind, guardrail, createHash}),
              longParts  = KB_VectorService.splitOversizedEmbeddingChunk({chunk: longKind, guardrail, createHash});

        // Non-vacuity: if the band did not actually force a split, the comparison below is comparing
        // two un-split chunks and would pass no matter what the planner did.
        expect(shortParts.length, 'the band must force a split or this arm proves nothing').toBeGreaterThan(1);
        expect(longParts.length, 'the band must force a split or this arm proves nothing').toBeGreaterThan(1);

        expect(
            shortParts[0].content.length - longParts[0].content.length,
            'the planner is not measuring the header it hands the provider — a restated template gives both chunks the same budget'
        ).toBe('module-context'.length - 'fn'.length);
    });

    test('CORPUS INVARIANT: the header is derived, and must stay out of hashInputs', () => {
        // The reason the no-drift arm exists, asserted directly rather than left in prose. If a later
        // change ever folds the embedding text into the chunk hash, the trade-off above inverts — a
        // header change would then re-mint ids and force a re-embed instead of splitting the corpus
        // silently. Either way the decision must be deliberate, so it is pinned here.
        //
        // Read from the shipped declarations rather than restated: a hardcoded field list here would
        // agree with itself forever.
        const source = fs.readFileSync(
                  path.resolve(process.cwd(), 'ai/services/knowledge-base/IngestionService.mjs'),
                  'utf8'
              ),
              declarations = source.match(/hashInputs\s*:\s*\[[^\]]*\]/g) ?? [];

        expect(declarations.length, 'no hashInputs declaration found — this arm would pass vacuously').toBeGreaterThan(0);

        for (const declaration of declarations) {
            expect(declaration, 'the derived provider text must not become a chunk-identity input').not.toMatch(/text|inputText|header/i);
            expect(declaration, "the chunk kind IS an identity input, so a fixture that lost it would not be the real contract").toContain("'kind'");
        }
    });
});
