import {test, expect} from '@playwright/test';
import fs             from 'fs-extra';
import path           from 'node:path';

/**
 * @summary Close-relation audit fixtures — the mechanical floor under the reviewer-side close-target audit.
 *
 * The decision core lives inline in the PR-body lint workflow (that file is sync-by-convention: no shared
 * module). This spec slices the function out of the committed workflow between its sentinels — the shipped
 * script is the only producer, never a copied twin — and drives the red/green corpus through it with the
 * close-target bodies as injected input, so the gate is falsifiable off-CI.
 *
 * The corpus encodes the defect classes the gate exists for: a `Resolves` whose target carries unmet,
 * un-annotated acceptance criteria (the named red case); the deferred-evidence annotation convention (the
 * sanctioned escape); a Post-Merge Validation item whose only ticket home closes with the merge; and the
 * no-reference verification box that must NOT fire (open-ended verification closes normally).
 */

const WORKFLOW_PATH = path.resolve(process.cwd(), '.github/workflows/agent-pr-body-lint.yml');

/**
 * Extracts `auditCloseRelations` from the committed workflow file. Fails loud when the sentinels are
 * absent — a gate whose extraction contract breaks must go red, never silently test a stale twin.
 * @returns {Function} The workflow's own decision core
 */
function loadAudit() {
    const source = fs.readFileSync(WORKFLOW_PATH, 'utf8');
    const begin  = source.indexOf('// #16829-CLOSE-RELATION-AUDIT-BEGIN');
    const end    = source.indexOf('// #16829-CLOSE-RELATION-AUDIT-END');

    if (begin === -1 || end === -1 || end <= begin) {
        throw new Error('close-relation audit sentinels missing from agent-pr-body-lint.yml — the spec must extract the shipped function, never a copy')
    }

    return new Function(`${source.slice(begin, end)}; return auditCloseRelations;`)()
}

/**
 * A PR body in the canonical defect shape: it resolves a ticket whose Post-Merge Validation box carries
 * that ticket's unmet acceptance criterion verbatim, with no ticket reference of its own.
 * @param {Object}   [overrides]
 * @param {String}   [overrides.closes]  The `Resolves` target number
 * @param {String[]} [overrides.pmv]     Post-Merge Validation checklist lines
 * @param {String}   [overrides.refs]    Optional non-closing reference line
 * @returns {String}
 */
function prBody({closes = '16806', pmv, refs = ''} = {}) {
    const items = (pmv || [
        "- [ ] `list_issues({assignee: '@me'})` against the merged server returns the caller's open lanes — identical set to `list_issues({assignee: '<caller login>'})`."
    ]).join('\n');

    return [
        `Resolves #${closes}`,
        refs,
        '',
        '## Test Evidence',
        '',
        'receipts',
        '',
        '## Post-Merge Validation',
        '',
        items,
        '',
        'Authored by a test.'
    ].join('\n')
}

/**
 * A close-target ticket body with the given Acceptance Criteria lines.
 * @param {String[]} acLines
 * @returns {String}
 */
function ticketBody(acLines) {
    return [
        '## The Problem',
        '',
        'context',
        '',
        '## Acceptance Criteria',
        '',
        ...acLines,
        '',
        '## Out of Scope',
        ''
    ].join('\n')
}

test.describe('agent-pr-body-lint close-relation audit (#16829)', () => {
    let audit;

    test.beforeAll(() => {
        audit = loadAudit()
    });

    test('named red case: PR #16809 cycle-0 — an unmet, un-annotated AC on the close-target fails, naming ticket and criterion', () => {
        const findings = audit(prBody(), {
            '16806': ticketBody([
                "- [ ] `list_issues({assignee: '@me'})` returns the same set as `list_issues({assignee: '<resolved login>'})` for the authenticated token.",
                '- [x] Non-alias logins pass through with no added REST round-trip.'
            ])
        });

        expect(findings.length, 'exactly one orphan: the unmet AC-1').toBe(1);
        expect(findings[0]).toContain('#16806');
        expect(findings[0]).toContain('returns the same set')
    });

    test('green: the same AC annotated `[L3-deferred]` is the sanctioned residual and passes', () => {
        const findings = audit(prBody(), {
            '16806': ticketBody([
                "- [ ] [L3-deferred — post-merge live equivalence] `@me` returns the same set as the concrete login against the merged server.",
                '- [x] Non-alias logins pass through with no added REST round-trip.'
            ])
        });

        expect(findings).toEqual([])
    });

    test('green: a fully ticked close-target passes', () => {
        const findings = audit(prBody(), {
            '16806': ticketBody([
                '- [x] alias resolves pre-query',
                '- [x] failure path returns a named error'
            ])
        });

        expect(findings).toEqual([])
    });

    test('red: a Post-Merge Validation item referencing only the close-target is a self-home orphan', () => {
        const findings = audit(prBody({
            pmv: ['- [ ] Verify the alias against the merged server (#16806 AC-1).']
        }), {
            '16806': ticketBody(['- [x] alias resolves pre-query'])
        });

        expect(findings.length, 'the item\'s only home closes with the merge').toBe(1);
        expect(findings[0]).toContain('Post-Merge Validation')
    });

    test('green control: a no-reference PMV item against a fully-ticked target rides free (the #16796 open-ended-verification shape)', () => {
        const findings = audit(prBody({closes: '16800'}), {
            '16800': ticketBody(['- [x] digest derived above the watermark'])
        });

        expect(findings, '§5.2 rule 4: open-ended verification closes normally').toEqual([])
    });

    test('green control: a PMV item citing a `Refs`-referenced open parent survives (the leaf-split shape)', () => {
        const findings = audit(prBody({
            closes: '16828',
            pmv   : ['- [ ] live equivalence against the merged server (= #16806 AC-1, verbatim; the parent stays open for it).'],
            refs  : 'Refs #16806'
        }), {
            '16828': ticketBody(['- [x] alias resolves pre-query'])
        });

        expect(findings).toEqual([])
    });

    test('red: a close-target body the audit could not obtain is a loud failure, never a silent pass', () => {
        const findings = audit(prBody(), {});

        expect(findings.length).toBe(1);
        expect(findings[0]).toContain('#16806');
        expect(findings[0]).toContain('must not pass silently')
    });

    test('green: a body without close keywords produces no findings', () => {
        const findings = audit(prBody({pmv: []}).replace('Resolves #16806', 'Refs #16806'), {});

        expect(findings).toEqual([])
    });

    test('the failure annotation teaches: all three sanctioned repairs are named verbatim in the workflow', () => {
        const source = fs.readFileSync(WORKFLOW_PATH, 'utf8');

        expect(source).toContain('(a) tick the delivered ACs on the ticket with their receipts');
        expect(source).toContain('[L<N>-deferred');
        expect(source).toContain('(c) split an L2-delivered leaf (#16776 pattern) and `Resolves` the leaf')
    });
});
