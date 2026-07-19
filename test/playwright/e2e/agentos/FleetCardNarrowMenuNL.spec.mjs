import {test, expect} from '../../fixtures.mjs';

/**
 * @summary The narrow AgentCard's ⋯ overflow menu, proven on the MOUNTED composition (the RA-2
 * carried-tooth witness from the exact-head re-review): below 320px the inline lifecycle verbs fold to ONE 44px ⋯ trigger.
 * This asserts the trigger's DOM accessibility contract — `aria-haspopup="menu"`, a subject-naming
 * `aria-label`, and a LIVE `aria-expanded` that flips on open/close — which a memory-only unit test
 * cannot see, and then OPENS the menu (native click AND keyboard) to confirm it carries BOTH lifecycle
 * verbs as real items (the contextual Start-or-Stop power verb + Restart), that `aria-expanded` tracks
 * the menu's actual visibility, and that exactly ONE menuList instance backs the trigger (the set-once,
 * no-leak invariant — a per-record re-set would strand a prior floating list).
 *
 * A wired-runtime resident is injected through the roster store's own API: the card gates its controls
 * on a wired runtime source, so an unwired seed row renders the ⋯ disabled and could not be exercised.
 *
 * @see apps/agentos/view/fleet/AgentCard.mjs (the ⋯ trigger + set-once, items-updated-in-place menu)
 * @see src/button/Base.mjs (afterSetMenu declares aria-haspopup + keeps aria-expanded live off hiddenChange)
 */
const WIRED_RESIDENT = {
    agentId    : 'menu-witness',
    displayName: 'Menu Witness',
    engineTag  : 'fixture',
    family     : 'claude',
    state      : 'off', // off + wired runtime → an enabled power verb that reads "Start"
    avatarUrl  : '',
    sources    : {
        roster    : {source: 'fleet:listAgents',    state: 'wired', confidence: 'observed'},
        repoStatus: {source: 'fleet:fleetStatus',   state: 'wired', confidence: 'observed'},
        runtime   : {source: 'fleet:runtimeStatus', state: 'wired', confidence: 'observed'}
    }
};

test.describe('AgentOS fleet cockpit — narrow AgentCard ⋯ overflow menu (RA-2, #15536)', () => {
    test.setTimeout(90000);

    test('the ⋯ trigger carries the menu-button ARIA contract and opens (click + keyboard) to both lifecycle verbs', async ({page, neuralLink}) => {
        await page.goto('/apps/agentos/index.html');
        await expect(page.locator('.fm-fleet-cockpit')).toBeVisible({timeout: 60000});
        await expect(page.locator('.fm-agent-card').first()).toBeVisible({timeout: 30000});

        // inject ONE wired-runtime resident via the store's own API (clear → add), so the card's controls
        // are enabled (an unwired seed row renders the ⋯ disabled and cannot be opened)
        const
            app      = await neuralLink.connectToApp('AgentOS'),
            [roster] = await app.findInstances({className: 'AgentOS.store.FleetRoster'}, ['id']),
            storeId  = (Array.isArray(roster) ? roster[0] : roster)?.id;

        expect(storeId, 'the provider-owned FleetRoster store must exist').toBeTruthy();
        await app.callMethod(storeId, 'clear');
        await app.callMethod(storeId, 'add', [[WIRED_RESIDENT]]);

        await expect.poll(async () => (await app.queryComponent({className: 'AgentOS.view.fleet.AgentCard'}, ['id'])).length, {
            message: 'the grid renders the injected resident', timeout: 15000, intervals: [250]
        }).toBe(1);

        // pin the grid to a single NARROW (<320px) track so the card's own @container narrow mode engages
        // and the ⋯ trigger replaces the inline verbs — card-owned width, not viewport
        await page.evaluate(() => {
            const cards = document.querySelector('.fm-fleet-cards');
            cards.style.gridTemplateColumns = '294px';
            cards.style.width               = '294px';
            cards.style.minWidth            = '294px';
            cards.style.maxWidth            = '294px'
        });

        const
            card    = page.locator('.fm-agent-card').first(),
            trigger = card.locator('.fm-card-action-menu');

        // the narrow route swap: the ⋯ trigger is the visible lifecycle route; the inline toggle is gone
        await expect(trigger).toBeVisible();
        await expect(card.locator('.fm-card-action:not(.fm-card-action-menu)').first()).toBeHidden();

        // the menu-button ARIA contract, ON THE DOM (not the no-op `ariaLabel` property a unit test reads)
        await expect(trigger).toBeEnabled();
        await expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
        await expect(trigger).toHaveAttribute('aria-expanded', 'false');
        expect(await trigger.getAttribute('aria-label')).toMatch(/ actions$/);

        const menu = page.locator('.neo-menu-list');

        // ── native CLICK opens: aria-expanded flips live, and the menu carries BOTH verbs as real items
        await trigger.click();
        await expect(trigger).toHaveAttribute('aria-expanded', 'true', {timeout: 10000});
        await expect(menu).toBeVisible();
        await expect(menu, 'the power verb is contextual (Start when off, Stop when running)').toContainText(/Start|Stop/);
        await expect(menu, 'restart is always reachable in the menu').toContainText('Restart');

        // exactly ONE menuList backs the trigger — set once, never re-set (the no-leak invariant)
        await expect(page.locator('.neo-menu-list')).toHaveCount(1);

        // ── re-clicking the trigger closes it: aria-expanded returns to collapsed, tracking the menu's
        // ACTUAL visibility — the live-expanded contract proven in BOTH directions
        await trigger.click();
        await expect(trigger).toHaveAttribute('aria-expanded', 'false', {timeout: 10000});
        await expect(menu).toBeHidden();

        // ── KEYBOARD opens too: the trigger is a native button, so focus + Enter activates it
        await trigger.focus();
        await page.keyboard.press('Enter');
        await expect(trigger).toHaveAttribute('aria-expanded', 'true', {timeout: 10000});
        await expect(menu).toBeVisible()
    })
});
