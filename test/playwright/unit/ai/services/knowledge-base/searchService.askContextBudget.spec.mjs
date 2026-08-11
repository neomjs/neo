import {expect, test}       from '@playwright/test';
import {assembleAskContext} from '../../../../../../ai/services/knowledge-base/helpers/askContextBudget.mjs';

/**
 * @summary Convicts the ask-synthesis context budget.
 *
 * `ask_knowledge_base` assembled every hit's WHOLE file into the prompt with no character or token
 * cap, so request cost was decided by whatever ranked top-`limit`. `limit` is a proxy for cost, not a
 * bound on it: two large documents exceed a deadline that five small ones fit inside, which is why
 * lowering the default relocates the cliff instead of removing it.
 *
 * The arms below pin the two properties a bound has to have to be worth anything — that it BINDS, and
 * that it says so — plus the control that proves it did not change behaviour for bodies under it.
 */

const doc = (name, content) => ({name, source: `src/${name}.mjs`, content});

/**
 * The pre-budget format, reproduced independently of the implementation. If `assembleAskContext`
 * ever reformats a block, this literal is what fails — asserting against a helper-built expectation
 * would prove the helper agrees with itself.
 */
const legacyFormat = documents => documents
    .map((d, i) => `--- DOCUMENT ${i + 1} (${d.name} from ${d.source}) ---\n${d.content}`)
    .join('\n\n');

test.describe('assembleAskContext — ask context budget (#16999)', () => {
    test('UNBOUNDED (0/0) is byte-identical to the pre-budget assembly', () => {
        // The control that makes every other arm meaningful. A budget that also rewrote small bodies
        // would be a behaviour change wearing a bug fix, and no latency measurement would show it.
        const documents = [doc('A', 'alpha'.repeat(50)), doc('B', 'beta'.repeat(50))],
              result    = assembleAskContext({documents, budgetChars: 0, maxCharsPerDocument: 0});

        expect(result.context).toBe(legacyFormat(documents));
        expect(result.truncated).toBe(false);
        expect(result.notice).toBe('');
    });

    test('a body UNDER the budget is byte-identical even with the bound ACTIVE', () => {
        // Distinct from the arm above: the bound is switched ON here. This is the case that would
        // regress if the implementation always sliced, or charged the separator wrongly.
        const documents = [doc('A', 'a'.repeat(100)), doc('B', 'b'.repeat(100))],
              result    = assembleAskContext({documents, budgetChars: 48000, maxCharsPerDocument: 12000});

        expect(result.context).toBe(legacyFormat(documents));
        expect(result.truncated).toBe(false);
    });

    test('the PER-DOCUMENT cap stops one oversized document consuming the whole budget', () => {
        // The defect a total-only budget still has: doc A eats everything and the synthesis never
        // sees B, so a ranked-second document that would have answered the question is invisible.
        const documents = [doc('A', 'a'.repeat(40000)), doc('B', 'b'.repeat(500))],
              result    = assembleAskContext({documents, budgetChars: 20000, maxCharsPerDocument: 5000});

        expect(result.context).toContain('DOCUMENT 2 (B from src/B.mjs)');
        expect(result.context).toContain('b'.repeat(500));
        expect(result.includedCount).toBe(2);
        expect(result.droppedCount).toBe(0);
        expect(result.truncated).toBe(true);
    });

    test('the TOTAL budget is honoured, and the assembled context never exceeds it', () => {
        const documents = [doc('A', 'a'.repeat(9000)), doc('B', 'b'.repeat(9000)), doc('C', 'c'.repeat(9000))],
              budget    = 10000,
              result    = assembleAskContext({documents, budgetChars: budget, maxCharsPerDocument: 0});

        expect(result.context.length).toBeLessThanOrEqual(budget);
        expect(result.truncated).toBe(true);
    });

    test('a document whose HEADER cannot fit is dropped, never emitted headerless', () => {
        // An emitted header with no body reads to the model as an empty source — the phantom
        // "No Content" class this file already carries scar tissue for. Dropping is the honest form,
        // and the notice is what keeps the drop from being silent.
        const documents = [doc('A', 'a'.repeat(400)), doc('BBBBBBBBBB', 'b'.repeat(400))],
              result    = assembleAskContext({documents, budgetChars: 430, maxCharsPerDocument: 0});

        expect(result.context).not.toContain('DOCUMENT 2');
        expect(result.droppedCount).toBe(1);
        expect(result.notice).toContain('omitted entirely');
    });

    test('the notice NAMES what happened — shortened documents and omitted ones are distinguishable', () => {
        // "Something was truncated" is not actionable. A caller deciding whether to re-ask with a
        // narrower query needs to know whether material was shortened or dropped outright.
        const shortened = assembleAskContext({
            documents          : [doc('A', 'a'.repeat(9000))],
            budgetChars        : 0,
            maxCharsPerDocument: 1000
        });

        expect(shortened.notice).toContain('Document(s) 1 were shortened');
        expect(shortened.notice).not.toContain('omitted entirely');

        const dropped = assembleAskContext({
            documents          : [doc('A', 'a'.repeat(900)), doc('B', 'b'.repeat(900))],
            budgetChars        : 960,
            maxCharsPerDocument: 0
        });

        expect(dropped.notice).toContain('omitted entirely');
    });

    test('an EMPTY document set is not reported as truncated', () => {
        // The zero-context path short-circuits before synthesis, but the helper must not manufacture
        // a truncation notice for it — a false notice on an honest empty answer would be worse than
        // no notice at all, because it implies material exists that does not.
        const result = assembleAskContext({documents: [], budgetChars: 48000, maxCharsPerDocument: 12000});

        expect(result.context).toBe('');
        expect(result.truncated).toBe(false);
        expect(result.notice).toBe('');
    });

    test('the separator is charged to the budget, so the produced string matches the accounting', () => {
        // Blocks are joined with a blank line. Accounting per-document while producing a joined string
        // overspends by (n-1) * 2 characters — small, and exactly the kind of off-by-a-little that
        // makes a bound "mostly" hold and then fail on the body that matters.
        const documents = Array.from({length: 6}, (_, i) => doc(`D${i}`, 'x'.repeat(200))),
              budget    = 900,
              result    = assembleAskContext({documents, budgetChars: budget, maxCharsPerDocument: 0});

        expect(result.context.length).toBeLessThanOrEqual(budget);
    });
});
