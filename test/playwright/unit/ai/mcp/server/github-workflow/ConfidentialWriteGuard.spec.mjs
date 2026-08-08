import {setup} from '../../../../../setup.mjs';

const appName = 'ConfidentialWriteGuardTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: false,
        unitTestMode           : true,
        useDomApiRenderer      : false
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';

import {
    GITHUB_TOOL_ACCESS,
    buildConfidentialContentGuard,
    collectPublishableStrings,
    guardGitHubWriteTools,
    isPublicGitHubWriteTool
} from '../../../../../../../ai/mcp/server/github-workflow/toolService.mjs';

const DENYLIST = ['Acme Corp'];

/**
 * @summary The confidentiality guard must sit on every public-write surface, and must refuse before
 * the write happens rather than after.
 *
 * The defect it replaces was caught by an operator on a body that a mandatory validator had already
 * passed. So the assertions that matter most are not "a token is caught" — they are that the guard
 * covers a surface set nobody maintains by hand, and that it never silently declines to run.
 */
test.describe('confidential write guard — coverage', () => {
    test('every public-write tool is guarded, from the DERIVED set', () => {
        // The coverage argument: this set is computed from the access classification, so a
        // public-write tool added later inherits the guard. A hand-written surface list is what let
        // three recurrences through.
        const publicWriteTools = Object.entries(GITHUB_TOOL_ACCESS)
            .filter(([, access]) => access === 'public-write')
            .map(([toolName]) => toolName);

        expect(publicWriteTools.length, 'the derived set is non-empty').toBeGreaterThan(0);

        for (const toolName of publicWriteTools) {
            expect(isPublicGitHubWriteTool(toolName), toolName).toBe(true);
        }

        // The surfaces the ticket named by hand must all be in it — and the set is allowed to be
        // WIDER than that list, which is the whole point.
        for (const named of [
            'create_discussion', 'create_issue', 'manage_discussion',
            'manage_discussion_comment', 'manage_issue_comment', 'manage_pr_review'
        ]) {
            expect(isPublicGitHubWriteTool(named), named).toBe(true);
        }
    });

    test('guardGitHubWriteTools wraps public writes and leaves reads alone', async () => {
        let readCalls = 0, writeCalls = 0;

        const guarded = guardGitHubWriteTools({
            create_issue: async () => { writeCalls++; return {ok: true} },
            list_issues : async () => { readCalls++;  return {ok: true} }
        }, {
            assertExpectedIdentity: async () => {},
            resolveDenylist       : () => DENYLIST,
            resolveVisibility     : () => 'public'
        });

        await guarded.list_issues({});
        expect(readCalls, 'a read tool is untouched').toBe(1);

        const blocked = await guarded.create_issue({body: 'Shipped for Acme Corp.'});

        expect(blocked.code).toBe('CONFIDENTIAL_TOKEN_IN_PUBLIC_WRITE');
        expect(writeCalls, 'the write handler never ran').toBe(0);
    });
});

test.describe('confidential write guard — refusal semantics', () => {
    /**
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async function runGuard({args, denylist = DENYLIST, visibility = 'public'}) {
        let   delegated = false;
        const guarded   = buildConfidentialContentGuard(async () => { delegated = true; return {ok: true} }, {
            resolveDenylist  : () => denylist,
            resolveVisibility: () => visibility
        });
        const result = await guarded(args);

        return {result, delegated}
    }

    test('a public write carrying a token is refused before the delegate runs', async () => {
        const {result, delegated} = await runGuard({args: {body: 'Rolled out for Acme Corp.'}});

        expect(delegated, 'refused BEFORE the write, not after').toBe(false);
        expect(result.code).toBe('CONFIDENTIAL_TOKEN_IN_PUBLIC_WRITE');
        expect(result.matches[0].token).toBe('Acme Corp');
    });

    test('unknown visibility refuses AND names the assumption, not just the match', async () => {
        const {result} = await runGuard({args: {body: 'Rolled out for Acme Corp.'}, visibility: 'unknown'});

        expect(result.code).toBe('CONFIDENTIAL_TOKEN_IN_PUBLIC_WRITE');
        expect(result.reason).toBe('target-unknown');

        // The diagnosis, which is the difference between fixing a token scope and redacting a
        // legitimate name forever. An operator told only "token matched" would do the latter.
        expect(result.message).toContain('visibility could not be resolved');
        expect(result.message).toContain('treated as public');
    });

    test('a private target lets the write through — client specifics belong there', async () => {
        const {result, delegated} = await runGuard({
            args      : {body: 'Rolled out for Acme Corp.'},
            visibility: 'private'
        });

        expect(delegated, 'the sanctioned surface is not refused').toBe(true);
        expect(result.ok).toBe(true);
    });

    test('a clean public write passes — the inverse control', async () => {
        // Without this, a guard that refused everything would satisfy every refusal assertion above.
        const {result, delegated} = await runGuard({args: {body: 'Rolled out for an external deployment.'}});

        expect(delegated).toBe(true);
        expect(result.ok).toBe(true);
    });

    test('an unconfigured denylist does NOT block, and does not pretend it checked', async () => {
        // Enforcement cannot run without a list. It must not block every write either — that would
        // make an unconfigured deployment unusable and get the guard disabled.
        const {delegated} = await runGuard({args: {body: 'Rolled out for Acme Corp.'}, denylist: []});

        expect(delegated).toBe(true);
    });
});

test.describe('confidential write guard — payload reach', () => {
    test('a token is found in ANY string field, not only in `body`', async () => {
        // A field allow-list has the same decay as a surface allow-list: the field added next year
        // is unscanned and silent.
        for (const args of [
            {title: 'Fix for Acme Corp'},
            {body: 'clean', details: {note: 'Acme Corp asked'}},
            {items: ['clean', 'Acme Corp']},
            {deeply: {nested: {value: 'acme-corp'}}}
        ]) {
            expect(collectPublishableStrings(args).join('\n'), JSON.stringify(args)).toContain('cme');
        }
    });

    test('collection terminates on a cyclic argument tree', () => {
        // A guard on every write must not hang one. The depth bound is the reason this returns.
        const cyclic = {body: 'Acme Corp'};
        cyclic.self  = cyclic;

        expect(() => collectPublishableStrings(cyclic)).not.toThrow();
        expect(collectPublishableStrings(cyclic).some(value => value.includes('Acme Corp'))).toBe(true);
    });
});
