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
        /AC Evidence|declares no proof|structured AC|names no target|count register|does not resolve|contradict|was not found/.test(entry));

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

    test('transport silence is a WARNING; a confirmed-missing close target is a VERDICT', () => {
        const body = bodyWith('## AC Evidence\n| AC-1 | spec a |');

        const unreadable = validatePrBody(body, {resolveTicketAcs: () => ({acs: [], state: 'unknown'})});

        expect(unreadable.valid).toBe(true);
        expect(unreadable.warnings.some(entry => /NOT verified/.test(entry))).toBe(true);

        // a 404 answers about the CONTENT: this PR resolves a ticket that does not exist
        const missing = validatePrBody(body, {resolveTicketAcs: () => ({acs: [], state: 'missing'})});

        expect(missing.valid).toBe(false);
        expect(missing.missingVisible.some(entry => /was not found/.test(entry))).toBe(true)
    });

    test('duplicate, gapped, or out-of-order certificate ids break the count register', () => {
        const resolver = () => ({state: 'ok', acs: ['- [ ] a', '- [ ] b']});

        for (const rows of [
            '| AC-1 | p |\n| AC-1 | q |',
            '| AC-1 | p |\n| AC-3 | q |',
            '| AC-2 | p |\n| AC-1 | q |'
        ]) {
            const findings = acFindings(bodyWith(`## AC Evidence\n${rows}`), {resolveTicketAcs: resolver});

            expect(findings.some(entry => /count register/.test(entry))).toBe(true)
        }
    });

    test('SEVERAL close targets: every target is certified — a short second target fails', () => {
        const
            acsByTarget = {100: ['- [ ] a', '- [ ] b'], 200: ['- [ ] c', '- [ ] d']},
            resolver    = target => ({state: 'ok', acs: acsByTarget[target]}),
            resolves    = 'Resolves #100\n\nResolves #200';

        const full = bodyWith(
            '## AC Evidence\n| #100 AC-1 | p |\n| #100 AC-2 | q |\n| #200 AC-1 | r |\n| #200 AC-2 | s |',
            {resolves});

        expect(acFindings(full, {resolveTicketAcs: resolver})).toHaveLength(0);

        // the second target only half-certified — the control RA-1 demanded
        const short = bodyWith(
            '## AC Evidence\n| #100 AC-1 | p |\n| #100 AC-2 | q |\n| #200 AC-1 | r |',
            {resolves});

        const findings = acFindings(short, {resolveTicketAcs: resolver});

        expect(findings.some(entry => /#200 carries 2 structured/.test(entry))).toBe(true)
    });

    test('SEVERAL close targets: an unqualified row names no owner and fails', () => {
        const body = bodyWith('## AC Evidence\n| AC-1 | p |', {resolves: 'Resolves #100\n\nResolves #200'});

        expect(acFindings(body).some(entry => /names no target/.test(entry))).toBe(true)
    });

    test('a row or declaration naming a ticket this PR does not resolve fails', () => {
        expect(acFindings(bodyWith('## AC Evidence\n| #999 AC-1 | p |'))
            .some(entry => /does not resolve/.test(entry))).toBe(true);

        expect(acFindings(bodyWith('## AC Evidence\nNo structured ACs on #999'))
            .some(entry => /does not resolve/.test(entry))).toBe(true)
    });

    test('rows AND a declaration for the same target contradict — shape-level, no resolver needed', () => {
        const body = bodyWith('## AC Evidence\n| AC-1 | p |\nNo structured ACs on #100');

        expect(acFindings(body).some(entry => /contradict/.test(entry))).toBe(true)
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

    test('parseAcEvidenceRows: header and separator rows are not certificates; qualifiers parse', () => {
        expect(parseAcEvidenceRows('| AC | Evidence |\n| --- | --- |\n| AC-1 | proof |')).toEqual([
            {id: '1', proof: 'proof', target: null}
        ]);

        expect(parseAcEvidenceRows('| #123 AC-2 | proof |')).toEqual([
            {id: '2', proof: 'proof', target: '123'}
        ])
    })
});
