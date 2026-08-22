import {expect, test}                                              from '@playwright/test';
import {extractTicketAcLines, parseAcEvidenceRows, validatePrBody} from '../../../../../ai/scripts/agent-preflight.mjs';

/**
 * The AC-Evidence certificate: the author's machine-checked claim that every close-target AC was
 * addressed. Coverage is matched by COUNT IN ORDER against the ticket's structured AC lines, so
 * the dominant anonymous-checkbox ticket format and the numbered `AC-N:` format both work without
 * migration. The resolver is injected — absent, the gate is a pure shape check; unreadable
 * tickets produce a WARNING and never a verdict.
 */

const bodyWith = (acSection, {resolves = 'Resolves #100'} = {}) => [
    resolves, '',
    'Evidence: L1 (static) → L1 required. No residuals.', '',
    acSection, '',
    '## Deltas', 'one file', '',
    '## Test Evidence', 'All coverage runs in CI.', '',
    '## Post-Merge Validation', 'None deferred.', '',
    'Authored by @neo-fable-clio'
].join('\n');

const ticketWith = acLines => [
    '## Problem', 'prose', '',
    '## Acceptance Criteria', '',
    ...acLines, '',
    '## Provenance', 'prose'
].join('\n');

// Only THIS gate's findings — same separation discipline as the Residual-Owner spec: keying on the
// gate's own wording keeps the instruments separable when several gates speak about one body.
const acFindings = (body, options) =>
    validatePrBody(body, options).missingVisible.filter(entry =>
        /AC Evidence|declares no proof|structured AC/.test(entry));

test.describe('validatePrBody — AC-Evidence certificate gate', () => {
    test('a certified body with non-empty proofs passes the shape check', () => {
        const body = bodyWith('## AC Evidence\n| AC-1 | unit spec: this file |\n| AC-2 | e2e: journey.spec.mjs — 1/1 green, `npx playwright test …` |');

        expect(acFindings(body)).toHaveLength(0)
    });

    test('an EMPTY section fails — a heading certifies nothing', () => {
        const findings = acFindings(bodyWith('## AC Evidence'));

        expect(findings).toHaveLength(1);
        expect(findings[0]).toContain('empty')
    });

    test('an empty, dashed, or promise-word proof slot fails per row', () => {
        const findings = acFindings(bodyWith('## AC Evidence\n| AC-1 |  |\n| AC-2 | - |\n| AC-3 | TBD |\n| AC-4 | real proof |'));

        expect(findings).toHaveLength(3);
        findings.forEach(entry => expect(entry).toContain('declares no proof'))
    });

    test('the heading quoted inside a fence is not a section — the discharge-by-example escape fails', () => {
        const body = [
            'Resolves #100', '',
            'Evidence: L1.', '',
            '```markdown', '## AC Evidence', '| AC-1 | example |', '```', '',
            '## Deltas', 'one file', '',
            '## Test Evidence', 'All coverage runs in CI.', '',
            '## Post-Merge Validation', 'None deferred.', '',
            'Authored by @neo-fable-clio'
        ].join('\n');

        const {missingVisible} = validatePrBody(body);

        expect(missingVisible.some(entry => /only inside a fence/.test(entry))).toBe(true)
    });

    test('coverage: the row count must equal the close target\'s structured AC count', () => {
        const
            resolver = () => ({state: 'ok', acs: extractTicketAcLines(ticketWith([
                '- [ ] first criterion',
                '- [ ] second criterion',
                '- [ ] third criterion'
            ]))}),
            covered  = bodyWith('## AC Evidence\n| AC-1 | spec a |\n| AC-2 | spec b |\n| AC-3 | spec c |'),
            short    = bodyWith('## AC Evidence\n| AC-1 | spec a |\n| AC-2 | spec b |');

        expect(acFindings(covered, {resolveTicketAcs: resolver})).toHaveLength(0);

        const findings = acFindings(short, {resolveTicketAcs: resolver});

        expect(findings).toHaveLength(1);
        expect(findings[0]).toContain('carries 3 structured AC(s)');
        expect(findings[0]).toContain('certifies 2')
    });

    test('a FALSE `No structured ACs` declaration fails against a ticket that carries them', () => {
        const
            resolver = () => ({state: 'ok', acs: ['- [ ] one real criterion']}),
            findings = acFindings(bodyWith('## AC Evidence\nNo structured ACs on #100'), {resolveTicketAcs: resolver});

        expect(findings).toHaveLength(1);
        expect(findings[0]).toContain('declaration is false')
    });

    test('a TRUE `No structured ACs` declaration passes against a ticket without any', () => {
        const resolver = () => ({state: 'ok', acs: []});

        expect(acFindings(bodyWith('## AC Evidence\nNo structured ACs on #100'), {resolveTicketAcs: resolver})).toHaveLength(0)
    });

    test('an unreadable or missing ticket produces a WARNING, never a verdict', () => {
        const body = bodyWith('## AC Evidence\n| AC-1 | spec a |');

        for (const state of ['unknown', 'missing']) {
            const result = validatePrBody(body, {resolveTicketAcs: () => ({acs: [], state})});

            expect(result.valid).toBe(true);
            expect(result.warnings.some(entry => /NOT verified/.test(entry))).toBe(true)
        }
    });

    test('a DRAFT with a close target surfaces a count mismatch as a warning, not a failure', () => {
        const
            resolver = () => ({state: 'ok', acs: ['- [ ] a', '- [ ] b']}),
            result   = validatePrBody(bodyWith('## AC Evidence\n| AC-1 | spec a |'), {draft: true, resolveTicketAcs: resolver});

        expect(result.valid).toBe(true);
        expect(result.warnings.some(entry => /carries 2 structured AC\(s\)/.test(entry))).toBe(true)
    });

    test('a DRAFT without a close target skips the content gate entirely', () => {
        const
            resolver = () => {throw new Error('must not be called')},
            body     = bodyWith('## AC Evidence', {resolves: 'Refs #100'});

        expect(acFindings(body, {draft: true, resolveTicketAcs: resolver})).toHaveLength(0)
    });

    test('extractTicketAcLines: anonymous checkboxes and numbered bullets count; sub-bullets do not', () => {
        expect(extractTicketAcLines(ticketWith([
            '- [ ] first',
            '- [x] second, already checked',
            '  - [ ] an indented elaboration — not its own criterion',
            '- AC-3: a numbered one'
        ]))).toHaveLength(3);

        expect(extractTicketAcLines('## Problem\nno criteria section at all')).toHaveLength(0)
    });

    test('extractTicketAcLines: a struck-through AC is an amendment, not a live criterion', () => {
        // an honestly amended ticket keeps its history visible; the count follows the LIVE list
        expect(extractTicketAcLines(ticketWith([
            '- [ ] ~~the original wording, amended mid-PR~~',
            '- [ ] the corrected criterion',
            '- [ ] a second live criterion'
        ]))).toHaveLength(2)
    });

    test('parseAcEvidenceRows: header and separator rows are not certificates', () => {
        expect(parseAcEvidenceRows('| AC | Evidence |\n| --- | --- |\n| AC-1 | proof |')).toEqual([
            {id: '1', proof: 'proof'}
        ])
    })
});
