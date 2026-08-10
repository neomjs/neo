import {setup} from '../../../../setup.mjs';

const appName = 'MailboxListCompletenessTest';

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

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import                        '../../../../../../src/manager/Instance.mjs';
import RequestContextService from '../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs';

/**
 * @summary A listing must let a caller tell a PAGE from a SET.
 *
 * `listMessages` returned a bare array. A caller could therefore not distinguish "the store holds
 * no match" from "no match in the newest `limit` rows", and the two are indistinguishable exactly
 * when the answer is *nothing found* — a zero-result read never trips the `length === limit` tell,
 * and a full page reads as a successful complete listing.
 *
 * Two maintainers published false absence claims from this surface within one hour, in opposite
 * directions: one asserting a message did not exist, one denying authorship of a message they had
 * written. Both messages were real, stored, and simply deeper than one page. The epistemic half is
 * ours; this is the mechanical half.
 *
 * **The fixture is seeded PAST the default limit on purpose.** Fewer than `DEFAULT_LIMIT` rows
 * cannot exercise truncation at all — every assertion below would pass against the unfixed code,
 * so a small fixture would certify the defect rather than catch it.
 */
test.describe.configure({mode: 'serial'});

const
    SENDER        = '@list-completeness-sender',
    RECIPIENT     = '@list-completeness-recipient',
    DEFAULT_LIMIT = 50,
    SEEDED        = 60;

