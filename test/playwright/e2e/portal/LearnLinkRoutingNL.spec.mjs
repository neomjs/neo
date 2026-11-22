import {expect, test} from '../../fixtures.mjs';

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

const PORTAL           = '/apps/portal/index.html',
      GUIDE            = `${PORTAL}#/learn/guides/uibuildingblocks/DockLayouts`,
      ADOPTION_ROUTE   = '#/learn/guides/uibuildingblocks/DockLayoutsAdoption',
      DECISION_3_ROUTE = `${ADOPTION_ROUTE}#decision-3--policies-live-in-the-model-not-in-your-ui`,
      DECISION_3_TITLE = 'Decision 3 — policies live in the model, not in your UI';

/** The content component's own class, so the assertions cannot drift onto sidebar or chrome links. */
const CONTENT  = '.neo-app-content-component',
      SECTIONS = '.neo-app-content-sections-list';

/** The sidebar tree, whose navigation owes nothing to the rewrite — see the control arm below. */
const TREE = '.neo-app-content-tree-list';

/**
 * @summary Checks that the destination is visible and selected in On this page.
 * @param {import('@playwright/test').Page} page
 */
async function expectDecisionArrival(page) {
    const heading = page.locator(CONTENT).getByRole('heading', {level: 2, name: DECISION_3_TITLE, exact: true});

    await expect(heading).toBeVisible();
    await expect.poll(() => heading.evaluate(node => {
        const article = node.closest('.neo-app-content-page-container').getBoundingClientRect(),
              bounds  = node.getBoundingClientRect();

        return bounds.top >= Math.max(0, article.top) - 1 &&
               bounds.bottom <= Math.min(innerHeight, article.bottom) + 1
    }), {message: 'Decision 3 is fully visible inside the article scroller'}).toBe(true);
    await expect(page.locator(`${SECTIONS} .neo-selected`)).toHaveText(DECISION_3_TITLE)
}

test.describe('learn link routing', () => {
    test('a relative guide link is rendered as a route, not a file path', async ({page}) => {
        await page.goto(GUIDE);

        const content = page.locator(CONTENT);

        // Auto-waits: the record fetch and render are async, and an empty article would make every
        // locator below match nothing and pass vacuously.
        await expect(content.locator('h1')).toContainText('Dock');

        // The corpus authors this as `DockLayoutsAdoption.md`; only the rewrite can turn it into a
        // route. Deleting the hook leaves the raw `.md` href here.
        await expect(content.locator(`a[href="${ADOPTION_ROUTE}"]`).first()).toHaveCount(1)
    });

    test('a fragment-bearing link keeps its anchor on the route', async ({page}) => {
        await page.goto(GUIDE);

        const content = page.locator(CONTENT);
        await expect(content.locator('h1')).toContainText('Dock');

        // Authored as `DockLayoutsAdoption.md#decision-3--...`. The router's `{*itemId}` captures the
        // whole suffix, so the id and the anchor must both survive for the controller to split them.
        await expect(
            content.locator(`a[href="${DECISION_3_ROUTE}"]`).first()
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
     * "does clicking it arrive". Measured: dropping every re-navigation in
     * `MainContainerController#onRouteLearnItem` leaves both href arms green and reddens this arm
     * and the control, each at its destination assertion rather than at setup.
     */
    test('clicking a rewritten link arrives at its destination', async ({page}) => {
        await page.goto(GUIDE);

        const content = page.locator(CONTENT);
        await expect(content.locator('h1')).toContainText('Dock Layouts:');

        await content.locator(`a[href="${ADOPTION_ROUTE}"]`).first().click();

        // The source page is 'Dock Layouts: One Application, Many Windows', so the destination's own
        // subtitle is the discriminator — 'Dock Layouts:' alone would pass without navigating.
        //
        // This arm passes locally in ~800ms and fails on a hosted Ubuntu runner, and the difference
        // is not a timing budget in any range worth waiting — that was tested rather than assumed.
        // The hosted trace shows the click resolving its anchor, `navigations have finished`, the
        // hash arriving at the destination, and the source `h1` still in place afterwards, with no
        // console error and no failed request. Widening this assertion to 30s and running it hosted
        // changed nothing: the arm still failed, at 32.4s.
        //
        // So the route changes and the content has not followed within 30s, while the sibling sidebar
        // arm passes on the same runner. Bounded on purpose: 30s is the longest window measured, so
        // this does not exclude a slower-still arrival — only one inside any window a person would
        // wait through. The default stays, because a longer one buys a slower failure and no more
        // information.
        await expect(content.locator('h1')).toContainText('Adopting in Your App')
    });

    test('clicking a guide link scrolls to its section', async ({page}) => {
        await page.goto(GUIDE);
        await page.locator(`${CONTENT} a[href="${DECISION_3_ROUTE}"]`).click();
        await expectDecisionArrival(page);

        const nextTitle = 'Decision 4 — skin it with tokens, on the right scope',
              next      = page.locator(CONTENT).getByRole('heading', {level: 2, name: nextTitle, exact: true});

        await next.evaluate(node => node.scrollIntoView({behavior: 'instant'}));
        await expect(page.locator(`${SECTIONS} .neo-selected`)).toHaveText(nextTitle)
    });

    test('opening a guide section URL scrolls after loading the article', async ({page}) => {
        await page.goto(`${PORTAL}${DECISION_3_ROUTE}`);
        await expectDecisionArrival(page)
    });

    test('changing the fragment scrolls within the loaded article', async ({page}) => {
        await page.goto(`${PORTAL}${ADOPTION_ROUTE}`);

        const heading = page.locator(CONTENT).getByRole('heading', {level: 2, name: DECISION_3_TITLE, exact: true});

        await expect(heading).toBeVisible();
        await expect(heading).not.toBeInViewport();

        await page.goto(`${PORTAL}${DECISION_3_ROUTE}`);
        await expectDecisionArrival(page)
    });

    test('clicking an On this page entry keeps the heading in view as earlier content expands', async ({page}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await page.goto(`${PORTAL}${ADOPTION_ROUTE}`);

        const heading = page.locator(CONTENT).getByRole('heading', {level: 2, name: DECISION_3_TITLE, exact: true});

        await heading.evaluate(node => {
            const article  = node.closest('.neo-app-content-component'),
                  scroller = node.closest('.neo-app-content-page-container'),
                  spacer   = document.createElement('div');

            spacer.dataset.lateContent = 'pending';
            article.prepend(spacer);

            // Model a diagram above the target expanding as soon as the article starts to scroll.
            scroller.addEventListener('scroll', () => {
                spacer.style.blockSize   = '1200px';
                spacer.dataset.lateContent = 'expanded'
            }, {once: true})
        });

        await page.locator(SECTIONS).getByText(DECISION_3_TITLE, {exact: true}).click();
        await expect(page.locator(`${CONTENT} [data-late-content]`)).toHaveAttribute('data-late-content', 'expanded');
        await expectDecisionArrival(page)
    });

    test('opening an unknown section keeps the start of the article visible', async ({page}) => {
        await page.goto(`${PORTAL}${ADOPTION_ROUTE}#unknown-section`);
        await expect(page.locator(`${CONTENT} h1`, {hasText: 'Adopting in Your App'})).toBeInViewport()
    });

});
