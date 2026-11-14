import {test, expect} from '@playwright/test';

test.use({viewport: {width: 1440, height: 840}});

for (const route of ['learn', 'news/releases/13.4.0']) {
    test(`article-first DOM preserves desktop and mobile layout on ${route}`, async ({page}) => {
        await page.goto(`/apps/portal/#/${route}`);
        const container = page.locator('.neo-app-content-container:visible'),
              article = container.locator(':scope > main'),
              sidebar = container.locator(':scope > .sidenav-container'),
              splitter = container.locator(':scope > .main-content-splitter'),
              sections = container.locator(':scope > .neo-app-content-sections-container');

        await expect(container.locator('article')).toBeVisible();
        await expect(page.locator('main:visible')).toHaveCount(1);
        await expect(article.locator('article')).toHaveCount(1);
        expect(await container.evaluate(el => el.children[0].tagName)).toBe('MAIN');

        const width = () => sidebar.evaluate(el => el.getBoundingClientRect().width),
              initialWidth = route === 'learn' ? 350 : 250;
        await expect.poll(width).toBe(initialWidth);
        const boxes = await Promise.all([sidebar, splitter, article, sections].map(el => el.boundingBox()));

        for (let index = 1; index < boxes.length; index++) {
            expect(boxes[index].x).toBeGreaterThan(boxes[index - 1].x);
        }

        for (const [delta, expected] of [[120, initialWidth + 120], [-80, initialWidth + 40], [-40, initialWidth]]) {
            const box = await splitter.boundingBox(),
                  x = box.x + box.width / 2,
                  y = box.y + 100;

            await page.mouse.move(x, y);
            await page.mouse.down();
            await page.mouse.move(x + delta, y, {steps: 20});
            await page.mouse.up();
            await expect.poll(width).toBe(expected);
        }

        await page.setViewportSize({width: 390, height: 844});
        const toggle = sidebar.locator('.sidenav-button'),
              left = () => sidebar.evaluate(el => el.getBoundingClientRect().x);

        await expect(toggle).toBeVisible();
        await expect(splitter).toBeHidden();
        await expect.poll(left).toBe(-initialWidth);
        await toggle.click();
        await expect.poll(left).toBe(0);
        const overlay = await sidebar.boundingBox(),
              content = await article.boundingBox();

        expect(overlay.x + overlay.width).toBeGreaterThan(content.x);
        await toggle.click();
        await expect.poll(left).toBe(-initialWidth);
    });
}
