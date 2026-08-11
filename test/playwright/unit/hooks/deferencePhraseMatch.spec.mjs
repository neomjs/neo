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

    test("matches the operator-flagged lane-handback slip (#16325)", () => {
        // The list already carried "if you'd rather" and "unless you want me", so this composition read
        // as covered while returning null - on the autonomous path too, not just under the operator carve.
        expect(matchDeferencePhrase("That's next unless you'd rather I take something else."))
            .toBe("unless you'd rather");

        // The negative control that keeps the addition honest: a decisive authority-boundary statement
        // is not deference, and must stay silent.
        expect(matchDeferencePhrase('Next: #16208. The merge is yours per critical_gates 1.')).toBeNull();

        // The near-miss guard that already existed for "unless you ..." must survive.
        expect(matchDeferencePhrase('The test fails unless you mock the system clock.')).toBeNull();

        // Reporting the phrase is not using it - this ticket's own body does exactly that.
        expect(matchDeferencePhrase("The phrase unless you'd rather is part of the deference register."))
            .toBeNull();
    });

    test('matches each tight phrase case-insensitively', () => {
        expect(matchDeferencePhrase('WOULD YOU LIKE ME TO open the PR?')).toBe('would you like me to');
        expect(matchDeferencePhrase('I can take it unless you want me elsewhere.')).toBe('unless you want me');
        expect(matchDeferencePhrase('Want me to start the refactor?')).toBe('want me to');
        expect(matchDeferencePhrase('Your steer on the next lane.')).toBe('Your steer on');
        expect(matchDeferencePhrase("IF YOU'D RATHER, I can leave this parked.")).toBe("if you'd rather");
        expect(matchDeferencePhrase("I can take it UNLESS YOU'D RATHER I picked another.")).toBe("unless you'd rather");
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

    test('the citation may NAME the authority it cites (#16411)', () => {
        // From a live false positive on a merge-eligibility hand-off. §critical_gates #1
        // requires handing a merge to the operator, so every correct execution of that gate ends on a
        // sentence assigning the decision — and the accurate way to write one names the gate. The old
        // adjacency anchor (`/\bper\s+$/`) matched only the citation-FREE `per your call`, so the honest
        // phrasing tripped while the phrasing that passed cited nothing.
        expect(matchDeferencePhrase("Merge-eligible; per §critical_gates #1 that's your call.")).toBeNull();
        expect(matchDeferencePhrase("As you said, per gate #1, that's your call.")).toBeNull();
        // Anticipated rather than transcript-observed, and the narrowest of the four: a dash bridging the
        // citation to the phrase. Cut this assertion and the dash characters together if a reviewer wants
        // the exemption held to observed forms only — the word allowlist, not the punctuation, is what
        // keeps the guard below honest.
        expect(matchDeferencePhrase('Eligible per rule 1 — your call.')).toBeNull();

        // A backticked citation is replaced by a space upstream in `stripMarkdownCode`, so this predicate
        // sees `per   that's` with the citation erased. Whitespace alone therefore has to bridge, or the
        // most idiomatic form in this repo would remain a false positive.
        expect(matchDeferencePhrase("Merge-eligible; per `§critical_gates #1` that's your call.")).toBeNull();
    });

    test('a citation anchor does NOT exempt ordinary deference around it (#16411)', () => {
        // The over-correction, pinned rather than intended. Widening to "`per` appears anywhere in the
        // 80-character window" would exempt exactly the slip this detector exists to catch, so the bridge
        // is an allowlist: any ordinary prose between the anchor and the phrase still fires.
        expect(matchDeferencePhrase("Per your earlier note, I've left the direction open, your call."))
            .toBe('your call');
        expect(matchDeferencePhrase('As you said the sequencing matters, so which one first — your call?'))
            .toBe('your call');
        // Citation SHAPE is not authority: a §section or #ticket nearby exempts nothing without an anchor.
        expect(matchDeferencePhrase('§critical_gates #1 is the gate. Your call on the merge?'))
            .toBe('your call');
    });

    test('still matches live deference uses of your call', () => {
        expect(matchDeferencePhrase('Your call on the branch cut.')).toBe('your call');
        expect(matchDeferencePhrase("It's your call whether I pick this up.")).toBe('your call');
        expect(matchDeferencePhrase('Your call?')).toBe('your call');
    });

    test('still fires when a live use follows a carved mention of the same phrase', () => {
        expect(matchDeferencePhrase('The phrase your call recurs. Your call on the merge?')).toBe('your call');
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

    test('reminder is self-explaining and routes to peers / ideation rather than operator permission', () => {
        const reminder = buildDeferenceReminder('your call');

        expect(DEFERENCE_PHRASES).toContain('do you want me');
        expect(DEFERENCE_PHRASES).toContain('Your steer on');
        expect(DEFERENCE_PHRASES).toContain("if you'd rather");
        expect(DEFERENCE_PHRASES).toContain("unless you'd rather");
        expect(DEFERENCE_PHRASES).toContain('or steer me elsewhere');
        expect(DEFERENCE_REMINDER).toContain('helpful assistant');
        expect(reminder).toContain('equal peer');
        expect(reminder).toContain('A2A message with peers');
        expect(reminder).toContain('ideation-sandbox');
        expect(reminder).toContain('mutable substrate');
        expect(reminder).toContain('deference phrase "your call"');
    });

    test('the permission-gate form: names the action, then attaches a gate that does not exist (#16706)', () => {
        // Operator-caught 2026-08-11 during a live client incident. This is the subtlest form and the
        // one that survives a self-audit, because it reads as courtesy: the agent identifies the
        // highest-value action — there, the cheapest unrun probe of a seven-week outage — takes credit
        // for identifying it, and then does not do it. The work is named and not done.
        //
        // Asserts the EXACT matched entry, never truthiness. An arm that only asserts truthiness passes
        // through ANY neighbouring phrase, so it cannot prove the entry under test contributes
        // anything. That is how a since-dropped `if you want me` arm "passed" while being satisfied
        // entirely by the pre-existing `want me to`.
        expect(matchDeferencePhrase('The one thing I would still act on immediately if you want it: run ollama ps on that host.'))
            .toBe('if you want it');
        expect(matchDeferencePhrase('I would still probe that host if you want it.'))
            .toBe('if you want it');
    });

    test('the permission-gate entry does NOT reserve ordinary technical conditionals (#16966)', () => {
        // The blocking finding of @neo-gpt's review, executed at exact head rather than argued: both
        // sentences below are legitimate engineering prose, and an ENFORCING Stop hook that turns them
        // into blocking directives taxes correct work on every autonomous turn. The discriminator is
        // clause POSITION — once the pronoun carries a predicate (`it to reject …`) or the verb takes a
        // noun object, the phrase governs that object rather than gating the agent's own action.
        expect(matchDeferencePhrase('Set maxQueue to zero if you want it to reject excess work.')).toBeFalsy();
        expect(matchDeferencePhrase('Keep the fixture local if you would like deterministic isolation.')).toBeFalsy();
        expect(matchDeferencePhrase('Shrink the batch if you want it to complete on CPU-only hardware.')).toBeFalsy();
    });

    test('clause position is GRAMMAR, never Markdown layout', () => {
        // Both arms are precision defects a reviewer replayed against the first clause-terminal repair,
        // and they share one root: layout characters were read as grammar.

        // (1) Inline emphasis must be TRANSPARENT. Agents bold the phrase they are deferring with, so
        // this is the specimen's most likely written form — and reading `*` as a following word made the
        // guard MISS it. A false negative on the shape the entry exists to catch is worse than the false
        // positive that motivated the guard in the first place.
        expect(matchDeferencePhrase('The one thing I would still act on immediately **if you want it**: run ollama ps.'))
            .toBe('if you want it');
        expect(matchDeferencePhrase('I would still probe that host *if you want it*.')).toBe('if you want it');
        // The arm that ISOLATES the pre-scan emphasis strip. The two arms above are also satisfied by the
        // post-soft-wrap strip, so removing the first one leaves them green — a partially vacuous test I
        // only found by mutating each half separately. Emphasis running straight into END-OF-TEXT reaches
        // neither the punctuation test nor the paragraph-break test, so only the first strip can save it.
        expect(matchDeferencePhrase('I would still probe that host **if you want it**')).toBe('if you want it');

        // UNDERSCORE emphasis is the case that survived the first two repairs, and it failed one level
        // EARLIER than they did: the matcher's boundary class is `[^a-z0-9_]`, which counts `_` as a WORD
        // character, so the phrase never matched and no amount of terminal normalization could see it.
        // Same root — layout read as grammar — one stage upstream.
        expect(matchDeferencePhrase('I would still probe that host __if you want it__: now.')).toBe('if you want it');
        expect(matchDeferencePhrase('I would still probe that host _if you want it_.')).toBe('if you want it');
        expect(matchDeferencePhrase('I would still probe that host ~~if you want it~~.')).toBe('if you want it');
    });

    test('emphasis stripping must not rewrite IDENTIFIERS into phrases', () => {
        // The regression my own fix could introduce, so it is pinned rather than trusted. A blanket
        // `[*_~] -> ' '` would turn `your_call` into `your call` and MANUFACTURE a match out of an
        // identifier — inventing deference where there is only code. Emphasis removal is therefore
        // delimiter-scoped: an opener needs whitespace/bracket before it, a closer needs
        // whitespace/punctuation after it, and an intra-word underscore matches neither.
        expect(matchDeferencePhrase('The your_call handler routes through the shared seam.')).toBeNull();
        expect(matchDeferencePhrase('Set wal_autocheckpoint before the your_move guard runs.')).toBeNull();
        // …and the genuine phrase still fires in the same sentence shape, so the guard above is not
        // silently suppressing real matches.
        expect(matchDeferencePhrase('The your_call handler is fine. Your call on the branch cut.'))
            .toBe('your call');

        // (2) A SOFT WRAP is whitespace, not a clause end. Hard-wrapped prose splits the predicate
        // across a newline, and treating that newline as terminal resurrects the false positive above.
        expect(matchDeferencePhrase('Set maxQueue to zero if you want it\nto reject excess work.')).toBeFalsy();
        expect(matchDeferencePhrase('Shrink the batch if you want it\n    to complete on CPU-only hardware.')).toBeFalsy();

        // (3) …but a BLANK line is a paragraph break, which genuinely does end the clause. Without this
        // arm, folding newlines away would swallow the terminal case at the end of a paragraph.
        expect(matchDeferencePhrase('I would still probe that host if you want it\n\nNext lane: #16982.'))
            .toBe('if you want it');
    });

    test('the two noisy variants are GONE, not merely untested (#16966)', () => {
        // A dropped phrase has to be absent from the list, not just absent from the arms above —
        // otherwise a later edit re-adds the false-positive surface and every test still passes.
        expect(DEFERENCE_PHRASES).not.toContain('if you would like');
        expect(DEFERENCE_PHRASES).not.toContain('if you want me');
        // …while the form the redundant entry was supposed to cover is still caught by its neighbour.
        expect(matchDeferencePhrase('I can wire the KB probe too if you want me to.')).toBe('want me to');
    });

    test('NON-VACUITY — a declarative lane claim is NOT deference', () => {
        // Without this arm a matcher that flagged every sentence would pass the arm above. Announcing
        // and taking a lane is the required behaviour, not the slip.
        expect(matchDeferencePhrase('Taking the starved-record lane now.')).toBeFalsy();
        expect(matchDeferencePhrase('I will take FIX-2 next.')).toBeFalsy();
        expect(matchDeferencePhrase('Running ollama ps on that host now.')).toBeFalsy();
    });
});
