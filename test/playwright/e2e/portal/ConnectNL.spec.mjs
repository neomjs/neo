import {expect, test} from '../../fixtures.mjs';

const PAGE = '/apps/portal/index.html#/services';
const ROOT = '.portal-services-component';

/**
 * @summary Checks the real Portal entry point, including its compatibility route, rendered copy,
 * keyboard navigation and metadata. Worker identity binds the assertions to this page's own view.
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
                'Join the public development work'
            ]);
            await expect(root).not.toContainText(/Professional Trainings|Professional Services|40h|attendees|Instructor-led|On-Site Trainings/i);
            await expect(root.locator('a[href^="mailto:"], form')).toHaveCount(0);
            await expect(page).toHaveTitle('Connect with Neo.mjs');
            await expect(page.locator('meta[name="description"]')).toHaveAttribute('content',
                'Build an app with Neo.mjs, explore persistent project memory for coding agents, and join the public development work.');

            const links = root.getByRole('link');
            expect(await links.evaluateAll(nodes => nodes.map(node => node.getAttribute('href')))).toEqual([
                'https://github.com/neomjs/create-app',
                '#/examples',
                'https://github.com/neomjs/neo-agent-brain',
                'https://github.com/orgs/neomjs/discussions',
                'https://github.com/neomjs/neo/blob/dev/CONTRIBUTING.md'
            ]);

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
