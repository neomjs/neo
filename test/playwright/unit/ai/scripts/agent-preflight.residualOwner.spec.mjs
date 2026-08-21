import {expect, test}                      from '@playwright/test';
import {resolveIssueState, validatePrBody} from '../../../../../ai/scripts/agent-preflight.mjs';

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

    test("the Evidence Ladder's CANONICAL inline residual is a live obligation", () => {
        // The documented declaration puts the residual INLINE on the Evidence line, outside the
        // Post-Merge Validation section entirely. A gate scanning only that section reports success
        // on the exact grammar the template teaches — the quietest possible failure.
        const body = base.replace(
            'Evidence: L1 (static) → L1 required. No residuals.',
            'Evidence: L2 (mock dispatch) → L4 required (AC5 live handoff). Residual: AC5.'
        );

        const findings = residualFindings(`${body}\n\n## Post-Merge Validation\n\nNone deferred.\n`);

        expect(findings).toHaveLength(1);
        expect(findings[0]).toContain('AC5');
    });

    test('an inline residual naming a distinct owner passes', () => {
        // NON-VACUITY for the arm above: the inline form is not rejected wholesale, only unowned.
        const body = base.replace(
            'Evidence: L1 (static) → L1 required. No residuals.',
            'Evidence: L2 → L4 required. Residual: AC5, Residual-Owner: #200.'
        );

        expect(residualFindings(`${body}\n\n## Post-Merge Validation\n\nNone deferred.\n`)).toHaveLength(0);
    });

    test('a PROSE mention of the heading does not become the section', () => {
        // `indexOf` anchored on the first substring, so a body that merely quotes the heading — in
        // prose or a fenced block — had its section read from the wrong offset, and the real
        // section's live obligation went unseen.
        const body = `${base}\n\nEvery PR needs a \`## Post-Merge Validation\` section, which is where deferrals live.\n\n## Post-Merge Validation\n\n- [ ] run the container exit check\n`;

        const findings = residualFindings(body);

        expect(findings).toHaveLength(1);
        expect(findings[0]).toContain('run the container exit check');
    });

    test('an absent section is unchanged — the anchor check owns that failure, not this gate', () => {
        expect(residualFindings(base)).toHaveLength(0);
    });

    test('--pr-draft behaviour is unchanged by the gate', () => {
        const draftBody = withPmv('- [ ] run it\n\nResidual-Owner: #200').replace('Resolves #100', 'Refs #100');

        expect(residualFindings(draftBody)).toHaveLength(0);
        expect(validatePrBody(draftBody, {draft: true}).valid).toBe(true);
    });

    test('BYPASS 1 — a heading inside a FENCED block is an example, not this body\'s section', () => {
        // @neo-gpt's falsifier. A body documenting the template carries the heading inside ```
        // fences; anchoring there reads a worked example as the real obligation and lets the true
        // section's unchecked work through unseen.
        const body = [
            base,
            '',
            '```md',
            '## Post-Merge Validation',
            'None deferred.',
            '```',
            '',
            '## Post-Merge Validation',
            '',
            '- [ ] the REAL obligation',
            ''
        ].join('\n');

        const findings = residualFindings(body);

        expect(findings).toHaveLength(1);
        expect(findings[0]).toContain('the REAL obligation');
    });

    test('BYPASS 2 — an owner elsewhere in the body cannot discharge the section\'s obligation', () => {
        // The owner must live in the SAME unit that owes the work. A Residual-Owner in an unrelated
        // section, or quoted in prose, has no relationship to this deferral.
        const body = [
            base,
            '',
            'Historically we pointed these at `Residual-Owner: #200`, which was wrong.',
            '',
            '## Post-Merge Validation',
            '',
            '- [ ] run the container exit check',
            ''
        ].join('\n');

        expect(residualFindings(body)).toHaveLength(1);
    });

    test('BYPASS 2 control — an owner INSIDE the section still discharges it', () => {
        // Non-vacuity: scoping must not reject a correctly-placed owner.
        const body = `${base}\n\n## Post-Merge Validation\n\n- [ ] run it\n\nResidual-Owner: #200\n`;

        expect(residualFindings(body)).toHaveLength(0);
    });

    test('BYPASS 3 — GFM has more than one fence spelling', () => {
        // The first fence guard matched ``` only. GFM opens a fence with three-or-more BACKTICKS **or**
        // three-or-more TILDES, so a worked example in either of these shadowed the real section and the
        // obligation went unseen. Fence handling is now line-scanned: same character, closer at least as
        // long as its opener.
        const owes = '## Post-Merge Validation\n- [ ] do real work';

        for (const fence of ['~~~~md', '````markdown', '~~~text', '`````']) {
            const closer = fence.replace(/[a-z]+$/, ''),
                  body   = `${base}\n\nExample:\n\n${fence}\n## Post-Merge Validation\nNone deferred.\n${closer}\n\n${owes}`;

            expect(residualFindings(body), `fence ${fence} must not shadow the real section`).toHaveLength(1);
        }
    });

    test('BYPASS 4 — a backticked owner DOCUMENTS the spelling, it does not declare an owner', () => {
        // One grain finer than BYPASS 2: the mention is inside the owing section, so scoping alone cannot
        // reject it. Quoting the syntax that would discharge an obligation must not discharge it.
        const body = [
            base, '', '## Post-Merge Validation', '- [ ] do real work',
            'The canonical spelling is `Residual-Owner: #200` — documented, not declared.'
        ].join('\n');

        expect(residualFindings(body)).toHaveLength(1);
    });

    test('BYPASS 5 — the colon is part of the declaration', () => {
        // `Residual-Owner:?` accepted a spelling no template teaches, so a near-miss line discharged live
        // work. Control below keeps the mid-line canonical form legal, which is why this is not anchored.
        const colonless = `${base}\n\n## Post-Merge Validation\n- [ ] do real work\nResidual-Owner #200`;

        expect(residualFindings(colonless)).toHaveLength(1);

        const inlineForm = `${base.replace('Evidence: L2', 'Evidence: L2 — Residual: AC3 pending. Residual-Owner: #200')}\n`;

        expect(residualFindings(inlineForm)).toHaveLength(0);
    });

    test('BYPASS 7 — PROSE is not a declaration, even prose that REJECTS the owner', () => {
        // The sharpest of the set: the sentence says the owner was rejected, and the gate accepted it as
        // the owner. A section is prose, so an owner there must BE the line rather than appear in it.
        const body = [
            base, '', '## Post-Merge Validation', '- [ ] do real work',
            'We considered Residual-Owner: #200 but rejected that owner.'
        ].join('\n');

        expect(residualFindings(body)).toHaveLength(1);

        // Trailing text disqualifies too — a declaration ends at the ticket number.
        const trailing = `${base}\n\n## Post-Merge Validation\n- [ ] do real work\nResidual-Owner: #200 but not really`;

        expect(residualFindings(trailing)).toHaveLength(1);
    });

    test('BYPASS 8 — code rendering has more spellings than one backtick pair', () => {
        // A `` ``double`` `` span is not two single spans, so a single-backtick-first strip consumed the
        // opening pair and left the token exposed. Four-space indentation is GFM code too, and was not
        // stripped at all.
        const doubleTick = [
            base, '', '## Post-Merge Validation', '- [ ] do real work',
            'Spelling example: ``Residual-Owner: #200`` — documented only.'
        ].join('\n');

        expect(residualFindings(doubleTick)).toHaveLength(1);

        const indented = `${base}\n\n## Post-Merge Validation\n- [ ] do real work\n\n    Residual-Owner: #200`;

        expect(residualFindings(indented)).toHaveLength(1);
    });

    test('BYPASS 9 — EVERY owing section carries its own owner, not just the first', () => {
        // The fix for duplicate sections introduced this: validating the first owing section let a second
        // owing section ride on the first's owner. Same shadowing defect, one level along.
        const secondUnowned = [
            base, '', '## Post-Merge Validation', '- [ ] first work', 'Residual-Owner: #16853', '',
            '## Notes', 'x', '',
            '## Post-Merge Validation', '- [ ] second work'
        ].join('\n');

        expect(residualFindings(secondUnowned)).toHaveLength(1);

        // Control: both owned is legal, so this is not "more than one owing section always fails".
        const bothOwned = [
            base, '', '## Post-Merge Validation', '- [ ] a', 'Residual-Owner: #16853', '',
            '## Notes', 'x', '',
            '## Post-Merge Validation', '- [ ] b', 'Residual-Owner: #16853'
        ].join('\n');

        expect(residualFindings(bothOwned)).toHaveLength(0);
    });

    test('BYPASS 10 — an HTML comment is INVISIBLE in the rendered artifact', () => {
        // The last of the rendered-authority set, and the cleanest statement of what the whole family
        // has been about: the gate must judge what a READER SEES, not what the source contains. An owner
        // inside `<!-- … -->` renders as nothing, so the reviewer sees unowned work while the lint
        // reports success — the exact inversion the gate exists to prevent.
        const multiLine = [
            base, '', '## Post-Merge Validation', '- [ ] do real work', '',
            '<!--', 'Residual-Owner: #200', '-->'
        ].join('\n');

        expect(residualFindings(multiLine)).toHaveLength(1);

        const singleLine = `${base}\n\n## Post-Merge Validation\n- [ ] do real work\n<!-- Residual-Owner: #200 -->`;

        expect(residualFindings(singleLine)).toHaveLength(1);

        // Control: blanking comments must not blank the document around them.
        const commentThenRealOwner = [
            base, '', '## Post-Merge Validation', '- [ ] do real work',
            '<!-- an aside about ownership -->', 'Residual-Owner: #16853'
        ].join('\n');

        expect(residualFindings(commentThenRealOwner)).toHaveLength(0);
    });

    test('BYPASS 11 — an UNTERMINATED comment hides the owner too, and needs no closing delimiter', () => {
        // @neo-gpt's round-6 falsifier, and the sharpest statement yet of what this family is about.
        // BYPASS 10 closed the comments that CLOSE. Requiring `-->` made the gate's notion of
        // "commented out" stricter than the renderer's: GitHub swallows everything from `<!--` to
        // end-of-body, so this renders as an obligation with NO owner while the gate read the owner
        // and passed.
        //
        // Verified against the real renderer rather than assumed — `POST /markdown` on this exact body
        // returns the heading and `<li>[ ] do real work</li>` and NOTHING else. The owner is absent
        // from the artifact a reviewer reads.
        //
        // The lesson is not "handle one more spelling": my fix encoded an assumption about how the
        // evasion would be SPELLED (with a closing delimiter) rather than the property that matters
        // (invisible to a reader). Every arm in this family is that same correction at a finer grain.
        const unterminated = [
            base, '', '## Post-Merge Validation', '- [ ] do real work',
            '<!--', 'Residual-Owner: #200'
        ].join('\n');

        expect(residualFindings(unterminated)).toHaveLength(1);

        // Same shape on ONE line, with no newline before EOF.
        expect(residualFindings(`${base}\n\n## Post-Merge Validation\n- [ ] do real work\n<!-- Residual-Owner: #200`))
            .toHaveLength(1);

        // Control: blanking-to-EOF must not swallow a document that has NO comment. Without this, a
        // regex that blanked from any `<` onward would pass every arm above while destroying ordinary
        // bodies — the over-reach direction of this fix.
        const ownedNoComment = [
            base, '', '## Post-Merge Validation', '- [ ] do real work', 'Residual-Owner: #16853'
        ].join('\n');

        expect(residualFindings(ownedNoComment)).toHaveLength(0);

        // Control: a TERMINATED comment early in the body must not blank the real owner after it —
        // proof the EOF alternation did not become greedy.
        const terminatedThenOwner = [
            base, '', '## Post-Merge Validation', '- [ ] do real work',
            '<!-- an aside -->', 'Residual-Owner: #16853', '', 'Trailing prose stays readable.'
        ].join('\n');

        expect(residualFindings(terminatedThenOwner)).toHaveLength(0);
    });

    test('TWO declaration shapes — and anchoring the wrong one breaks the documented template', () => {
        // This arm exists because I broke it in both directions in consecutive rounds. `evidence-ladder.md`
        // prescribes a **1-line** declaration whose owner is MID-LINE:
        //
        //   Evidence: L2 (…) → L4 required (AC5 …). Residual: AC5, Residual-Owner: #<an existing open ticket>.
        //
        // …while the Post-Merge Validation section form is a standalone LINE. Anchoring both refuses the
        // template; anchoring neither lets prose discharge work. The shape is selected by which obligation
        // is being discharged, and each half needs its own arm or the next author will collapse them again.
        const inlineForm = [
            'Resolves #16906', '',
            'Evidence: L2 (mock dispatch) → L4 required (AC5 distinctness). Residual: AC5, Residual-Owner: #16853.', '',
            '## Test Evidence', 'Ran it.', '', 'Authored by @neo-opus-vega', '', '## Deltas', 'none', '',
            '## Post-Merge Validation', 'None deferred.'
        ].join('\n');

        expect(residualFindings(inlineForm), 'the canonical 1-line inline form must discharge').toHaveLength(0);

        // …and the inline shape requires the owner to follow the `Residual:` clause, so a bare mid-line
        // mention elsewhere on a line does not qualify as one.
        const bareMidLine = inlineForm.replace(
            'Residual: AC5, Residual-Owner: #16853.',
            'Residual: AC5. Ownership discussed with Residual-Owner: #16853 pending.'
        );

        expect(residualFindings(bareMidLine)).toHaveLength(1);
    });

    test('BYPASS 6 — a DISCHARGED duplicate section cannot shadow a later live one', () => {
        // `body.match()` returns one hit, so an earlier `None deferred.` section satisfied the gate while a
        // later section owed real work. Every section is now read, and the OWING one carries the scope.
        const body = [
            base, '', '## Post-Merge Validation', 'None deferred.', '',
            '## Notes', 'unrelated', '',
            '## Post-Merge Validation', '- [ ] do real work'
        ].join('\n');

        expect(residualFindings(body)).toHaveLength(1);

        // …and the owner must sit in the section that OWES, not in the discharged duplicate.
        const ownerInWrongSection = [
            base, '', '## Post-Merge Validation', 'None deferred.', 'Residual-Owner: #200', '',
            '## Post-Merge Validation', '- [ ] do real work'
        ].join('\n');

        expect(residualFindings(ownerInWrongSection)).toHaveLength(1);
    });
});

