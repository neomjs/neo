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
        // The injected snapshot must name the resident's MAILBOX identity, not the registry key —
        // the pane refuses a snapshot admitted for anyone else, so a fixture aimed with the wrong id
        // space renders nothing. This is the production contract, live: `githubUsername` is the
        // identity authority the admitted subject is checked against.
        const expectedSubject = `@${target.properties.record.githubUsername}`;

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

        // Possession: the pane follows the drilled resident; the snapshot is honestly null.
        //
        // The wait is load-bearing, not padding. The drill ISSUES an async mirror read, so asserting
        // `snapshot === null` the instant after the click would pass before that read could ever have
        // landed — green for the wrong reason, and blind to a snapshot arriving a tick later. A
        // negative assertion has to outlive the thing it proves absent. (No fleet server runs in this
        // suite, so the read fails closed and nothing is assigned; the wait is what makes that a
        // finding rather than a coincidence.)
        await page.waitForTimeout(500);

        const [mounted] = await app.queryComponent({className: 'AgentOS.view.fleet.MailboxPane'}, ['record', 'snapshot', 'id']);
        expect(mounted?.properties?.record?.agentId, 'the pane record follows the drill').toBe(expectedAgentId);
        expect(mounted?.properties?.snapshot ?? null, 'a fail-closed read assigns NOTHING — never a fabricated snapshot').toBe(null);

        // inject a live adapter-shaped snapshot through the possession seam — the wiring's contract
        const capturedAt = new Date().toISOString();

        await app.setProperties(mounted.properties.id, {
            snapshot: {
                capability: {source: 'memory-core:mailbox', state: 'wired', confidence: 'observed', capturedAt, reason: null},
                admission : {state: 'granted', viewerIdentity: '@operator', subjectAgentId: expectedSubject, checkedAt: capturedAt, reason: null},
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
        await expect(pane.locator('.fm-mailbox-page-range')).toHaveText('1–3');
        // The window can MOVE, not just describe itself: both edges render as real composed
        // controls, and a 3-of-50 page with no `hasMore` is the producer saying it ran out — so both
        // edges are closed, disabled rather than hidden.
        //
        // Both edges, asserted twice for two different contracts — neither matcher subsumes the other.
        //
        // `neo-disabled` is the class `component.Base` applies for `disabled`; it pins the
        // cross-component class contract, which is what this pane may rely on. It says nothing about
        // what a screen reader is told.
        await expect(pane.locator('.fm-mailbox-page-next')).toHaveClass(/neo-disabled/);
        await expect(pane.locator('.fm-mailbox-page-prev')).toHaveClass(/neo-disabled/);

        // `toBeDisabled()` pins the ANNOUNCED state, live. Playwright honours `aria-disabled` for
        // roles in `kAriaDisabledRoles` — `button` among them — so on a control carrying no native
        // attribute this passes off the pane's own `aria-disabled`, and that is exactly what makes it
        // worth asserting: it is the only proof the announcement reaches the REAL DOM. The unit spec
        // asserts `vdom['aria-disabled']`, and a vdom assertion can pass while the attribute never
        // flushes to a mounted node — proving the object, not the thing the operator's AT would read.
        await expect(pane.locator('.fm-mailbox-page-next')).toBeDisabled();
        await expect(pane.locator('.fm-mailbox-page-prev')).toBeDisabled();

        // read-only is structural, proven live: zero DATA-ENTRY elements and no mutation verb. The
        // bar is mutation, not interactivity — the one admissible control is the thread-collapse
        // toggle (display state), which MUST be a real button or no keyboard user can operate it.
        await expect(pane.locator('input, textarea, select, a')).toHaveCount(0);
        // the ONLY admissible controls are display-state navigation: the thread toggle and the two
        // page steps. Anything else here would be a mutation verb the record forbids.
        await expect(pane.locator('button:not(.fm-mail-thread-toggle):not(.fm-mailbox-page-step)')).toHaveCount(0);

        // the toggle is a native button naming its state — live, in the real DOM
        const toggle = pane.locator('.fm-mail-thread-toggle');
        await expect(toggle).toHaveAttribute('aria-expanded', 'false');

        // a REAL keyboard activation — Enter on the focused native button — drives the
        // data-thread-id → dataset → delegated-listener path end-to-end. A div would swallow this:
        // this is the assertion that would have caught the mouse-only affordance.
        await toggle.focus();
        await page.keyboard.press('Enter');

        await expect(pane.locator('.fm-mail-row')).toHaveCount(3, {timeout: 15000});
        await expect(pane.locator('.fm-mail-row').nth(2).locator('.fm-mail-subject')).toHaveText('thread member live');
        await expect(pane.locator('.fm-mail-thread-toggle')).toHaveAttribute('aria-expanded', 'true')
    });

    /**
     * @summary Detail-rail containment witnessed as PIXELS: with a FULL page of mail injected, the
     * rail must not outgrow its slot on either axis, and the fleet activity stream must stay inside
     * the viewport with EVERY tab active.
     *
     * Non-vacuity is the entire design of this guard. The sibling test above injects three rows —
     * three rows overflow nothing, so these same assertions would pass on the unfixed tree and
     * prove only that the page loads. The defect cannot exist below a full page: fifty rows carry
     * ~2454px of intrinsic content, which drove the stream's top edge to y=1695.8 in a 1084px
     * viewport while it reported `mounted: true, hidden: false`. So the fixture seeds the hard
     * shape deliberately, and every assertion reads a CLIENT RECT rather than component state,
     * because during the incident the state layer was telling the truth and the pixels were not.
     *
     * Both axes are asserted, because the pane overran horizontally too (1081.64px inside a 256px
     * slot) and a height-only guard would let that half of the defect back in silently.
     *
     * The injection seam is what makes this runnable at all: on the live plane the cockpit viewer
     * holds no `CAN_READ_INBOX_OF` grant, so the pane renders its denied line for every agent and
     * a measurement taken there would be vacuous. `setProperties` drives real rows past the
     * admission gate exactly as the sibling test does.
     *
     * @see resources/scss/src/apps/agentos/fleet/AgentDetail.scss (the `.neo-tab-body-container` seat)
     * @see resources/scss/src/apps/agentos/fleet/MailboxPane.scss (the pane's own `min-width`)
     */
    test('a full mailbox page never pushes the activity stream out of the shell, on either axis (#17313)', async ({page, neuralLink}) => {
        await page.goto('/apps/agentos/index.html');
        await expect(page.locator('.fm-fleet-cockpit')).toBeVisible({timeout: 60000});
        await expect(page.locator('.fm-agent-card').first()).toBeVisible({timeout: 30000});
        await expect(page.locator('.fm-activity-stream')).toBeVisible({timeout: 30000});

        const app    = await neuralLink.connectToApp('AgentOS'),
              cards  = await app.queryComponent({className: 'AgentOS.view.fleet.AgentCard'}, ['record', 'id']),
              target = cards.find(entry => entry?.properties?.record?.agentId && entry?.properties?.id);

        expect(target, 'a card exposes both a record agentId and a component id').toBeTruthy();

        await page.locator(`[id="${target.properties.id}"] .fm-card-drill`).click();

        const detail = page.locator('.fm-agent-detail');
        await expect(detail).toBeVisible({timeout: 15000});

        const mailboxTab = detail.locator('.neo-tab-header-button', {hasText: 'Mailbox'})
            .or(detail.locator('.neo-tab-button', {hasText: 'Mailbox'}));

        await mailboxTab.first().click();

        const pane = detail.locator('.fm-mailbox-pane');
        await expect(pane).toBeVisible({timeout: 15000});

        const [mounted] = await app.queryComponent({className: 'AgentOS.view.fleet.MailboxPane'}, ['id']);
        expect(mounted?.properties?.id, 'the mailbox pane is mounted and addressable').toBeTruthy();

        // A FULL page. The subject lines are deliberately long: intrinsic WIDTH is what drove the
        // horizontal half of this defect, and short fixtures would never reproduce it.
        const capturedAt = new Date().toISOString(),
              rowCount   = 50,
              rows       = Array.from({length: rowCount}, (_, i) => ({
                  messageId     : `MESSAGE:e2e-fullpage-${i}`,
                  subject       : `full page message ${i} — a realistically long subject line carrying the intrinsic width this guard exists to bound`,
                  from          : '@neo-gpt',
                  recipientClass: 'agent',
                  priority      : i % 5 === 0 ? 'high' : 'normal',
                  status        : i % 3 === 0 ? 'unread' : 'read',
                  taskState     : null,
                  partOfThread  : null,
                  relatedTickets: [],
                  wakeSuppressed: false,
                  sentAt        : new Date(Date.UTC(2026, 6, 16, 12, 0, 0) - i * 60000).toISOString(),
                  readAt        : i % 3 === 0 ? null : '2026-07-16T12:05:00.000Z'
              }));

        await app.setProperties(mounted.properties.id, {
            snapshot: {
                capability: {source: 'memory-core:mailbox', state: 'wired', confidence: 'observed', capturedAt, reason: null},
                admission : {state: 'granted', viewerIdentity: '@operator', subjectAgentId: `@${target.properties.record.githubUsername}`, checkedAt: capturedAt, reason: null},
                page      : {limit: 50, offset: 0, count: rowCount},
                rows
            }
        });

        await expect(pane.locator('.fm-mail-row')).toHaveCount(rowCount, {timeout: 15000});

        /** Client-rect truth for the shell, the rail, the pane and the scroll seat — one pass. */
        const readGeometry = () => page.evaluate(() => {
            const rect = el => {
                const r = el.getBoundingClientRect();
                return {top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height}
            };

            const stream = document.querySelector('.fm-activity-stream'),
                  detail = document.querySelector('.fm-agent-detail'),
                  pane   = document.querySelector('.fm-mailbox-pane'),
                  rowsEl = document.querySelector('.fm-mailbox-rows'),
                  doc    = document.documentElement;

            return {
                viewport : {width: window.innerWidth, height: window.innerHeight},
                stream   : stream ? rect(stream) : null,
                detail   : detail ? rect(detail) : null,
                pane     : pane   ? rect(pane)   : null,
                rows     : rowsEl ? {...rect(rowsEl), scrollHeight: rowsEl.scrollHeight, clientHeight: rowsEl.clientHeight} : null,
                docScroll: {scrollHeight: doc.scrollHeight, clientHeight: doc.clientHeight}
            }
        });

        const geo  = await readGeometry(),
              dump = JSON.stringify(geo);

        // AC-2 non-vacuity control: unless the rows container genuinely overflows, the containment
        // assertions below are unfalsifiable and this guard proves nothing.
        expect(geo.rows, `the rows container is present — ${dump}`).toBeTruthy();
        expect(geo.rows.scrollHeight, `the fixture seeds real overflow (hard shape) — ${dump}`)
            .toBeGreaterThan(geo.rows.clientHeight);

        // AC-2: the scroll lives INSIDE the tab body; the shell's own geometry stays sovereign.
        expect(geo.docScroll.scrollHeight, `the shell itself never scrolls — ${dump}`)
            .toBeLessThanOrEqual(geo.docScroll.clientHeight + 1);

        // AC-1, horizontal half: the pane fits its rail slot (1081.64px inside a 256px slot before).
        expect(geo.pane.width, `the mailbox pane fits the detail rail — ${dump}`)
            .toBeLessThanOrEqual(geo.detail.width + 1);

        // AC-1, vertical half: the stream keeps a real slot in the shell, witnessed as pixels.
        expect(geo.stream, `the activity stream is in the DOM — ${dump}`).toBeTruthy();
        expect(geo.stream.height, `the stream has a non-empty client rect — ${dump}`).toBeGreaterThan(0);
        expect(geo.stream.top, `the stream's top edge stays inside the viewport — ${dump}`)
            .toBeLessThan(geo.viewport.height);

        // AC-1 across EVERY tab + AC-3: each header label is readable at the rail's shipped width.
        const tabButtons = detail.locator('.neo-tab-header-toolbar .neo-tab-button'),
              tabCount   = await tabButtons.count();

        expect(tabCount, 'the detail rail renders its three tabs').toBeGreaterThanOrEqual(3);

        for (let i = 0; i < tabCount; i++) {
            const button = tabButtons.nth(i),
                  label  = (await button.innerText()).trim();

            await button.click();
            await page.waitForTimeout(250);

            const perTab = await readGeometry();

            expect(perTab.stream.height, `stream keeps a client rect with the "${label}" tab active — ${JSON.stringify(perTab)}`)
                .toBeGreaterThan(0);
            expect(perTab.stream.top, `stream stays inside the viewport with the "${label}" tab active — ${JSON.stringify(perTab)}`)
                .toBeLessThan(perTab.viewport.height);

            // AC-3: no clipped label at the shipped width — "Configuration" rendered as "Configurat".
            const clipping = await button.evaluate(el => ({scrollWidth: el.scrollWidth, clientWidth: el.clientWidth}));

            expect(clipping.scrollWidth, `the "${label}" tab label is not clipped — ${JSON.stringify(clipping)}`)
                .toBeLessThanOrEqual(clipping.clientWidth + 1)
        }
    })
});
