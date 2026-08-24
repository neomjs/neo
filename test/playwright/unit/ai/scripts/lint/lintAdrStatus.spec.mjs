import {test, expect} from '@playwright/test';
import fs             from 'fs';
import os             from 'os';
import path           from 'path';

import {
    LEGAL_STATES,
    OUTSTANDING_MARKER,
    checkAdrStatus,
    checkFile,
    findStatusFields,
    parseStatusValue
} from '../../../../../../ai/scripts/lint/lint-adr-status.mjs';

/**
 * @summary Arms for the decision-record status guard, one per Status spelling plus the rule itself.
 *
 * **Why a separate arm per spelling.** The census that motivated this guard was wrong three times,
 * each hand-rolled pattern silently skipping a different record. A spelling the parser cannot read
 * produces the same silence as one it read and passed, so every arm asserts a violation found
 * *inside* the value — reaching the value is the thing being proven, and a parser that skipped the
 * line would report `no-status` instead.
 *
 * **The reconstruction arms are the permanent non-vacuity guard.** They carry the verbatim status
 * text of records as they read before the reconciliation. If the rule is ever weakened, those arms
 * go green against text that was the defect, and this file fails.
 */

const HEADER = '# ADR 9990: Fixture\n\n| Attribute | Value |\n|---|---|\n';

/** Builds a record whose canonical table row carries `value`. */
const tableRecord = value => `${HEADER}| **Status** | ${value} |\n| **Author** | fixture |\n`;

/** Creates a decisions directory holding the given `name -> content` records. */
function fixtureDir(files) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-adr-status-'));

    for (const [name, content] of Object.entries(files)) {
        fs.writeFileSync(path.join(dir, name), content, 'utf8')
    }

    return dir
}

/** The violation kinds reported for one record, as a plain array for order-free assertions. */
const kinds = (name, content) => checkFile(name, content).map(violation => violation.kind);

