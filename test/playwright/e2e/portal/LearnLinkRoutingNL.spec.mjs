import {test, expect} from '@playwright/test';

/**
 * A guide's relative Markdown link must reach its destination in the running portal.
 *
 * The component and corpus arms both proved properties of the rewrite in isolation — and both stayed
 * green when the production `rewriteLinks` invocation was deleted, because neither executed it. That
 * mutation is what this arm exists to catch: it drives the real Portal app, so the render path, the
 * view's declared route, the router and the tree store all participate. Removing the hook call or the
 * Portal's `contentRoute` turns it red.
 *
 * It also answers the question the other two structurally cannot: not "is the href well-formed" but
 * "does clicking it arrive".
 */

const GUIDE       = '/apps/portal/index.html#/learn/guides/uibuildingblocks/DockLayouts',
      ADOPTION_ID = 'guides/uibuildingblocks/DockLayoutsAdoption';

/** The content component's own class, so the assertions cannot drift onto sidebar or chrome links. */
const CONTENT = '.neo-app-content-component';

/** The sidebar tree, whose navigation owes nothing to the rewrite — see the control arm below. */
const TREE = '.neo-app-content-tree-list';

test.describe('learn link routing', () => {
    test('a relative guide link is rendered as a route, not a file path', async ({page}) => {
        await page.goto(GUIDE);

        const content = page.locator(CONTENT);

        // Auto-waits: the record fetch and render are async, and an empty article would make every
        // locator below match nothing and pass vacuously.
        await expect(content.locator('h1')).toContainText('Dock');

        // The corpus authors this as `DockLayoutsAdoption.md`; only the rewrite can turn it into a
        // route. Deleting the hook leaves the raw `.md` href here.
        await expect(content.locator(`a[href="#/learn/${ADOPTION_ID}"]`).first()).toHaveCount(1)
    });

    test('a fragment-bearing link keeps its anchor on the route', async ({page}) => {
        await page.goto(GUIDE);

        const content = page.locator(CONTENT);
        await expect(content.locator('h1')).toContainText('Dock');

        // Authored as `DockLayoutsAdoption.md#decision-3--...`. The router's `{*itemId}` captures the
        // whole suffix, so the id and the anchor must both survive for the controller to split them.
        await expect(
            content.locator(`a[href^="#/learn/${ADOPTION_ID}#"]`).first()
        ).toHaveCount(1)
    });

    /**
     * Ordered before the click arm on purpose, and kept even though it asserts nothing about the
     * rewrite: the sidebar tree is the app's own navigation. If a click stops working in this tier,
     * this arm reddens too and names the harness as the subject. Without it a harness regression
     * reads as "the rewrite is broken", which is the misreading that got an earlier click arm
     * written and reverted.
     */
    test('control: the harness can click the app\'s own navigation', async ({page}) => {
        await page.goto(GUIDE);

        const content = page.locator(CONTENT);
        await expect(content.locator('h1')).toContainText('Dock');

        await page.locator(`${TREE} .neo-list-item-leaf`).filter({hasText: 'Using These Topics'}).first().click();

        await expect(content.locator('h1')).toContainText('Using These Topics')
    });

    /**
     * The question the href arms structurally cannot answer: not "is the href well-formed" but
     * "does clicking it arrive". Neutering `MainContainerController#onRouteLearnItem` leaves every
     * href above correct and reddens only this arm.
     */
    test('clicking a rewritten link arrives at its destination', async ({page}) => {
        await page.goto(GUIDE);

        const content = page.locator(CONTENT);
        await expect(content.locator('h1')).toContainText('Dock Layouts:');

        await content.locator(`a[href="#/learn/${ADOPTION_ID}"]`).first().click();

        // The source page is 'Dock Layouts: One Application, Many Windows', so the destination's own
        // subtitle is the discriminator — 'Dock Layouts:' alone would pass without navigating.
        await expect(content.locator('h1')).toContainText('Adopting in Your App')
    });

});
