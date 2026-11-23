import {expect, test} from '../../fixtures.mjs';

const PORTAL   = '/apps/portal/index.html',
      ADOPTION = '#/learn/guides/uibuildingblocks/DockLayoutsAdoption',
      RELEASES = '#/news/releases',
      DECISION = 'Decision 3 — policies live in the model, not in your UI';

test.describe('mobile article disclosures', () => {
    test.use({viewport: {width: 390, height: 844}});

    test('Learn announces the state after keyboard activation and selection', async ({page}) => {
        await page.goto(PORTAL + ADOPTION);
        await expect(page.locator('.neo-app-content-component h1')).toContainText('Adopting in Your App');

        const sections = page.getByRole('button', {name: 'On this page', exact: true}),
              topics   = page.getByRole('button', {name: 'Browse topics', exact: true});

        await expect(sections).toHaveAttribute('aria-expanded', 'false');
        await sections.press('Enter');
        await expect(sections).toHaveAttribute('aria-expanded', 'true');
        await expect(page.locator('.neo-app-content-sections-container')).toHaveClass(/\bneo-expanded\b/);

        await page.locator('.neo-app-content-sections-list').getByText(DECISION, {exact: true}).click();
        await expect(sections).toHaveAttribute('aria-expanded', 'false');
        await expect(page.locator('.neo-app-content-sections-container')).not.toHaveClass(/\bneo-expanded\b/);

        await expect(topics).toHaveAttribute('aria-expanded', 'false');
        await topics.press('Space');
        await expect(topics).toHaveAttribute('aria-expanded', 'true');
        await expect(page.locator('.sidenav-container')).toHaveClass(/\bneo-expanded\b/);

        await page.locator('.neo-app-content-tree-list .neo-list-item-leaf')
            .filter({hasText: /^Using These Topics$/}).click({timeout: 10000});
        await expect(page.locator('.neo-app-content-component h1')).toContainText('Using These Topics');
        await expect(topics).toHaveAttribute('aria-expanded', 'false');
        await expect(page.locator('.sidenav-container')).not.toHaveClass(/\bneo-expanded\b/)
    });

    test('News Releases uses the shared disclosure names and states', async ({page}) => {
        await page.goto(PORTAL + RELEASES);

        for (const name of ['Browse topics', 'On this page']) {
            const toggle = page.getByRole('button', {name, exact: true});

            await expect(toggle).toBeEnabled();
            await expect(toggle).toHaveAttribute('aria-expanded', 'false');
            await toggle.press('Enter');
            await expect(toggle).toHaveAttribute('aria-expanded', 'true');
            await toggle.press('Space');
            await expect(toggle).toHaveAttribute('aria-expanded', 'false')
        }
    })
});
