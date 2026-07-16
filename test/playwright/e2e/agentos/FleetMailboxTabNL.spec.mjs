import {test, expect} from '../../fixtures.mjs';

/**
 * @summary The AgentDetail **Mailbox tab** proven LIVE: the drill reveals the inspector,
 * the REAL DOM click on the countless "Mailbox" tab button activates the pane, and the pane renders
 * the honest `unobserved` state (no live wiring injects adapter snapshots yet — the truthful
 * today-state, never fabricated rows). Then a live adapter-shaped snapshot is injected through the
 * possession seam (`setProperties` on the mounted pane — exactly the wiring's contract) and the
 * whole render chain is exercised over the real DOM: rows appear newest-first, the collapsed
 * thread head carries its `+N earlier` chip, and a REAL click on the thread head expands the
 * thread inline — proving the `data-thread-id` → DOM dataset → delegated-listener path end-to-end.
 *
 * Read-only discipline (the record's MUST-NOT) is asserted live: no button/input renders anywhere
 * inside the pane, and the tab button text is exactly "Mailbox" — countless by design.
 *
 * @see apps/agentos/view/fleet/MailboxPane.mjs
 * @see apps/agentos/view/fleet/AgentDetail.mjs
 * @see test/playwright/e2e/agentos/FleetCockpitDrillNL.spec.mjs (the drill pattern this extends)
 */
test.describe('AgentOS fleet cockpit — the AgentDetail Mailbox tab live (#15270)', () => {
    test.setTimeout(90000);

    test('drill → Mailbox tab: honest unwired state; injected snapshot renders rows; the thread head toggles on a real DOM click', async ({page, neuralLink}) => {
        await page.goto('/apps/agentos/index.html');
        await expect(page.locator('.fm-fleet-cockpit')).toBeVisible({timeout: 60000});
        await expect(page.locator('.fm-agent-card').first()).toBeVisible({timeout: 30000});

        const app    = await neuralLink.connectToApp('AgentOS'),
              cards  = await app.queryComponent({className: 'AgentOS.view.fleet.AgentCard'}, ['record', 'id']),
              target = cards.find(entry => entry?.properties?.record?.agentId && entry?.properties?.id);

        expect(target, 'a card exposes both a record agentId and a component id').toBeTruthy();

        const expectedAgentId = target.properties.record.agentId;

        // the drill target is the dedicated native Button (`fm-card-drill`), NOT the avatar: the
        // a11y refactor moved the gesture onto a real <button> that owns Enter/Space, and the avatar
        // is a handler-less Image, so clicking it is a silent no-op.
        await page.locator(`[id="${target.properties.id}"] .fm-card-drill`).click();

        const detail = page.locator('.fm-agent-detail');
        await expect(detail).toBeVisible({timeout: 15000});

        // the tab bar renders the COUNTLESS Mailbox tab — exactly "Mailbox", no badge, no count
        // (an unread count would imply operator-side read tracking that deliberately does not exist)
        const mailboxTab = detail.locator('.neo-tab-header-button', {hasText: 'Mailbox'})
            .or(detail.locator('.neo-tab-button', {hasText: 'Mailbox'}));
        await expect(mailboxTab.first()).toBeVisible({timeout: 15000});

        // the REAL DOM click activates the pane
        await mailboxTab.first().click();

        const pane = detail.locator('.fm-mailbox-pane');
        await expect(pane).toBeVisible({timeout: 15000});

        // the honest today-state: no wiring injects snapshots yet → unobserved, said plainly
        await expect(pane.locator('.fm-mailbox-state')).toHaveText(/Mailbox feed not wired/);

        // possession: the pane follows the drilled resident; the snapshot is honestly null
        const [mounted] = await app.queryComponent({className: 'AgentOS.view.fleet.MailboxPane'}, ['record', 'snapshot', 'id']);
        expect(mounted?.properties?.record?.agentId, 'the pane record follows the drill').toBe(expectedAgentId);
        expect(mounted?.properties?.snapshot ?? null, 'no snapshot = no fabricated rows').toBe(null);

        // inject a live adapter-shaped snapshot through the possession seam — the wiring's contract
        const capturedAt = new Date().toISOString();

        await app.setProperties(mounted.properties.id, {
            snapshot: {
                capability: {source: 'memory-core:mailbox', state: 'wired', confidence: 'observed', capturedAt, reason: null},
                admission : {state: 'granted', viewerIdentity: '@operator', subjectAgentId: expectedAgentId, checkedAt: capturedAt, reason: null},
                page      : {limit: 50, offset: 0, count: 3},
                rows      : [{
                    messageId     : 'MESSAGE:e2e-solo',
                    subject       : 'standalone live message',
                    from          : '@neo-gpt',
                    recipientClass: 'agent',
                    priority      : 'high',
                    status        : 'unread',
                    taskState     : null,
                    partOfThread  : null,
                    relatedTickets: [],
                    wakeSuppressed: false,
                    sentAt        : '2026-07-16T12:02:00.000Z',
                    readAt        : null
                }, {
                    messageId     : 'MESSAGE:e2e-thread-new',
                    subject       : 'thread head live',
                    from          : '@neo-gpt-emmy',
                    recipientClass: 'agent',
                    priority      : 'normal',
                    status        : 'read',
                    taskState     : null,
                    partOfThread  : 'THREAD:e2e',
                    relatedTickets: [],
                    wakeSuppressed: false,
                    sentAt        : '2026-07-16T12:01:00.000Z',
                    readAt        : '2026-07-16T12:05:00.000Z'
                }, {
                    messageId     : 'MESSAGE:e2e-thread-old',
                    subject       : 'thread member live',
                    from          : '@neo-gpt-emmy',
                    recipientClass: 'agent',
                    priority      : 'normal',
                    status        : 'read',
                    taskState     : null,
                    partOfThread  : 'THREAD:e2e',
                    relatedTickets: [],
                    wakeSuppressed: false,
                    sentAt        : '2026-07-16T12:00:00.000Z',
                    readAt        : '2026-07-16T12:05:00.000Z'
                }]
            }
        });

        // rows render in the REAL DOM: the standalone + ONE collapsed thread head, newest first
        await expect(pane.locator('.fm-mail-row')).toHaveCount(2, {timeout: 15000});
        await expect(pane.locator('.fm-mail-row').first().locator('.fm-mail-subject')).toHaveText('standalone live message');
        await expect(pane.locator('.fm-mail-thread-count')).toHaveText('+1 earlier');
        await expect(pane.locator('.fm-mailbox-page')).toHaveText('1–3');

        // read-only is structural, proven live: zero interactive verbs inside the pane
        await expect(pane.locator('button, input, textarea, select, a')).toHaveCount(0);

        // the REAL DOM click on the thread head — the data-thread-id → dataset → delegated-listener
        // path end-to-end: the thread expands inline (head + member now both visible)
        await pane.locator('.fm-mail-thread-head').click();
        await expect(pane.locator('.fm-mail-row')).toHaveCount(3, {timeout: 15000});
        await expect(pane.locator('.fm-mail-row').nth(2).locator('.fm-mail-subject')).toHaveText('thread member live')
    })
});
