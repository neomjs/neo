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
        expect(matchDeferencePhrase('I can take it unless you want it.')).toBe('unless you');
        expect(matchDeferencePhrase('Want me to start the refactor?')).toBe('want me to');
        expect(matchDeferencePhrase('Your call on the branch cut.')).toBe('your call');
        expect(matchDeferencePhrase('Your move.')).toBe('your move');
    });

    test('does not match deliberately excluded near-misses', () => {
        expect(matchDeferencePhrase('Should I refactor this? Yes - doing it.')).toBeNull();
        expect(matchDeferencePhrase('Shall I open the PR - opening it.')).toBeNull();
        expect(matchDeferencePhrase('Happy to take the next lane.')).toBeNull();
        expect(matchDeferencePhrase('No rush on the merge.')).toBeNull();
        expect(matchDeferencePhrase('Whenever you want to merge is fine.')).toBeNull();
    });

    test('operator-dialogue carve skips the phrase match', () => {
        expect(detectDeferencePhrase('Your call on the exact color.', {operatorInLoop: true})).toBeNull();
        expect(detectDeferencePhrase('Your call on the exact color.', {operatorInLoop: false})).toBe('your call');
    });

    test('returns null on empty or non-string input', () => {
        expect(matchDeferencePhrase('')).toBeNull();
        expect(matchDeferencePhrase(null)).toBeNull();
        expect(matchDeferencePhrase(undefined)).toBeNull();
    });

    test('reminder is self-explaining and routes to peers / ideation rather than operator permission', () => {
        const reminder = buildDeferenceReminder('your call');

        expect(DEFERENCE_PHRASES).toContain('do you want me');
        expect(DEFERENCE_REMINDER).toContain('helpful assistant');
        expect(reminder).toContain('equal peer');
        expect(reminder).toContain('A2A message with peers');
        expect(reminder).toContain('ideation-sandbox');
        expect(reminder).toContain('mutable substrate');
        expect(reminder).toContain('deference phrase "your call"');
    });
});
