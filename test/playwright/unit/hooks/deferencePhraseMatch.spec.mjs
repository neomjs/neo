import {test, expect} from '@playwright/test';

import {DEFERENCE_PHRASES,
        DEFERENCE_REMINDER,
        buildDeferenceReminder,
        detectDeferencePhrase,
        matchDeferencePhrase} from '../../../../ai/scripts/lifecycle/deferencePhraseMatch.mjs';

/**
 * Direct coverage for the deference-register phrase match. The matcher is pure; hook specs cover
 * the runtime block path and the operator-dialogue carve.
 */
test.describe('ai/scripts/lifecycle/deferencePhraseMatch', () => {
    test('matches the real session slip', () => {
        expect(matchDeferencePhrase('So - which do you want me driving next?')).toBe('do you want me');
    });

    test('matches each tight phrase case-insensitively', () => {
        expect(matchDeferencePhrase('WOULD YOU LIKE ME TO open the PR?')).toBe('would you like me to');
        expect(matchDeferencePhrase('I can take it unless you want me elsewhere.')).toBe('unless you want me');
        expect(matchDeferencePhrase('Want me to start the refactor?')).toBe('want me to');
        expect(matchDeferencePhrase('Your steer on the next lane.')).toBe('Your steer on');
        expect(matchDeferencePhrase("IF YOU'D RATHER, I can leave this parked.")).toBe("if you'd rather");
        expect(matchDeferencePhrase('I can do this, or steer me elsewhere.')).toBe('or steer me elsewhere');
        expect(matchDeferencePhrase('Your call on the branch cut.')).toBe('your call');
        expect(matchDeferencePhrase('Your move.')).toBe('your move');
    });

    test('does not match deliberately excluded near-misses', () => {
        expect(matchDeferencePhrase('Should I refactor this? Yes - doing it.')).toBeNull();
        expect(matchDeferencePhrase('Shall I open the PR - opening it.')).toBeNull();
        expect(matchDeferencePhrase('Happy to take the next lane.')).toBeNull();
        expect(matchDeferencePhrase('No rush on the merge.')).toBeNull();
        expect(matchDeferencePhrase('Whenever you want to merge is fine.')).toBeNull();
        expect(matchDeferencePhrase('Does this make more sense to you?')).toBeNull();
    });

    test('does not match technical substring collisions', () => {
        expect(matchDeferencePhrase('The fix routes through your callback handler.')).toBeNull();
        expect(matchDeferencePhrase('The test fails unless you mock the system clock.')).toBeNull();
        expect(matchDeferencePhrase('Restored your moved files to their original paths.')).toBeNull();
    });

    test('does not match phrases quoted as markdown code literals', () => {
        expect(matchDeferencePhrase("Added `Your steer on`, `if you'd rather`, and `or steer me elsewhere`."))
            .toBeNull();
        expect(matchDeferencePhrase('```text\nYour steer on the next lane.\n```')).toBeNull();
    });

    test('does not match quoted or reported phrase mentions', () => {
        expect(matchDeferencePhrase('The "your call" firing was a demonstrable false positive.')).toBeNull();
        expect(matchDeferencePhrase("The 'per your call' firing was a demonstrable false positive.")).toBeNull();
        expect(matchDeferencePhrase('The phrase your call is mentioned in the #14420 corpus.')).toBeNull();
        expect(matchDeferencePhrase("The phrase if you'd rather is part of the deference register.")).toBeNull();
    });

    test('does not match attributive citations of an operator decision', () => {
        expect(matchDeferencePhrase('Clio owns it, per your call.')).toBeNull();
        expect(matchDeferencePhrase('The ownership route stands as you directed: your call is the source.'))
            .toBeNull();
    });

    test('still matches live deference uses of your call', () => {
        expect(matchDeferencePhrase('Your call on the branch cut.')).toBe('your call');
        expect(matchDeferencePhrase("It's your call whether I pick this up.")).toBe('your call');
        expect(matchDeferencePhrase('Your call?')).toBe('your call');
    });

    test('still fires when a live use follows a carved mention of the same phrase', () => {
        // The live-use sentence names a maintainer-owned surface (a lane) — "on the merge" would
        // now be correct Tier-4 role-attribution under the domain-scoping exemption, not a slip.
        expect(matchDeferencePhrase('The phrase your call recurs. Your call on the lane?')).toBe('your call');
        expect(matchDeferencePhrase('Clio owns it per your call, but honestly, your call?')).toBe('your call');
    });

    test('operator-dialogue carve skips the phrase match', () => {
        expect(detectDeferencePhrase('Your call on the exact color.', {operatorInLoop: true})).toBeNull();
        expect(detectDeferencePhrase('Your call on the exact color.', {operatorInLoop: false})).toBe('your call');
        expect(detectDeferencePhrase("If you'd rather, I can move it.", {operatorInLoop: true})).toBeNull();
        expect(detectDeferencePhrase("If you'd rather, I can move it.", {operatorInLoop: false}))
            .toBe("if you'd rather");
    });

    test('returns null on empty or non-string input', () => {
        expect(matchDeferencePhrase('')).toBeNull();
        expect(matchDeferencePhrase(null)).toBeNull();
        expect(matchDeferencePhrase(undefined)).toBeNull();
    });

    test('human-only-domain clauses are role-attribution, not deference — the merge gate stays nameable', () => {
        // The pinned live regression fixture: a merge-eligibility terminal naming the
        // operator's own gate must not be refused as a helpful-assistant slip.
        expect(matchDeferencePhrase('CI is green and the review is APPROVED — merge on the exception or ask for the stamp, your call.')).toBeNull();
        expect(matchDeferencePhrase('The release direction is yours — ship now or hold, your call.')).toBeNull();
        expect(matchDeferencePhrase('Rotating the credentials is operator-owned, your call on timing.')).toBeNull();
        // Comma-joined, same clause — a SEMICOLON is a clause boundary and correctly bounds the
        // exemption (conservative: ambiguity fails toward firing).
        expect(matchDeferencePhrase('PR #15232 is merge-eligible under the micro-change class, your move.')).toBeNull();
    });

    test('the same phrases OUTSIDE human-only-domain clauses keep firing (spec-pinned positive)', () => {
        expect(matchDeferencePhrase('I could take the grid lane or the docs lane next — your call.')).toBe('your call');
        expect(matchDeferencePhrase('The review disposition is up to you, your move.')).toBe('your move');
    });

    test('clause boundaries bound the exemption — a merge mention in an ADJACENT sentence does not bleed', () => {
        expect(matchDeferencePhrase('The merge landed an hour ago. Picking the next lane is open — your call.')).toBe('your call');
    });

    test('the reminder names the domain-scoping boundary', () => {
        expect(DEFERENCE_REMINDER).toContain('Domain-scoping');
        expect(DEFERENCE_REMINDER).toContain('merge execution');
        expect(DEFERENCE_REMINDER).toContain('role-attribution');
    });

    test('reminder is self-explaining and routes to peers / ideation rather than operator permission', () => {
        const reminder = buildDeferenceReminder('your call');

        expect(DEFERENCE_PHRASES).toContain('do you want me');
        expect(DEFERENCE_PHRASES).toContain('Your steer on');
        expect(DEFERENCE_PHRASES).toContain("if you'd rather");
        expect(DEFERENCE_PHRASES).toContain('or steer me elsewhere');
        expect(DEFERENCE_REMINDER).toContain('helpful assistant');
        expect(reminder).toContain('equal peer');
        expect(reminder).toContain('A2A message with peers');
        expect(reminder).toContain('ideation-sandbox');
        expect(reminder).toContain('mutable substrate');
        expect(reminder).toContain('deference phrase "your call"');
    });
});