test.describe('ai.scripts.lint.lint-adr-status (#17684)', () => {

    test.describe('one arm per Status spelling — the parser reaches the value in all three', () => {

        test('table row: the canonical spelling is parsed and not flagged as syntax', () => {
            const found = findStatusFields(tableRecord('Proposed — 2026-01-01 (on PR merge)'));

            expect(found).toHaveLength(1);
            expect(found[0].syntax).toBe('table');
            expect(found[0].canonical).toBe(true);
            expect(found[0].value).toBe('Proposed — 2026-01-01 (on PR merge)');

            // The value-level rule fires, which is only possible if the value was read.
            expect(kinds('0001-x.md', tableRecord('Proposed — 2026-01-01 (on PR merge)')))
                .toEqual(['self-satisfying-condition'])
        });

        test('colon-outside: parsed, reported as non-canonical, and its value still checked', () => {
            const content = '# ADR 9991\n\n**Status**: Proposed — 2026-01-01 (transitions at the merge gate)\n';
            const found   = findStatusFields(content);

            expect(found).toHaveLength(1);
            expect(found[0].syntax).toBe('colon-outside');
            expect(found[0].canonical).toBe(false);

            // Both, not either: the syntax verdict alone would also be produced by a parser that
            // never looked past the marker.
            expect(kinds('0002-x.md', content).sort())
                .toEqual(['non-canonical-syntax', 'self-satisfying-condition'])
        });

        test('colon-inside: parsed, reported as non-canonical, and its value still checked', () => {
            const content = '# ADR 9992\n\n**Status:** Proposed — 2026-01-01 (until PR merge)\n';
            const found   = findStatusFields(content);

            expect(found).toHaveLength(1);
            expect(found[0].syntax).toBe('colon-inside');
            expect(found[0].canonical).toBe(false);

            expect(kinds('0003-x.md', content).sort())
                .toEqual(['non-canonical-syntax', 'self-satisfying-condition'])
        });

        test('an unreadable spelling is a violation, never a silent pass', () => {
            expect(kinds('0004-x.md', '# ADR 9993\n\nStatus: Accepted 2026-01-01\n'))
                .toEqual(['no-status'])
        });

        test('two Status fields are ambiguous rather than first-wins', () => {
            const content = `${tableRecord('Accepted — 2026-01-01')}\n**Status:** Proposed — 2026-01-01 (at PR merge)\n`;

            expect(kinds('0005-x.md', content)).toContain('multiple-status')
        })
    });

    test.describe('the rule: a condition this merge satisfies is not a condition', () => {

        const MERGE_GATE_PHRASINGS = {
            'human merge gate'   : 'Proposed — 2026-01-01 (transitions to Accepted on approved, green PR merge at the human merge gate, per ADR 0005)',
            'human operator'     : 'Proposed — 2026-01-01 (transitions to Accepted on approved, green PR merge by the human operator)',
            'until PR merge'     : 'Proposed — 2026-01-01 (until PR merge, per ADR 0005 lifecycle)',
            'arrow at PR merge'  : 'Proposed (→ `Accepted` at PR merge; see §5)',
            'the implementing PR': 'Draft (proposed at Discussion #99999 graduation; Accepted on human merge of the implementing PR)'
        };

        for (const [label, phrasing] of Object.entries(MERGE_GATE_PHRASINGS)) {
            test(`rejected — the "${label}" phrasing`, () => {
                expect(kinds('0006-x.md', tableRecord(phrasing))).toEqual(['self-satisfying-condition'])
            })
        }

        test(`an ${OUTSTANDING_MARKER} clause is the one way a pending record passes`, () => {
            const value = `Proposed — 2026-01-01 (${OUTSTANDING_MARKER} operator content-accuracy approval, which no repository probe can verify)`;

            expect(kinds('0007-x.md', tableRecord(value))).toEqual([])
        });

        test('Draft is held to the same rule as Proposed', () => {
            expect(kinds('0008-x.md', tableRecord('Draft (pending)'))).toEqual(['self-satisfying-condition']);
            expect(kinds('0008-x.md', tableRecord(`Draft (${OUTSTANDING_MARKER} the socket wrapper)`))).toEqual([])
        });

        test('the marker is not accepted as a bare word — the clause carries the token', () => {
            expect(kinds('0009-x.md', tableRecord('Proposed — 2026-01-01 (outstanding work remains)')))
                .toEqual(['self-satisfying-condition'])
        })
    });

    test.describe('Accepted must name a merge a reader could check', () => {

        test('a dated Accepted passes', () => {
            expect(kinds('0010-x.md', tableRecord('Accepted — 2026-05-17 (PR #11541)'))).toEqual([])
        });

        test('a bare Accepted fails', () => {
            expect(kinds('0011-x.md', tableRecord('Accepted'))).toEqual(['undated-accepted'])
        });

        test('a hyphen separator is accepted — the date is the assertion, not the dash', () => {
            expect(kinds('0012-x.md', tableRecord('Accepted - 2026-05-22 (merged via PR #11779)'))).toEqual([])
        })
    });

    test.describe('vocabulary is pinned, not inferred', () => {

        test('a fourth state fails rather than passing as unrecognised', () => {
            const violations = checkFile('0013-x.md', tableRecord('Superseded — 2026-01-01 (by 0040)'));

            expect(violations.map(violation => violation.kind)).toEqual(['unknown-state']);
            expect(violations[0].message).toContain(LEGAL_STATES.join(' / '))
        });

        test('parseStatusValue splits the leading word from its justification', () => {
            expect(parseStatusValue('Accepted — 2026-05-17 (PR #11541)'))
                .toEqual({state: 'Accepted', rest: ' — 2026-05-17 (PR #11541)'})
        })
    });

    test.describe('non-vacuity, held permanently', () => {

        test('the verbatim pre-reconciliation text of real records is still red', () => {
            // Each string is the status value one record carried on `dev` before the pass. A weakened
            // rule shows up here as a green that used to be red.
            const before = {
                '0001-cross-process-cache-coherence.md'   : 'Proposed — 2026-04-22',
                '0011-substrate-numbering-convention.md'  : 'Proposed — 2026-05-18 (transitions to Accepted on approved, green PR merge by the human operator)',
                '0019-aiconfig-reactive-provider-ssot.md' : 'Draft (proposed at Discussion #12453 graduation; Accepted on human merge of the implementing PR)',
                '0032-institution-cockpit-render-model.md': 'Proposed (→ `Accepted` at PR merge; see §5)',
                '0040-agentos-extraction-topology.md'     : 'Proposed — 2026-08-22 (transitions to Accepted only on approved, green PR merge at the human merge gate, per ADR 0005)'
            };

            for (const [name, value] of Object.entries(before)) {
                expect(kinds(name, tableRecord(value)), name).toEqual(['self-satisfying-condition'])
            }
        });

        test('a corpus of only pre-reconciliation records reports 0% and fails', () => {
            const dir = fixtureDir({
                '0001-a.md': tableRecord('Proposed — 2026-04-22'),
                '0002-b.md': tableRecord('Proposed — 2026-04-26')
            });

            const result = checkAdrStatus(dir);

            expect(result.ok).toBe(false);
            expect(result.accepted).toBe(0);
            expect(result.percent).toBe(0);
            expect(result.violations).toHaveLength(2)
        })
    });

    test.describe('the live corpus', () => {

        test('every record on this branch carries a status consistent with its own condition', () => {
            const result = checkAdrStatus();

            expect(result.violations).toEqual([]);
            expect(result.ok).toBe(true)
        });

        test('compliance clears the 80% threshold the graduation-lifecycle record prescribes', () => {
            const result = checkAdrStatus();

            expect(result.total).toBeGreaterThan(0);
            expect(result.percent).toBeGreaterThanOrEqual(80)
        });

        test('non-numbered files in the decisions directory are not scanned', () => {
            const dir = fixtureDir({
                '0001-a.md': tableRecord('Accepted — 2026-01-01'),
                'README.md': '# notes\n\n**Status**: whatever\n'
            });

            expect(checkAdrStatus(dir).total).toBe(1)
        })
    })
});
