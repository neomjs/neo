import {test, expect} from '../../fixtures.mjs';

/**
 * @summary The fleet grid's scroll contract: at a zone height shorter than the roster, the
 * cards region OWNS the vertical scroll (scrollHeight exceeds clientHeight and the last card
 * is reachable) while the health-summary header stays pinned above it. Written as the executable
 * receipt for a review's scroll-owner Required Action — the defect shape it guards is an
 * overflow rule landing on the shared parent (scrolling the header away) instead of the cards
 * region. Boot geometry is stage sizing, not a product assumption; the app stays responsive.
 *
 * Run: npx playwright test agentos/FleetGridScrollNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('AgentOS FleetGrid — roster scroll ownership', () => {
    test.setTimeout(90000);
    test.use({viewport: {height: 420, width: 1100}});

    test('the cards region scrolls end-to-end at a short zone height with the header pinned', async ({page, neuralLink}) => {
        await page.goto('/apps/agentos/index.html');
        await page.waitForSelector('.fm-agent-card', {timeout: 30000});

        const app = await neuralLink.connectToApp('AgentOS');

        expect(await app.findInstances({className: 'AgentOS.view.fleet.cockpit.Container'}, ['id']))
            .toBeTruthy();

        const metrics = await page.evaluate(() => {
            const cards         = document.querySelector('.fm-fleet-cards'),
                  head          = document.querySelector('.fm-fleet-head'),
                  last          = cards.querySelector('.fm-agent-card:last-child'),
                  headTopBefore = head.getBoundingClientRect().top;

            cards.scrollTop = cards.scrollHeight;

            const cardsRect = cards.getBoundingClientRect(),
                  lastRect  = last.getBoundingClientRect();

            return {
                clientHeight  : cards.clientHeight,
                headBottom    : head.getBoundingClientRect().bottom,
                headTopAfter  : head.getBoundingClientRect().top,
                headTopBefore,
                lastCardBottom: lastRect.bottom,
                lastCardTop   : lastRect.top,
                regionBottom  : cardsRect.bottom,
                scrollHeight  : cards.scrollHeight
            }
        });

        // the roster overflows the region and the region owns the scroll
        expect(metrics.scrollHeight, 'the 10-resident roster must overflow the cards region')
            .toBeGreaterThan(metrics.clientHeight);

        // the LAST card is reachable: after scrolling to the bottom it lies inside the region
        expect(metrics.lastCardTop, 'the last card must scroll into view').toBeLessThan(metrics.regionBottom);
        expect(metrics.lastCardBottom).toBeLessThanOrEqual(metrics.regionBottom + 1);

        // the health-summary header stayed pinned: its position is identical before and after
        // the scroll — the scroll moved the roster, never the summary
        expect(metrics.headTopAfter, 'the summary header must not move with the scroll')
            .toBe(metrics.headTopBefore);
        expect(metrics.headBottom, 'the summary header must stay visible above the roster')
            .toBeLessThan(metrics.lastCardTop)
    })
});
