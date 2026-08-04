import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Whitebox E2E witness for resident-card container sizing (pane-keyed, not viewport-keyed).
 *
 * The resident cards size their type from container units against their pane, so two panes of
 * materially different height in the same window must resolve materially different type — and a
 * declared trim element (the sparkline wave) must never silently resolve to a used height of 0:
 * it either renders, or an explicit container-query rule hides it. The assertions bind the
 * relationships, never pixel values or the disclosure thresholds themselves, so a design retune
 * that preserves the contract stays green.
 *
 * Run: NEO_E2E_PORT=8152 npx playwright test workstation/WorkstationResidentCardSizingNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */

/**
 * Boots the workstation app and waits for the resident cards to be laid out.
 * @param {Object} page Playwright page
 * @returns {Promise<void>}
 */
async function bootWorkstation(page) {
    await page.goto('/apps/workstation/index.html');
    await page.waitForSelector('.workstation-dock-host', {timeout: 60000});
    await page.waitForSelector('.workstation-resident-card', {timeout: 60000});
    await page.waitForFunction(() => {
        const panes = [...document.querySelectorAll('.workstation-placeholder')];

        return panes.length > 1 && panes.every(pane => pane.getBoundingClientRect().height > 0)
    }, {timeout: 60000});
    await page.waitForTimeout(1200)
}

/**
 * Collects the per-card sizing facts the assertions consume.
 * @param {Object} page Playwright page
 * @returns {Promise<Object[]>}
 */
function collectCards(page) {
    return page.evaluate(() => [...document.querySelectorAll('.workstation-resident-card')].map(card => {
        const pane     = card.closest('.workstation-placeholder'),
              cardCs   = getComputedStyle(card),
              cardRect = card.getBoundingClientRect(),
              metric   = card.querySelector('.workstation-resident-metric'),
              wave     = card.querySelector('.workstation-resident-wave'),
              visible  = [...card.children].filter(child => getComputedStyle(child).display !== 'none'),
              lastVis  = visible.at(-1)?.getBoundingClientRect();

        return {
            title      : card.querySelector('.workstation-resident-title')?.textContent?.trim(),
            paneHeight : pane.getBoundingClientRect().height,
            metricFs   : parseFloat(getComputedStyle(metric).fontSize),
            waveDisplay: getComputedStyle(wave).display,
            waveHeight : wave.getBoundingClientRect().height,
            // Positive values mean the last visible child escapes the card's content box —
            // the flex layout was asked to absorb negative slack.
            slackOverrun: lastVis ? lastVis.bottom - (cardRect.bottom - parseFloat(cardCs.paddingBottom)) : 0
        }
    }))
}

/**
 * Asserts the three sizing relationships on a collected card set.
 * @param {Object[]} cards
 */
function assertSizingContract(cards) {
    expect(cards.length, 'resident cards must be present').toBeGreaterThan(1);

    const byHeight = [...cards].sort((a, b) => a.paneHeight - b.paneHeight),
          shortest = byHeight.at(0),
          tallest  = byHeight.at(-1);

    // Precondition, not an assertion target: the dock layout hands this app materially
    // different pane heights. If it ever stops doing so, the relationship below is vacuous
    // and the spec must fail loudly rather than pass silently.
    expect(
        tallest.paneHeight / shortest.paneHeight,
        `pane heights must differ materially (tallest ${tallest.paneHeight}, shortest ${shortest.paneHeight})`
    ).toBeGreaterThan(1.5);

    expect(
        tallest.metricFs,
        `metric type must track the pane: tallest pane ${tallest.paneHeight}px (${tallest.title}) vs shortest ${shortest.paneHeight}px (${shortest.title})`
    ).toBeGreaterThan(shortest.metricFs);

    cards.forEach(card => {
        if (card.waveDisplay !== 'none') {
            expect(
                card.waveHeight,
                `${card.title}: a rendered wave must never resolve to 0 height (pane ${card.paneHeight}px)`
            ).toBeGreaterThan(0)
        }

        expect(
            card.slackOverrun,
            `${card.title}: visible content must fit the card's content box (pane ${card.paneHeight}px)`
        ).toBeLessThanOrEqual(0.5)
    })
}

test.describe('Workstation resident cards — pane-keyed sizing at a roomy viewport', () => {
    test.setTimeout(90000);
    test.use({
        contextOptions: {screen: {height: 1080, width: 1920}},
        viewport      : {height: 840, width: 1180}
    });

    test('unequal panes resolve unequal type; declared trim never renders at 0', async ({page}) => {
        await bootWorkstation(page);

        const cards = await collectCards(page);

        assertSizingContract(cards);

        // At this viewport every resident pane clears the disclosure thresholds: the wave is
        // part of the composition and must be present on every card, tall and short alike.
        cards.forEach(card => {
            expect(card.waveDisplay, `${card.title}: wave must render at ${card.paneHeight}px pane height`).not.toBe('none')
        })
    })
});

test.describe('Workstation resident cards — progressive disclosure at a short viewport', () => {
    test.setTimeout(90000);
    test.use({
        contextOptions: {screen: {height: 1080, width: 1920}},
        viewport      : {height: 700, width: 900}
    });

    test('short panes drop trim by rule instead of shrinking it to nothing', async ({page}) => {
        await bootWorkstation(page);

        const cards = await collectCards(page);

        assertSizingContract(cards);

        // The short band of this layout sits below the wave threshold: at least one card must
        // have taken the explicit-hide branch, proving disclosure is a rule, not an accident.
        expect(
            cards.some(card => card.waveDisplay === 'none'),
            'at least one short pane must hide its wave via the container query'
        ).toBe(true)
    })
});