test.describe('MailboxService.listMessages — a page must declare its own completeness', () => {
    let MailboxService, GraphService, LifecycleService;

    const asRecipient = callback => RequestContextService.run({agentIdentityNodeId: RECIPIENT}, callback);

    test.beforeAll(async () => {
        GraphService     = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        MailboxService   = (await import('../../../../../../ai/services/memory-core/MailboxService.mjs')).default;
        LifecycleService = (await import('../../../../../../ai/services/memory-core/lifecycle/SystemLifecycleService.mjs')).default;

        if (!LifecycleService._initPromise) {
            await LifecycleService.initAsync();
        } else {
            await LifecycleService.ready();
        }

        // Fixture-owned identities rather than borrowed roster members, so neither send nor read
        // depends on whatever ran earlier in this worker.
        GraphService.upsertNode({id: SENDER,    type: 'AgentIdentity', name: 'List Completeness Sender',    properties: {accountType: 'agent'}});
        GraphService.upsertNode({id: RECIPIENT, type: 'AgentIdentity', name: 'List Completeness Recipient', properties: {accountType: 'agent'}});

        // Seeded oldest-first so `oldest` below is genuinely the deepest row under a newest-first
        // sort — the position the incidents actually failed to reach.
        for (let i = 0; i < SEEDED; i++) {
            await RequestContextService.run({agentIdentityNodeId: SENDER}, () => MailboxService.addMessage({
                to     : RECIPIENT,
                subject: `completeness fixture ${String(i).padStart(3, '0')}`,
                body   : 'seeded past the default limit so truncation is reachable'
            }));
        }
    });

    test('a full page that leaves rows behind reports truncated with a continuation', async () => {
        const page = await asRecipient(() => MailboxService.listMessages({box: 'inbox'}));

        expect(page.messages).toHaveLength(DEFAULT_LIMIT);
        expect(page.totalCount, 'the count is of the FILTER, not of the page').toBe(SEEDED);
        expect(page.truncated).toBe(true);
        expect(page.nextOffset).toBe(DEFAULT_LIMIT);
        expect(page.limit,  'the receipt carries its own depth').toBe(DEFAULT_LIMIT);
        expect(page.offset).toBe(0);
    });

    test('a SHORT page reports truncated false — the flag must be able to say no', async () => {
        // Without this arm a flag hardwired to `true` would satisfy the arm above. An indicator
        // that cannot report the negative case is not an indicator.
        const page = await asRecipient(() => MailboxService.listMessages({box: 'inbox', limit: SEEDED + 10}));

        expect(page.messages).toHaveLength(SEEDED);
        expect(page.totalCount).toBe(SEEDED);
        expect(page.truncated).toBe(false);
        expect(page.nextOffset).toBeNull();
    });

    test('a page that EXACTLY exhausts the filter is not truncated, though length === limit', async () => {
        // The discriminating cell: this is the one input where the naive `length === limit`
        // heuristic and the correct answer disagree. Reporting `true` here would be a false
        // positive AND would publish a `nextOffset` addressing an empty page — the flag would then
        // cost the same trust its absence cost. The other two arms pass under either reading.
        const page = await asRecipient(() => MailboxService.listMessages({box: 'inbox', limit: SEEDED}));

        expect(page.messages, 'a full page by length').toHaveLength(SEEDED);
        expect(page.messages.length === SEEDED, 'length === limit holds here').toBe(true);
        expect(page.truncated, 'and yet nothing remains beyond it').toBe(false);
        expect(page.nextOffset).toBeNull();
    });

    test('the incident replay: a message deeper than one page is unreachable at offset 0 and reachable via nextOffset', async () => {
        // Both false absence claims were exactly this shape — the target sat below the default
        // window, the query returned rows, and the zero was read as a fact about the store.
        const oldestSubject = 'completeness fixture 000';

        const firstPage = await asRecipient(() => MailboxService.listMessages({box: 'inbox'}));

        expect(
            firstPage.messages.some(message => message.subject === oldestSubject),
            'the deepest row is NOT in the default window — this is the trap'
        ).toBe(false);

        expect(
            firstPage.truncated,
            'and the response now says so, which is the whole repair'
        ).toBe(true);

        const nextPage = await asRecipient(() => MailboxService.listMessages({box: 'inbox', offset: firstPage.nextOffset}));

        expect(
            nextPage.messages.some(message => message.subject === oldestSubject),
            'following the advertised continuation reaches it'
        ).toBe(true);
        expect(nextPage.offset, 'and the continuation page reports the depth it was read at').toBe(DEFAULT_LIMIT);
    });

    test('an absence is only demonstrable when totalCount is 0', async () => {
        // The positive form of the rule. A filter with no match must be distinguishable from a
        // filter whose match is deeper than the window — that distinction is the ticket.
        const page = await asRecipient(() => MailboxService.listMessages({
            box         : 'inbox',
            fromIdentity: '@nobody-ever-sent-this'
        }));

        expect(page.messages).toHaveLength(0);
        expect(page.totalCount, 'zero rows AND zero total — absence is now provable').toBe(0);
        expect(page.truncated).toBe(false);
        expect(page.nextOffset).toBeNull();
    });

    // The continuation is a PROMISE OF PROGRESS, and the schema accepted inputs that could not keep
    // it. Advertising `truncated: true` with a `nextOffset` that does not exceed the offset just
    // read turns a caller's paginate-to-the-end loop into a non-terminating one — strictly worse
    // than the missing flag this change exists to fix, because a caller now trusts it.
    //
    // Found in review by @neo-gpt. The first version of this repair shipped the loop.
    for (const [name, bounds, expected] of [
        ['a zero limit',       {limit: 0},      /limit must be a positive integer/],
        ['a negative limit',   {limit: -5},     /limit must be a positive integer/],
        ['a fractional limit', {limit: 2.5},    /limit must be a positive integer/],
        ['a negative offset',  {offset: -10},   /offset must be a non-negative integer/]
    ]) {
        test(`${name} is REFUSED rather than served a non-advancing continuation`, async () => {
            // `limit: 0` was the live one: it sliced an empty page while rows remained, so the
            // response claimed `truncated` and returned `nextOffset: 0` — the offset just read.
            await expect(asRecipient(() => MailboxService.listMessages({box: 'inbox', ...bounds})))
                .rejects.toThrow(expected);
        });
    }

    test('following nextOffset TERMINATES and visits every row exactly once', async () => {
        // The invariant as a property rather than as a spot check: walk the whole mailbox by the
        // continuation the service advertises. A non-advancing `nextOffset` hangs here instead of
        // passing quietly, and the visit-count assertions catch a cursor that skips or repeats.
        const seen  = [];
        let   page  = await asRecipient(() => MailboxService.listMessages({box: 'inbox', limit: 7}));
        let   walks = 0;

        while (true) {
            expect(++walks, 'the walk must terminate — a stalled cursor would spin here').toBeLessThan(SEEDED + 5);
            seen.push(...page.messages.map(message => message.subject));

            if (!page.truncated) {
                expect(page.nextOffset).toBeNull();
                break;
            }

            expect(page.nextOffset, `a truncated page must advance past offset ${page.offset}`)
                .toBeGreaterThan(page.offset);

            page = await asRecipient(() => MailboxService.listMessages({box: 'inbox', limit: 7, offset: page.nextOffset}));
        }

        expect(seen, 'every seeded row reached, none repeated').toHaveLength(SEEDED);
        expect(new Set(seen).size, 'and each exactly once').toBe(SEEDED);
    });
});
