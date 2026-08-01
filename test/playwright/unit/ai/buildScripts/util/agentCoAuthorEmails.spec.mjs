import { test, expect } from '@playwright/test';
import {
    findUnknownCoAuthors,
    mismatchedLogins,
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

        test('an unknown address ON the project domain does warn — the boundary is the domain', () => {
            const found = findUnknownCoAuthors({commits: [commit('msg\n\nCo-authored-by: Ghost <nobody@neomjs.com>')]});

            expect(found.map(o => o.email)).toEqual(['nobody@neomjs.com']);
        });
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

    test('the sunset condition is measurable, not aspirational', () => {
        // This file retires when this list empties. Asserting it is non-empty today keeps the test
        // honest; when the last seat migrates, THIS assertion fails and points at the deletion.
        expect(mismatchedLogins().sort()).toEqual(['@neo-gemini-pro', '@neo-opus-ada', '@neo-opus-grace']);
    });
});
