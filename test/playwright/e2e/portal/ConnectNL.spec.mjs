import {expect, test}                   from '../../fixtures.mjs';
import {readComponentRects, withinRect} from '../utils/dockGeometry.mjs';

const PAGE = '/apps/portal/index.html#/services';
const ROOT = '.portal-services-component';

/**
 * @summary Checks the real Portal entry point, including its compatibility route, rendered copy,
 * the maintainers card's links and bounds, keyboard navigation and metadata. Worker identity binds
 * the assertions to this page's own view.
 */
test.describe('Portal Connect', () => {
    for (const viewport of [{width: 1440, height: 1000}, {width: 390, height: 844}]) {
        test(`${viewport.width}px: public next steps replace the obsolete offers`, async ({page, neuralLink}, testInfo) => {
            await page.setViewportSize(viewport);
            await page.goto(PAGE);
            const app  = await neuralLink.connectToApp('Portal');
            const root = page.locator(ROOT);

            await expect(root.getByRole('heading', {level: 1})).toHaveText('Connect');
            const matches = await app.queryComponent({className: 'Portal.view.services.Container'}, ['id', 'mounted']);
            const view    = Array.isArray(matches) ? matches[0] : matches;
            expect(view.id).toBe(await root.getAttribute('id'));
            expect(view.properties?.mounted ?? view.mounted).toBe(true);

            await expect(root.getByRole('heading', {level: 2})).toHaveText([
                'Build an application',
                'Give your agent project memory',
                'Join the public development work',
                'Talk to the maintainers'
            ]);
            await expect(root).not.toContainText(/Professional Trainings|Professional Services|40h|attendees|Instructor-led|On-Site Trainings/i);
            await expect(root.locator('a[href^="mailto:"], form')).toHaveCount(0);
            await expect(page).toHaveTitle('Connect with Neo.mjs');
            await expect(page.locator('meta[name="description"]')).toHaveAttribute('content',
                'Build an app with Neo.mjs, explore persistent project memory for coding agents, join the public development work, or reach the maintainers directly.');

            const links = root.getByRole('link');
            expect(await links.evaluateAll(nodes => nodes.map(node => node.getAttribute('href')))).toEqual([
                'https://github.com/neomjs/create-app',
                '#/examples',
                'https://github.com/neomjs/neo-agent-brain',
                'https://github.com/orgs/neomjs/discussions',
                'https://github.com/neomjs/neo/blob/dev/CONTRIBUTING.md',
                'https://github.com/orgs/neomjs/discussions',
                'https://www.linkedin.com/in/tobiasuhlig/'
            ]);

            // The cards as the App worker holds them: the fourth and last one is the way to the maintainers.
            const {tree}  = await app.getComponentTree(view.id, -1, true),
                  wrapper = tree.items[1],
                  cards   = wrapper.items.filter(item => item.className === 'Neo.container.Base'),
                  card    = cards.at(-1),
                  cardEl  = page.locator(`#${card.id}`);

            expect(cards).toHaveLength(4);
            expect((await app.getComponent(card.items[0].id, ['text'])).text).toBe('Talk to the maintainers');

            // One public link, exactly one private one, and nothing that reads as an offer.
            expect(await cardEl.getByRole('link').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')))).toEqual([
                'https://github.com/orgs/neomjs/discussions',
                'https://www.linkedin.com/in/tobiasuhlig/'
            ]);
            await expect(cardEl).not.toContainText(/[$€£]|\bpric(e|ing)\b/i);

            const scroller = root.locator('.portal-services-content-wrapper');
            expect(await scroller.evaluate(node => node.scrollWidth <= node.clientWidth + 1),
                'the content fits the viewport without horizontal scrolling').toBe(true);
            await page.screenshot({path: testInfo.outputPath('connect-top.png')});

            const create = root.getByRole('link', {name: 'Create an app', exact: true});
            await create.focus();
            await expect(create).toBeFocused();
            await page.keyboard.press('Tab');
            await expect(root.getByRole('link', {name: 'Explore examples', exact: true})).toBeFocused();
            await page.keyboard.press('Tab');
            await expect(root.getByRole('link', {name: 'Explore the Agent OS', exact: true})).toBeFocused();
            await page.keyboard.press('Tab');
            await expect(root.getByRole('link', {name: 'Join the discussion', exact: true})).toBeFocused();
            await page.keyboard.press('Tab');
            const contribute = root.getByRole('link', {name: 'Contribute a change', exact: true});
            await expect(contribute).toBeFocused();
            await expect(contribute).toBeInViewport();
            await page.keyboard.press('Tab');
            await expect(root.getByRole('link', {name: 'Ask in the discussions', exact: true})).toBeFocused();
            await page.keyboard.press('Tab');
            const message = root.getByRole('link', {name: 'Message Tobias Uhlig on LinkedIn', exact: true});
            await expect(message).toBeFocused();
            await expect(message).toBeInViewport();

            await cardEl.scrollIntoViewIfNeeded();
            const rects = await readComponentRects(app, [card.id, wrapper.id]);
            expect(rects[card.id].width, 'the card is laid out').toBeGreaterThan(0);
            expect(withinRect(rects[card.id], rects[wrapper.id]),
                `the card ${JSON.stringify(rects[card.id])} stays inside the content wrapper ${JSON.stringify(rects[wrapper.id])}`).toBe(true);
            await page.screenshot({path: testInfo.outputPath('connect-bottom.png')});

            // Exercise a real in-app destination; well-formed hrefs alone do not prove routing.
            await root.getByRole('link', {name: 'Explore examples', exact: true}).click();
            await expect(page).toHaveURL(/#\/examples$/);
            let examples;
            await expect.poll(async () => {
                const matches = await app.queryComponent({className: 'Portal.view.examples.TabContainer'}, ['id']);
                examples = Array.isArray(matches) ? matches[0] : matches;
                return examples?.id
            }).toBeTruthy();
            await expect(page.locator(`#${examples.id}`)).toBeVisible();
        })
    }

    test('header and footer reach Connect through the retained services route', async ({page, neuralLink}) => {
        await page.goto('/apps/portal/index.html#/home');
        await neuralLink.connectToApp('Portal');
        const header = page.locator('.portal-header-toolbar');
        const footer = page.locator('.portal-home-footer-container');

        await expect(header.getByRole('link', {name: 'Connect', exact: true})).toBeVisible();
        const link = footer.getByRole('link', {name: 'Connect', exact: true});
        await link.scrollIntoViewIfNeeded();
        await link.click();
        await expect(page).toHaveURL(/#\/services$/);
        await expect(page.locator(ROOT).getByRole('heading', {level: 1})).toHaveText('Connect');
        await expect(page).toHaveTitle('Connect with Neo.mjs')
    })
});