/**
 * The gate was careful in every dimension except EXISTENCE.
 *
 * `#(\d+)` validates that a reference is well-FORMED and treats well-formed as ALIVE. The
 * close-target rule beside it is already a survivability rule — a home that will not outlive the
 * merge is refused — and a ticket that closed BEFORE the citation fails that requirement more
 * completely, since a close target at least survives until merge.
 *
 * Every arm injects its resolver. A spec that reached live GitHub would be measuring the network.
 */
test.describe('validatePrBody — Residual-Owner STATE gate (#17314)', () => {
    const owed  = section => withPmv(section),
          owned = number => owed(`- [ ] run the container exit check\nResidual-Owner: #${number}`),
          check = (body, state) => validatePrBody(body, {resolveOwnerState: () => state});

    test('a CLOSED owner fails, and the message names the state it found', () => {
        const result = check(owned(17271), 'closed');

        expect(result.valid).toBe(false);
        expect(result.missingVisible.some(entry => /`Residual-Owner: #17271` is CLOSED/.test(entry))).toBe(true);
        // The existing messages prescribe a remedy rather than only reporting, and this one must not
        // create pressure to mint an owner — the whole point is that the work already has a home.
        expect(result.missingVisible.some(entry => /Do not open a ticket to satisfy this/.test(entry))).toBe(true);
        expect(result.warnings).toEqual([]);
    });

    test('a NONEXISTENT owner fails', () => {
        const result = check(owned(99999999), 'missing');

        expect(result.valid).toBe(false);
        expect(result.missingVisible.some(entry => /`Residual-Owner: #99999999` does not exist/.test(entry))).toBe(true);
    });

    test('CONTROL: an OPEN owner passes, so the check cannot pass by refusing everything', () => {
        const result = check(owned(200), 'open');

        expect(result.valid).toBe(true);
        expect(result.missingVisible).toEqual([]);
        expect(result.warnings).toEqual([]);
    });

    test('an UNRESOLVABLE read neither fails the gate nor silently passes the owner', () => {
        // Could-not-verify is not did-not-happen. An offline author, an expired token, a rate limit
        // and an outage are facts about the transport; a gate that turns one into a verdict
        // manufactures the diagnosis. Both halves are asserted, because either alone is a defect:
        // failing would make an outage look like a bad body, and passing in silence would make
        // "not checked" indistinguishable from "checked and fine".
        const result = check(owned(200), 'unknown');

        expect(result.valid).toBe(true);
        expect(result.missingVisible).toEqual([]);
        expect(result.warnings.some(entry => /#200` was NOT state-checked/.test(entry))).toBe(true);
    });

    test('the Evidence-ladder INLINE form gets the same treatment as the line form', () => {
        // `evidence-ladder.md` prescribes a 1-line declaration whose owner is mid-line. It shares the
        // blind spot, so it has to share the fix — otherwise the shape with the documented template
        // behind it is the one that stays unchecked.
        const inline = [
            'Resolves #100', '',
            'Evidence: L2 (unit) → L4 required (AC5 live plane). Residual: AC5 live-plane observation, Residual-Owner: #17271.', '',
            '## Deltas', 'one file', '',
            '## Test Evidence', 'green', '',
            '## Post-Merge Validation', 'None deferred.', '',
            'Authored by @neo-opus-ada'
        ].join('\n');

        expect(check(inline, 'closed').valid).toBe(false);
        expect(check(inline, 'closed').missingVisible.some(entry => /#17271` is CLOSED/.test(entry))).toBe(true);
        expect(check(inline, 'open').valid).toBe(true);
    });

    test('RED-PROOF: the PR #17308 incident fails now and passed silently before', () => {
        // The specimen, and the number IS the fixture: an owner set at 18:04 on 2026-08-17 against a
        // ticket that had closed at 17:55:42Z, eight minutes earlier, which `lint-pr-body` passed.
        // ticket-ref-ok: the arm reproduces one dated incident; an anonymised number would make it a
        // generic closed-owner case and lose the only evidence that this gate ever let one through.
        const body = owned(17271);

        // Pre-fix behaviour is still reachable, and is exactly what shipped: no resolver, shape only.
        expect(validatePrBody(body).valid).toBe(true);
        expect(validatePrBody(body).missingVisible).toEqual([]);

        // With the state read, the same body is refused.
        expect(check(body, 'closed').valid).toBe(false);
    });

    test('a closed owner that is ALSO the close target still reports the close-target rule', () => {
        // Ordering, not redundancy: the close-target message tells the author something the state
        // message does not — that the owner dies BECAUSE of this merge. Reporting "it is closed"
        // there would send them to look at a ticket that is still open until they merge.
        const body   = [base, '', '## Post-Merge Validation', '- [ ] work', 'Residual-Owner: #100'].join('\n'),
              result = check(body, 'open');

        expect(result.valid).toBe(false);
        expect(result.missingVisible.some(entry => /is this PR's own close target/.test(entry))).toBe(true);
        expect(result.missingVisible.some(entry => /is CLOSED/.test(entry))).toBe(false);
    });

    test('a body owing NOTHING never reaches the resolver', () => {
        // The read is not free and must not fire on the overwhelming majority of PRs, which carry no
        // residual at all. A spy proves it rather than a comment claiming it.
        let calls = 0;

        const result = validatePrBody(withPmv('- [x] already done'), {resolveOwnerState: () => { calls++; return 'closed' }});

        expect(result.valid).toBe(true);
        expect(calls).toBe(0);
    });
});

/**
 * `gh` exits 1 for a 404 AND for every transport failure, so the exit code decides nothing. Only the
 * 404 is an answer about the ticket; everything else is an answer about the network.
 */
test.describe('resolveIssueState — a reading, or the honest absence of one (#17314)', () => {
    const withExec = impl => resolveIssueState(200, {cwd: '/repo', execFileSyncImpl: impl}),
          throwing = stderr => () => { const error = new Error('gh failed'); error.stderr = stderr; throw error };

    test('reads open and closed', () => {
        expect(withExec(() => 'open\n')).toBe('open');
        expect(withExec(() => 'closed\n')).toBe('closed');
    });

    test('a 404 is a reading — the ticket is missing', () => {
        expect(withExec(throwing('gh: Not Found (HTTP 404)\n'))).toBe('missing');
    });

    test('every other failure is NOT a reading', () => {
        // CONTROL against the exit-code trap: these all exit 1 exactly like the 404 above, and a
        // check keying on the exit code would call every one of them "missing" and fail the gate on
        // an outage. `401` and `403` are the ones an author hits; `503` is the one CI hits.
        expect(withExec(throwing('gh: Bad credentials (HTTP 401)\n'))).toBe('unknown');
        expect(withExec(throwing('gh: Forbidden (HTTP 403)\n'))).toBe('unknown');
        expect(withExec(throwing('gh: Service Unavailable (HTTP 503)\n'))).toBe('unknown');
        expect(withExec(throwing('dial tcp: lookup api.github.com: no such host\n'))).toBe('unknown');
        expect(withExec(throwing(undefined))).toBe('unknown');
        expect(withExec(() => { throw new Error('spawn gh ENOENT') })).toBe('unknown');
    });

    test('an unrecognised payload is not a reading either', () => {
        // A changed API shape must not decide a gate. Anything that is not exactly the two known
        // states is an absence of information, not a third state.
        expect(withExec(() => 'OPEN\n')).toBe('unknown');
        expect(withExec(() => '')).toBe('unknown');
        expect(withExec(() => 'null\n')).toBe('unknown');
    });

    test('the issue number reaches gh, and the repo is resolved from the working directory', () => {
        let seen = null;

        resolveIssueState(4242, {cwd: '/repo', execFileSyncImpl: (command, args, options) => {
            seen = {args, command, cwd: options.cwd};
            return 'open'
        }});

        expect(seen.command).toBe('gh');
        expect(seen.args).toEqual(['api', 'repos/{owner}/{repo}/issues/4242', '--jq', '.state']);
        expect(seen.cwd).toBe('/repo');
    });
});
