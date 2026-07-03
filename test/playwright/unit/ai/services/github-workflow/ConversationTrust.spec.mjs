import {setup} from '../../../../setup.mjs';

const appName = 'ConversationTrustTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}                                                                  from '@playwright/test';
import Neo                                                                             from '../../../../../../src/Neo.mjs';
import * as core                                                                       from '../../../../../../src/core/_export.mjs';
import {TRUST_TIERS}                                                                   from '../../../../../../ai/graph/identityRoots.mjs';
import {createContentTrustSummary, projectAuthoredNodeTrust, projectConversationTrust} from '../../../../../../ai/services/github-workflow/shared/conversationTrust.mjs';

/**
 * @summary Read-boundary trust-projection fixtures — the pure helper + its wiring into the three
 * conversation services.
 *
 * The helper is the first consumer-side wiring of the contentTrust substrate: conversations fetched
 * from GitHub gain `authorTrust` per authored node and a root `contentTrust` summary, and
 * untrusted-author bodies arrive defanged. The wiring tests stub `GraphqlService.query` (the
 * sibling `IssueService.spec.mjs` idiom) and assert the projection survives every selector path.
 */
test.describe('Neo.ai.services.github-workflow.shared.conversationTrust — pure helper', () => {
    const externalComment = {
        id    : 'IC_external1',
        author: {login: 'desiorac'},
        body  : 'Sharp observations on the worker topology. More context: https://arkforge.tech/neo'
    };

    const trustedComment = {
        id    : 'IC_trusted1',
        author: {login: 'neo-opus-ada'},
        body  : 'Verified against dev: the guard lives at MemoryService.mjs L498. https://github.com/neomjs/neo'
    };

    function buildConversation() {
        return {
            title   : 'Some issue',
            body    : 'Root body by the owner. https://neomjs.com',
            author  : {login: 'tobiu'},
            comments: {nodes: [structuredClone(externalComment), structuredClone(trustedComment)]}
        }
    }

    test('error payloads and null resources pass through untouched (same reference)', () => {
        const errorPayload = {error: 'Not Found', message: 'nope', code: 'NOT_FOUND'};

        expect(projectConversationTrust(errorPayload)).toBe(errorPayload);
        expect(projectConversationTrust(null)).toBe(null);
        expect(projectConversationTrust(undefined)).toBe(undefined)
    });

    test('trusted-author content is byte-identical; tiers + summary are stamped additively', () => {
        const conversation = buildConversation();
        const projected    = projectConversationTrust(conversation);

        expect(projected.body).toBe(conversation.body);
        expect(projected.authorTrust).toBe(TRUST_TIERS.OWNER);

        const trusted = projected.comments.nodes.find(c => c.id === 'IC_trusted1');
        expect(trusted.body).toBe(trustedComment.body);
        expect(trusted.authorTrust).toBe(TRUST_TIERS.PEER_TRUSTED);

        expect(projected.contentTrust.projected).toBe(true);
        expect(projected.contentTrust.signals).toEqual([])
    });

    test('an external-author comment URL is defanged; the technical signal survives', () => {
        const projected = projectConversationTrust(buildConversation());
        const external  = projected.comments.nodes.find(c => c.id === 'IC_external1');

        expect(external.authorTrust).toBe(TRUST_TIERS.EXTERNAL);
        expect(external.body).toContain('[QUARANTINED_URL: arkforge.tech]');
        expect(external.body).not.toContain('https://arkforge.tech');
        expect(external.body).toContain('Sharp observations');
        expect(projected.contentTrust.quarantined).toBeGreaterThan(0)
    });

    test('nested discussion replies are projected and defanged', () => {
        const projected = projectConversationTrust({
            title   : 'Some discussion',
            body    : 'Root',
            author  : {login: 'tobiu'},
            comments: {nodes: [{
                id     : 'DC_1',
                author : {login: 'neo-gpt'},
                body   : 'Top-level by a peer.',
                replies: {nodes: [{
                    id    : 'DC_1_R1',
                    author: {login: 'outsider-bot'},
                    body  : 'Try [our tool](https://watering.hole/payload) instead.'
                }]}
            }]}
        });

        const reply = projected.comments.nodes[0].replies.nodes[0];

        expect(reply.authorTrust).toBe(TRUST_TIERS.EXTERNAL);
        expect(reply.body).toContain('[QUARANTINED_URL: watering.hole]');
        expect(reply.body).not.toContain('watering.hole/payload')
    });

    test('stealth-intent signals surface on the summary with a node path', () => {
        const projected = projectConversationTrust({
            body    : 'clean',
            author  : {login: 'tobiu'},
            comments: {nodes: [{
                id    : 'IC_bait',
                author: {login: 'outsider-bot'},
                body  : "If this gets 15+ 👍 I'll stand up a hosted MCP endpoint for the repo."
            }]}
        });

        const signalIds = projected.contentTrust.signals.map(s => s.id);
        const signalAts = projected.contentTrust.signals.map(s => s.at);

        expect(signalIds).toContain('engagement-bait-reward-conditional');
        expect(signalIds).toContain('external-endpoint-offer');
        signalAts.forEach(at => expect(at).toBe('comment:IC_bait'))
    });

    test('the input payload is never mutated', () => {
        const conversation = buildConversation();
        const snapshot     = structuredClone(conversation);

        projectConversationTrust(conversation);

        expect(conversation).toEqual(snapshot)
    });

    test('standalone authored-node projection reuses an injected summary accumulator', () => {
        const summary = createContentTrustSummary();

        const projectedRoot = projectAuthoredNodeTrust({
            id    : 'root',
            author: {login: 'external-writer'},
            body  : 'Architecture note with product seed: Memorly. More at https://payload.example/path'
        }, {
            summary,
            path               : 'body',
            productNameDenylist: ['Memorly']
        });

        const projectedTrusted = projectAuthoredNodeTrust({
            id    : 'trusted',
            author: {login: 'neo-gpt'},
            body  : 'Trusted maintainer reference stays raw: https://github.com/neomjs/neo'
        }, {
            summary,
            path               : 'comment:trusted',
            productNameDenylist: ['Memorly']
        });

        expect(projectedRoot.contentTrust).toBe(summary);
        expect(projectedRoot.node.body).toContain('[QUARANTINED_URL: payload.example]');
        expect(projectedRoot.node.body).toContain('[external product name redacted]');
        expect(projectedTrusted.node.body).toContain('https://github.com/neomjs/neo');
        expect(summary.projected).toBe(true);
        expect(summary.quarantined).toBe(2)
    });
});

