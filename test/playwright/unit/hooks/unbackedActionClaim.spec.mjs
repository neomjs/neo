import {expect, test}                                           from '@playwright/test';
import {buildUnbackedActionReminder, detectUnbackedActionClaim} from '../../../../ai/scripts/lifecycle/unbackedActionClaim.mjs';
import {decideUnbackedActionStopHookAction}                     from '../../../../ai/scripts/lifecycle/stopHookDecision.mjs';
import {matchDeferencePhrase}                                   from '../../../../ai/scripts/lifecycle/deferencePhraseMatch.mjs';

test.describe('detectUnbackedActionClaim (#16613)', () => {
    test('flags the real occurrence: an imminent-action claim with zero tool calls', () => {
        const result = detectUnbackedActionClaim('Board is clear.\n\nPicking up the next lane now.', {toolCallCount: 0});

        expect(result).not.toBeNull();
        expect(result.claim).toBe('Picking up the next lane now.');
    });

    test('NEGATIVE CONTROL — the same sentence is silent when the turn contains the work', () => {
        // Without this arm the hook trains agents to stop narrating what they are doing, which is
        // strictly worse than the defect: silent correct work is unreviewable.
        const text = 'Board is clear.\n\nPicking up the next lane now.';

        expect(detectUnbackedActionClaim(text, {toolCallCount: 1})).toBeNull();
        expect(detectUnbackedActionClaim(text, {toolCallCount: 12})).toBeNull();
    });

    test('NEGATIVE CONTROL — a claim about a FUTURE turn is legitimate and stays silent', () => {
        expect(detectUnbackedActionClaim('Next turn I will pick up #16613.', {toolCallCount: 0})).toBeNull();
        expect(detectUnbackedActionClaim('I will be picking that up later.', {toolCallCount: 0})).toBeNull();
        expect(detectUnbackedActionClaim('lane-state: next-lane (#16613)', {toolCallCount: 0})).toBeNull();
    });

    test('keys on SHAPE, not an enumerated phrase list', () => {
        // Wording deliberately absent from DEFERENCE_PHRASES and from this module's source: the only
        // requirement is a gerund plus a now-marker. A phrase-list detector cannot see this.
        const result = detectUnbackedActionClaim('Kicking the reconciliation sweep off right now.', {toolCallCount: 0});

        expect(result).not.toBeNull();
        expect(result.claim).toContain('Kicking the reconciliation sweep off');
    });

    test('a REPORT of finished work is not an announcement', () => {
        // Gerund-initial but past-predicated. Requiring a now-marker on gerund-initial clauses is what
        // separates the report from the claim without maintaining a verb list.
        expect(detectUnbackedActionClaim('Running the suite showed three failures.', {toolCallCount: 0})).toBeNull();
        expect(detectUnbackedActionClaim('Closing that ticket resolved the ambiguity.', {toolCallCount: 0})).toBeNull();
    });

    test('only the TURN-TERMINAL region is considered', () => {
        // An announcement mid-response, followed by the delivery, is ordinary narration.
        const text = 'Filing it now.\n\nDone — the ticket is #16613 and the body carries the ledger.';

        expect(detectUnbackedActionClaim(text, {toolCallCount: 0})).toBeNull();
    });

    test('a quoted or fenced example never reads as a live claim', () => {
        expect(detectUnbackedActionClaim('The hook fires on:\n\n```\nPicking up the next lane now.\n```', {toolCallCount: 0})).toBeNull();
        expect(detectUnbackedActionClaim('It flags `Picking up the next lane now.` at terminal.', {toolCallCount: 0})).toBeNull();
        expect(detectUnbackedActionClaim('Grace wrote:\n\n> Picking up the next lane now.', {toolCallCount: 0})).toBeNull();
    });

    test('first-person progressive flags without a now-marker', () => {
        const result = detectUnbackedActionClaim('All green.\n\nI am implementing the detector.', {toolCallCount: 0});

        expect(result).not.toBeNull();
        expect(result.claim).toBe('I am implementing the detector.');
    });

    test('the correlation is REQUIRED, not optional — a missing count throws rather than degrading to a phrase matcher', () => {
        // A default of 0 would silently turn this into the phrase-list detector the ticket rejects,
        // and it would fire on every turn that narrates correctly.
        expect(() => detectUnbackedActionClaim('Picking up the next lane now.')).toThrow(TypeError);
        expect(() => detectUnbackedActionClaim('Picking up the next lane now.', {toolCallCount: '1'})).toThrow(TypeError);
    });

    test('the reminder names WHICH claim went unbacked', () => {
        const reminder = buildUnbackedActionReminder('Picking up the next lane now.');

        expect(reminder).toContain('"Picking up the next lane now."');
        expect(reminder).toContain('mutable substrate');
    });

    test('empty and claim-free text are silent', () => {
        expect(detectUnbackedActionClaim('', {toolCallCount: 0})).toBeNull();
        expect(detectUnbackedActionClaim('Two PRs open, both green.', {toolCallCount: 0})).toBeNull();
    });

    // The defect a bare `[A-Za-z]+ing` shape shipped with: these all matched, so `Everything is green
    // now.` — a sentence written constantly — blocked the turn. Kept as a permanent arm because the
    // suffix is genuinely ambiguous in English and the next author will reach for the simple regex.
    test('REGRESSION — an -ing word that is not a gerund never flags', () => {
        for (const sentence of [
            'Everything is green now.',
            'Nothing is blocking now.',
            'Something is running now.',
            'Anything else can wait; nothing now.',
            'During the sweep now, three failed.',
            'Everything now looks correct.',
            'Nothing is pending right now.'
        ]) {
            expect(detectUnbackedActionClaim(sentence, {toolCallCount: 0}), sentence).toBeNull();
        }
    });

    test('REGRESSION — a real gerund clause still flags, so the guards did not gut the detector', () => {
        for (const sentence of [
            'Picking up the next lane now.',
            'Kicking the reconciliation sweep off right now.',
            'Filing the ticket now.'
        ]) {
            expect(detectUnbackedActionClaim(sentence, {toolCallCount: 0}), sentence).not.toBeNull();
        }
    });

    test('PREMISE — the existing deference matcher is blind to BOTH fixtures, which is why this module exists', () => {
        // Not a claim about vocabulary: the ticket's premise is that the interrogative detector cannot
        // see the announcing register at all. If either of these ever matches, this module is redundant
        // and should be retired rather than maintained.
        expect(matchDeferencePhrase('Picking up the next lane now.')).toBeFalsy();
        expect(matchDeferencePhrase('Kicking the reconciliation sweep off right now.')).toBeFalsy();
    });
});

test.describe('decideUnbackedActionStopHookAction (#16613)', () => {
    const claimText = 'Board is clear.\n\nPicking up the next lane now.';

    test('maps to would-block when not enforcing and block when enforcing', () => {
        expect(decideUnbackedActionStopHookAction(claimText, {toolCallCount: 0}))
            .toMatchObject({action: 'would-block', claim: 'Picking up the next lane now.'});

        expect(decideUnbackedActionStopHookAction(claimText, {toolCallCount: 0, enforcing: true}))
            .toMatchObject({action: 'block'});
    });

    test('operator dialogue is carved — a terminal claim in a conversational turn is an answer', () => {
        expect(decideUnbackedActionStopHookAction(claimText, {toolCallCount: 0, operatorInLoop: true})).toBeNull();
    });

    test('shares the deferenceMirror policy leaf, so one knob governs both registers', () => {
        expect(decideUnbackedActionStopHookAction(claimText, {
            toolCallCount         : 0,
            deferenceMirrorEnabled: false
        })).toBeNull();
    });

    test('the reason names the claim, not a generic scolding', () => {
        const decision = decideUnbackedActionStopHookAction(claimText, {toolCallCount: 0});

        expect(decision.reason).toContain('Picking up the next lane now.');
    });
});
