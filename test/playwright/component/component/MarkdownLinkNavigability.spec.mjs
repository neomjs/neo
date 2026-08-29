import {test, expect}                             from '@playwright/test';
import {classifyHref, LinkKind, loadLearnItemIds} from '../../util/learnLinkNavigability.mjs';

/**
 * A learn link is navigable only if the portal's router can reach it.
 *
 * A unit-tier guard can prove a link target exists in the git index. It cannot prove the rendered
 * anchor carries a form the SPA router accepts, because the unit tier runs in Node with no DOM and
 * no renderer. That gap shipped three unreachable links: they resolved on disk, so a filesystem
 * check reported them healthy while the portal returned 404.
 *
 * This arm closes it by asserting on hrefs the REAL renderer produced in a REAL browser. The
 * classification authority is `learn/tree.json` — the same manifest `MainContainerController`
 * loads — so the test and the app cannot disagree about what a reachable link is.
 */

const ITEM_IDS = loadLearnItemIds();

// A real id, taken from the manifest rather than typed, so the positive arm cannot rot into a
// tautology if the corpus is restructured.
const LIVE_ID = [...ITEM_IDS].find(id => id.includes('/')) ?? [...ITEM_IDS][0];

const FIXTURE = [
    `[slash route](#/learn/${LIVE_ID})`,
    `[dotted route](#/learn/${LIVE_ID.replaceAll('/', '.')})`,
    `[bare dotted token](${LIVE_ID.replaceAll('/', '.')})`,
    '[relative path](../benefits/ArchitectureOverview.md)',
    '[in-page](#some-heading)',
    '[external](https://github.com/neomjs/neo)'
].join('\n\n');

let componentId;

test.beforeEach(async ({page}) => {
    await page.goto('test/playwright/component/apps/empty-viewport/index.html');
    await page.waitForSelector('#component-test-viewport', {state: 'attached'});

    componentId = await page.evaluate(async ({value}) => {
        const result = await Neo.worker.App.createNeoInstance({
            importPath: '../component/Markdown.mjs',
            ntype     : 'markdown',
            parentId  : 'component-test-viewport',
            value
        });

        if (!result.success) {
            throw new Error(`Component creation failed: ${result.error.message}`)
        }

        return result.id
    }, {value: FIXTURE});

    // `afterSetValue` is async — it renders, then `await me.set({html})`. Reading the DOM straight
    // after `createNeoInstance` resolves races that, and an empty result would read as "no links".
    await page.waitForSelector(`#${componentId} a`, {state: 'attached'})
});

test.afterEach(async ({page}) => {
    if (componentId) {
        await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), componentId);
        componentId = null
    }
});

/**
 * Reads the anchors the renderer actually emitted, keyed by their link text.
 * @param {Object} page
 * @returns {Promise<Object>} link text -> raw href attribute
 */
const renderedHrefs = async page => page.evaluate(id => {
    const out = {};

    document.querySelectorAll(`#${id} a`).forEach(anchor => {
        out[anchor.textContent.trim()] = anchor.getAttribute('href')
    });

    return out
}, componentId);

test.describe('learn link navigability', () => {
    test('the renderer emits anchors for every link form', async ({page}) => {
        const hrefs = await renderedHrefs(page);

        // Control: if the fixture stops rendering, every assertion below would pass vacuously.
        expect(Object.keys(hrefs).length).toBe(6)
    });

    test('a slash-id route is navigable — the positive control', async ({page}) => {
        const hrefs = await renderedHrefs(page);

        expect(classifyHref(hrefs['slash route'], ITEM_IDS).kind).toBe(LinkKind.ROUTE_HIT)
    });

    test('a dotted-id route is NOT navigable — store.get is an exact lookup', async ({page}) => {
        const hrefs = await renderedHrefs(page);

        // Deliberately inverted: this pins the ABSENCE of dotted-id support. `getContentPath`'s
        // `replaceAll('.', '/')` is a no-op on every current id and reads like support for both
        // forms. If dotted ids ever become resolvable, this test must fail so the contract is
        // updated on purpose rather than by a silent green.
        expect(classifyHref(hrefs['dotted route'], ITEM_IDS).kind).toBe(LinkKind.ROUTE_MISS)
    });

    test('a bare dotted token is not a route at all', async ({page}) => {
        const hrefs = await renderedHrefs(page);

        // The exact defect: rendered verbatim, it resolves against the document URL to
        // /apps/portal/<token> and 404s. No leading '#/learn/' means the router never sees it.
        expect(hrefs['bare dotted token']).not.toContain('#/learn/');
        expect(classifyHref(hrefs['bare dotted token'], ITEM_IDS).kind).toBe(LinkKind.UNROUTED)
    });

    test('a relative .md path is not navigable in the SPA', async ({page}) => {
        const hrefs = await renderedHrefs(page);

        expect(classifyHref(hrefs['relative path'], ITEM_IDS).kind).toBe(LinkKind.UNROUTED)
    });

    test('in-page anchors and external URLs stay navigable', async ({page}) => {
        const hrefs = await renderedHrefs(page);

        expect(classifyHref(hrefs['in-page'], ITEM_IDS).kind).toBe(LinkKind.IN_PAGE);
        expect(classifyHref(hrefs['external'], ITEM_IDS).kind).toBe(LinkKind.EXTERNAL)
    });

    test('an unrouted href really does leave the app — resolved, not assumed', async ({page}) => {
        const hrefs = await renderedHrefs(page);

        const resolved = await page.evaluate(
            href => new URL(href, location.href).href,
            hrefs['bare dotted token']
        );

        // The classification above is a rule; this is the browser agreeing with it.
        expect(resolved).not.toContain('#/learn/');
        expect(resolved).toContain(LIVE_ID.replaceAll('/', '.'))
    })
});