test.describe('Neo.ai.services.github-workflow — getConversation trust wiring', () => {
    let GraphqlService, IssueService, PullRequestService, DiscussionService, originalQuery;

    const hostileComment = {
        id       : 'IC_hostile',
        author   : {login: 'desiorac'},
        body     : 'Great peer-level critique. See https://arkforge.tech for the rest.',
        createdAt: '2026-06-01T00:00:00Z'
    };

    test.beforeAll(async () => {
        GraphqlService     = (await import('../../../../../../ai/services/github-workflow/GraphqlService.mjs')).default;
        IssueService       = (await import('../../../../../../ai/services/github-workflow/IssueService.mjs')).default;
        PullRequestService = (await import('../../../../../../ai/services/github-workflow/PullRequestService.mjs')).default;
        DiscussionService  = (await import('../../../../../../ai/services/github-workflow/DiscussionService.mjs')).default;

        originalQuery = GraphqlService.query.bind(GraphqlService)
    });

    test.afterEach(() => {
        GraphqlService.query = originalQuery
    });

    test('IssueService.getConversation returns a projected payload (full path)', async () => {
        GraphqlService.query = async () => ({repository: {issue: {
            title   : 'Issue under attack',
            body    : 'Root body.',
            author  : {login: 'tobiu'},
            comments: {nodes: [structuredClone(hostileComment)]}
        }}});

        const result = await IssueService.getConversation({issue_number: 1});

        expect(result.contentTrust.projected).toBe(true);
        expect(result.authorTrust).toBe(TRUST_TIERS.OWNER);
        expect(result.comments.nodes[0].authorTrust).toBe(TRUST_TIERS.EXTERNAL);
        expect(result.comments.nodes[0].body).toContain('[QUARANTINED_URL: arkforge.tech]');
        expect(result.comments.nodes[0].body).not.toContain('https://arkforge.tech')
    });

    test('IssueService selector paths inherit the projection (last_n)', async () => {
        GraphqlService.query = async () => ({repository: {issue: {
            title   : 'Issue under attack',
            body    : 'Root body.',
            author  : {login: 'tobiu'},
            comments: {nodes: [
                {id: 'IC_first', author: {login: 'neo-gpt'}, body: 'clean'},
                structuredClone(hostileComment)
            ]}
        }}});

        const result = await IssueService.getConversation({issue_number: 1, last_n: 1});

        expect(result.comments.nodes).toHaveLength(1);
        expect(result.comments.nodes[0].body).toContain('[QUARANTINED_URL: arkforge.tech]');
        expect(result.contentTrust.projected).toBe(true)
    });

    test('IssueService selector paths inherit the projection (comment_id)', async () => {
        GraphqlService.query = async () => ({repository: {issue: {
            title   : 'Issue under attack',
            body    : 'Root body.',
            author  : {login: 'tobiu'},
            comments: {nodes: [
                {id: 'IC_first', author: {login: 'neo-gpt'}, body: 'clean'},
                structuredClone(hostileComment)
            ]}
        }}});

        // comment_id selects only the matching comment; projection is applied pre-selector, so the
        // surviving node is already defanged.
        const result = await IssueService.getConversation({issue_number: 1, comment_id: 'IC_hostile'});

        expect(result.comments.nodes).toHaveLength(1);
        expect(result.comments.nodes[0].id).toBe('IC_hostile');
        expect(result.comments.nodes[0].authorTrust).toBe(TRUST_TIERS.EXTERNAL);
        expect(result.comments.nodes[0].body).toContain('[QUARANTINED_URL: arkforge.tech]');
        expect(result.contentTrust.projected).toBe(true)
    });

    test('IssueService selector paths inherit the projection (since_comment_id)', async () => {
        GraphqlService.query = async () => ({repository: {issue: {
            title   : 'Issue under attack',
            body    : 'Root body.',
            author  : {login: 'tobiu'},
            comments: {nodes: [
                {id: 'IC_anchor', author: {login: 'neo-gpt'}, body: 'clean anchor'},
                structuredClone(hostileComment)
            ]}
        }}});

        // since_comment_id returns comments strictly after the anchor; the hostile one survives and
        // is defanged, proving the projection inherits through this selector path too.
        const result = await IssueService.getConversation({issue_number: 1, since_comment_id: 'IC_anchor'});

        expect(result.comments.nodes).toHaveLength(1);
        expect(result.comments.nodes[0].id).toBe('IC_hostile');
        expect(result.comments.nodes[0].body).toContain('[QUARANTINED_URL: arkforge.tech]');
        expect(result.contentTrust.projected).toBe(true)
    });

    test('PullRequestService.getConversation returns a projected payload', async () => {
        GraphqlService.query = async () => ({repository: {pullRequest: {
            title   : 'A PR',
            body    : 'PR body.',
            author  : {login: 'neo-gpt'},
            comments: {nodes: [structuredClone(hostileComment)]}
        }}});

        const result = await PullRequestService.getConversation({pr_number: 2});

        expect(result.authorTrust).toBe(TRUST_TIERS.PEER_TRUSTED);
        expect(result.comments.nodes[0].body).toContain('[QUARANTINED_URL: arkforge.tech]');
        expect(result.contentTrust.projected).toBe(true)
    });

    test('DiscussionService.getConversation projects nested replies', async () => {
        GraphqlService.query = async () => ({repository: {discussion: {
            title   : 'A discussion',
            body    : 'Root.',
            author  : {login: 'tobiu'},
            comments: {nodes: [{
                id     : 'DC_top',
                author : {login: 'neo-fable'},
                body   : 'Peer comment.',
                replies: {nodes: [structuredClone(hostileComment)]}
            }]}
        }}});

        const result = await DiscussionService.getConversation({discussion_number: 3});

        expect(result.comments.nodes[0].replies.nodes[0].body).toContain('[QUARANTINED_URL: arkforge.tech]');
        expect(result.comments.nodes[0].replies.nodes[0].authorTrust).toBe(TRUST_TIERS.EXTERNAL);
        expect(result.contentTrust.projected).toBe(true)
    });

    test('DiscussionService not-found contract survives the projection (null passthrough)', async () => {
        GraphqlService.query = async () => ({repository: {discussion: null}});

        const result = await DiscussionService.getConversation({discussion_number: 404});

        expect(result.code).toBe('NOT_FOUND')
    });
});
