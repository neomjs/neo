import {expect, test}   from '@playwright/test';
import {validatePrBody} from '../../../../../../buildScripts/util/agent-preflight.mjs';

/**
 * Deferred work must name a home that SURVIVES the merge.
 *
 * Measured across four merged PRs: each parked unchecked Post-Merge Validation work on the ticket its
 * own `Resolves` closed. Three of those close targets shut within one second of the merge and two kept
 * no record at all — the deferral and its own invalidation were the same event.
 *
 * The gate is a comparison between two independently-produced values (the declared owner and the close
 * target), never a judgement, so it cannot be satisfied by writing prose about diligence.
 */

const base = [
    'Resolves #100',
    '',
    'Evidence: L1 (static) → L1 required. No residuals.',
    '',
    '## Deltas',
    'one file',
    '',
    '## Test Evidence',
    'green',
    '',
    'Authored by @neo-opus-vega'
].join('\n');

const withPmv = section => `${base}\n\n## Post-Merge Validation\n\n${section}\n`;

/**
 * Only THIS gate's findings.
 *
 * Matching on the heading name is too loose: when the section is absent the ANCHOR check emits a
 * finding containing `## Post-Merge Validation`, which a heading-based filter would report as a gate
 * failure. Keying on the gate's own wording keeps the two instruments separable.
 */
const residualFindings = body =>
    validatePrBody(body).missingVisible.filter(entry => /still owes work|Residual-Owner: #/.test(entry));

test.describe('validatePrBody — Residual-Owner gate (#16906)', () => {
    test('a live obligation with NO owner fails, and names the obligation', () => {
        const findings = residualFindings(withPmv('- [ ] run the container exit check'));

        expect(findings).toHaveLength(1);
        expect(findings[0]).toContain('run the container exit check');
    });

    test('an owner equal to the close target fails — that owner dies with the merge', () => {
        const findings = residualFindings(withPmv('- [ ] run it\n\nResidual-Owner: #100'));

        expect(findings).toHaveLength(1);
        expect(findings[0]).toContain("this PR's own close target");
    });

    test('an owner DIFFERENT from the close target passes', () => {
        expect(residualFindings(withPmv('- [ ] run it\n\nResidual-Owner: #200'))).toHaveLength(0);
    });

    test('NON-VACUITY — a section with no live obligation passes with no owner at all', () => {
        // Without this arm a gate that rejected every Post-Merge Validation section would go green on
        // all three arms above. Presence of the section is never the trigger; owing work is.
        expect(residualFindings(withPmv('None deferred.'))).toHaveLength(0);
        expect(residualFindings(withPmv('- [x] already measured on the plane'))).toHaveLength(0);
    });

    test('NOT_YET_MEASURED is a live obligation even with no task box', () => {
        // The exact wording of the specimen that motivated this: a reviewer-owned evidence handoff
        // stating AC3/AC4 are unmeasured, posted eleven minutes before its ticket closed.
        expect(residualFindings(withPmv('AC3 and AC4 are NOT_YET_MEASURED.'))).toHaveLength(1);
    });

    test('the section is found when it is LAST in the body', () => {
        // The extractor reads heading-to-next-`##`; an off-by-one at end-of-body would silently exempt
        // every PR that puts Post-Merge Validation last, which is the common shape.
        expect(residualFindings(`${base}\n\n## Post-Merge Validation\n- [ ] tail obligation\n`)).toHaveLength(1);
    });

    test('an unchecked box OUTSIDE the section does not trigger the gate', () => {
        // Scoping proof: acceptance criteria and task lists elsewhere in a body are not deferred work.
        const body = `${base}\n\n## Checklist\n- [ ] unrelated task\n\n## Post-Merge Validation\n\nNone deferred.\n`;

        expect(residualFindings(body)).toHaveLength(0);
    });

    test('the message prescribes finishing, naming an EXISTING ticket, or dropping — never filing one', () => {
        // Raised by @neo-gpt at intake and load-bearing: a gate demanding a durable owner reads as a gate
        // demanding a NEW ticket, which would make it the backlog generator wearing a guard's clothes.
        const [message] = residualFindings(withPmv('- [ ] run it'));

        expect(message).toContain('EXISTING');
        expect(message).toContain('Do not open a ticket');
        expect(message.toLowerCase()).not.toContain('file a follow-up');
    });

    test('an absent section is unchanged — the anchor check owns that failure, not this gate', () => {
        expect(residualFindings(base)).toHaveLength(0);
    });

    test('--pr-draft behaviour is unchanged by the gate', () => {
        const draftBody = withPmv('- [ ] run it\n\nResidual-Owner: #200').replace('Resolves #100', 'Refs #100');

        expect(residualFindings(draftBody)).toHaveLength(0);
        expect(validatePrBody(draftBody, {draft: true}).valid).toBe(true);
    });
});
