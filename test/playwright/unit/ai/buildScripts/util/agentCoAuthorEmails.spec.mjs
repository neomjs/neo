import { test, expect } from '@playwright/test';
import {
    findUnknownCoAuthors,
    mismatchedLogins,
    rosterEmailForLogin,
    reconcileWithRegistry,
    registryAgentLogins
}                      from '../../../../../../buildScripts/util/agentCoAuthorEmails.mjs';

/**
 * Addresses lifted from real history: two derivations that reached `dev` — one from the display
 * name, one from the GitHub login — alongside the canonical address they should have credited.
 */
const
    DERIVED_FROM_NAME  = 'ada@neomjs.com',
    DERIVED_FROM_LOGIN = 'neo-opus-ada@neomjs.com',
    CANONICAL          = 'neo-opus-4-7@neomjs.com',
    commit             = (body, sha = 'a'.repeat(40)) => ({sha, subject: 'subject', body});

test.describe('buildScripts/util/agentCoAuthorEmails (#16280)', () => {
    test.describe('registry reconciliation', () => {
        test('every agent seat in the registry has an address — no seat is silently unvalidatable', () => {
            expect(reconcileWithRegistry().missingEmail).toEqual([]);
        });

        test('no address is keyed to a login the registry does not know (catches a typo)', () => {
            expect(reconcileWithRegistry().unknownLogin).toEqual([]);
        });

        test('the human operator is excluded by account type, not by a hardcoded name', () => {
            // The registry types the operator as an AgentIdentity root; only `accountType` separates
            // them. A name-based exclusion would silently miss a second human seat.
            expect(registryAgentLogins()).not.toContain('@tobiu');
            expect(registryAgentLogins().length).toBeGreaterThan(5);
        });
    });

    test.describe('the derivations that actually happened', () => {
        test('flags the display-name derivation', () => {
            const found = findUnknownCoAuthors({commits: [commit(`msg\n\nCo-Authored-By: Ada <${DERIVED_FROM_NAME}>`)]});

            expect(found).toHaveLength(1);
            expect(found[0].email).toBe(DERIVED_FROM_NAME);
        });

        test('flags the GitHub-handle derivation — the plausible one', () => {
            const found = findUnknownCoAuthors({commits: [commit(`msg\n\nCo-authored-by: Neo Opus Ada <${DERIVED_FROM_LOGIN}>`)]});

            expect(found).toHaveLength(1);
            expect(found[0].email).toBe(DERIVED_FROM_LOGIN);
        });

        test('POSITIVE CONTROL — the canonical address for the same seat is silent', () => {
            // Without this, every assertion above would pass against a check that flags everything.
            expect(findUnknownCoAuthors({commits: [commit(`msg\n\nCo-Authored-By: Ada <${CANONICAL}>`)]})).toEqual([]);
        });
    });

    test.describe('scoping — the guard cannot wall off people it was never meant to know', () => {
        test('an outside contributor on a GitHub noreply address never warns', () => {
            const body = 'msg\n\nCo-authored-by: novice-22 <120405029+novice-22@users.noreply.github.com>';

            expect(findUnknownCoAuthors({commits: [commit(body)]})).toEqual([]);
        });

        test('a human co-author on any non-project domain never warns', () => {
            const body = 'msg\n\nCo-authored-by: Some Person <person@example.com>';

            expect(findUnknownCoAuthors({commits: [commit(body)]})).toEqual([]);
        });

        test('an unknown address ON the project domain does warn — the domain boundary still holds for non-agent commits', () => {
            const found = findUnknownCoAuthors({commits: [commit('msg\n\nCo-authored-by: Ghost <nobody@neomjs.com>')]});

            expect(found.map(o => o.email)).toEqual(['nobody@neomjs.com']);
        });
    });

    /**
     * The domain boundary above is correct for a commit anyone might author, and was the ONLY
     * boundary until 16 commits in 36 hours credited two live human accounts through it. GitHub
     * resolves a trailer by its email, so an off-domain address credits a real person — and
     * off-domain was exactly what the domain check could not see.
     */
    test.describe('agent-authored commits have no domain boundary — the case that shipped', () => {
        const
            OFF_DOMAIN  = 'real.person@example.com',
            agentCommit = (body, sha = 'c'.repeat(40)) =>
                ({sha, subject: 'subject', body, authorEmail: CANONICAL});

        test('an off-domain trailer on an agent-authored commit IS flagged', () => {
            // The regression fixture. Under the domain-scoped predicate this returned [] — the
            // shape that let a real account be credited on every push without a word.
            const found = findUnknownCoAuthors({
                commits: [agentCommit(`msg\n\nCo-Authored-By: Some Agent <${OFF_DOMAIN}>`)]
            });

            expect(found.map(offender => offender.email)).toEqual([OFF_DOMAIN]);
        });

        test('it is marked agentAuthored, which is what the caller blocks on', () => {
            const [offender] = findUnknownCoAuthors({
                commits: [agentCommit(`msg\n\nCo-Authored-By: Some Agent <${OFF_DOMAIN}>`)]
            });

            expect(offender.agentAuthored).toBe(true);
        });

        test('a trailer whose DISPLAY NAME is an agent cannot launder the address', () => {
            // The exact shape that did the damage: the trailer reads as a seat crediting itself
            // while the address credits someone else. The name is never consulted.
            const found = findUnknownCoAuthors({
                commits: [agentCommit(`msg\n\nCo-Authored-By: Neo Opus Vega <${OFF_DOMAIN}>`)]
            });

            expect(found.map(offender => offender.email)).toEqual([OFF_DOMAIN]);
        });

        test('POSITIVE CONTROL — a roster address on an agent commit stays silent', () => {
            expect(findUnknownCoAuthors({
                commits: [agentCommit(`msg\n\nCo-Authored-By: Grace <neo-claude-opus@neomjs.com>`)]
            })).toEqual([]);
        });

        test('the SAME off-domain trailer on a non-agent commit still never warns', () => {
            // The property the domain scoping existed to protect, kept intact rather than assumed:
            // an outside contributor is not agent-authored, so nothing about them is in scope.
            expect(findUnknownCoAuthors({
                commits: [commit(`msg\n\nCo-Authored-By: Some Person <${OFF_DOMAIN}>`)]
            })).toEqual([]);
        });

        test('an OFF-DOMAIN author is treated as non-agent, so the check degrades quiet', () => {
            const body = `msg\n\nCo-Authored-By: Someone <${OFF_DOMAIN}>`;

            expect(findUnknownCoAuthors({
                commits: [{sha: 'd'.repeat(40), subject: 's', body, authorEmail: 'stranger@example.org'}]
            })).toEqual([]);
        });

        test('a project-domain author NOT in the map is UNAFFECTED — #17195 AC-3', () => {
            // Two rules died here, in order. First: treating any `@neomjs.com` author as an agent —
            // self-asserted email is not an account type. Then: refusing the unmapped case outright,
            // which @neo-gpt caught as a violation of this PR's own AC-3 ("a commit whose author is
            // NOT a roster agent is unaffected"). A non-roster human on the project domain is
            // exactly that, and the seat gap the refusal covered is closed at the binder instead.
            const body = `msg\n\nCo-Authored-By: Someone <${OFF_DOMAIN}>`;

            expect(findUnknownCoAuthors({
                commits: [{sha: 'e'.repeat(40), subject: 's', body, authorEmail: 'neo-newly-seeded@neomjs.com'}]
            })).toEqual([]);
        });
    });

    /**
     * `%ae` is not an identity — `git commit --author='X <off-domain>'` rewrites it, and against an
     * email-only classifier that one flag carried a poisoned trailer to exit 0. So the classification
     * has to come from something the commit's author did not write.
     */
    test.describe('an authenticated lane overrides the commit author entirely', () => {
        const OFF_DOMAIN = 'real.person@example.com';

        test('agentLane classifies an OFF-DOMAIN author as an agent — the --author bypass', () => {
            const body = `msg\n\nCo-Authored-By: Someone <${OFF_DOMAIN}>`;

            expect(findUnknownCoAuthors({
                agentLane: true,
                commits  : [{sha: 'g'.repeat(40), subject: 's', body, authorEmail: 'off-domain@example.com'}]
            }).map(offender => offender.email)).toEqual([OFF_DOMAIN]);
        });

        test('POSITIVE CONTROL — agentLane still admits a roster trailer', () => {
            expect(findUnknownCoAuthors({
                agentLane: true,
                commits  : [{sha: 'g'.repeat(40), subject: 's', body: `msg\n\nCo-Authored-By: V <${CANONICAL}>`, authorEmail: 'off-domain@example.com'}]
            })).toEqual([]);
        });

        test('WITHOUT agentLane the same commit is unaffected — the bypass, pinned', () => {
            // The regression fixture: this is what exit 0 looked like before the lane input existed.
            const body = `msg\n\nCo-Authored-By: Someone <${OFF_DOMAIN}>`;

            expect(findUnknownCoAuthors({
                commits: [{sha: 'g'.repeat(40), subject: 's', body, authorEmail: 'off-domain@example.com'}]
            })).toEqual([]);
        });

        test('agentLane defaults false, so an un-updated caller cannot start failing', () => {
            expect(findUnknownCoAuthors({commits: [{sha: 'h'.repeat(40), subject: 's', body: 'no trailer'}]})).toEqual([]);
        })
    });

    test.describe('parsing', () => {
        test('reads both casings git and GitHub emit', () => {
            const body = `msg\n\nCo-authored-by: A <${DERIVED_FROM_NAME}>\nCo-Authored-By: B <nobody@neomjs.com>`;

            expect(findUnknownCoAuthors({commits: [commit(body)]}).map(o => o.email).sort())
                .toEqual([DERIVED_FROM_NAME, 'nobody@neomjs.com']);
        });

        test('matches the address case-insensitively rather than treating case as unknown', () => {
            expect(findUnknownCoAuthors({commits: [commit(`msg\n\nCo-Authored-By: Ada <${CANONICAL.toUpperCase()}>`)]})).toEqual([]);
        });

        test('reports one row per distinct address, not one per repetition', () => {
            const body = `msg\n\nCo-Authored-By: A <${DERIVED_FROM_NAME}>\nCo-Authored-By: A <${DERIVED_FROM_NAME}>`;

            expect(findUnknownCoAuthors({commits: [commit(body)]})).toHaveLength(1);
        });

        test('a body carrying no trailer at all yields nothing', () => {
            expect(findUnknownCoAuthors({commits: [commit('just a subject and body')]})).toEqual([]);
        });

        test('an absent or empty body cannot throw — the log is not guaranteed to have one', () => {
            expect(findUnknownCoAuthors({commits: [{sha: 'b'.repeat(40), subject: 's'}, commit('')]})).toEqual([]);
        });

        test('no commits at all yields nothing', () => {
            expect(findUnknownCoAuthors({})).toEqual([]);
        });

        test('a prose mention of an address is not a trailer', () => {
            // The regex is line-anchored: discussing an address must not be reported as crediting it.
            const body = 'msg\n\nWe should stop using ada@neomjs.com for trailers.';

            expect(findUnknownCoAuthors({commits: [commit(body)]})).toEqual([]);
        });
    });

    /**
     * The seam `bootstrapWorktree` reads to assert an agent's authenticated primary IS its roster
     * address. That assertion is what turns the push-time guard's shape-based classification from an
     * inference into a property — so this lookup is load-bearing for the guard, not a convenience.
     */
    test.describe('rosterEmailForLogin — the binder/guard shared seam', () => {
        test('resolves a mapped seat with or without the leading @', () => {
            expect(rosterEmailForLogin('@neo-opus-ada')).toBe(CANONICAL);
            expect(rosterEmailForLogin('neo-opus-ada')).toBe(CANONICAL);
        });

        test('is case-insensitive on the login', () => {
            expect(rosterEmailForLogin('@Neo-Opus-Ada')).toBe(CANONICAL);
        });

        test('returns null for a login this map does not carry — the binder REFUSES on null', () => {
            // Unreachable through configureAgentGitIdentity today (the registry lookup runs first and
            // reconcileWithRegistry().missingEmail is empty), so it is pinned here where it is
            // reachable. The branch exists against the registry and this map drifting apart.
            expect(rosterEmailForLogin('@neo-not-a-seat')).toBeNull();
        });

        test('a missing or empty login cannot throw', () => {
            expect(rosterEmailForLogin(undefined)).toBeNull();
            expect(rosterEmailForLogin('   ')).toBeNull();
        });

        test('every registry agent login resolves — the binder can never hit its own null branch', () => {
            // The invariant that keeps the null branch defensive rather than live. If this fails, a
            // seat exists that bootstrapWorktree would now refuse to bind.
            expect(registryAgentLogins().filter(login => !rosterEmailForLogin(login))).toEqual([]);
        })
    });

    test('the sunset condition is measurable, not aspirational', () => {
        // This file retires when this list empties. Asserting it is non-empty today keeps the test
        // honest; when the last seat migrates, THIS assertion fails and points at the deletion.
        expect(mismatchedLogins().sort()).toEqual(['@neo-gemini-pro', '@neo-opus-ada', '@neo-opus-grace']);
    });
});
