import {test, expect} from '@playwright/test';

/**
 * @summary `Neo.main.DeltaUpdates#moveNode` moves a fragment, which has no element of its own, as its whole
 * comment-anchored range. Where the browser has `moveBefore()`, the range moves node by node: that API takes no
 * `DocumentFragment`.
 */
test.describe('Neo.main.DeltaUpdates moves a fragment as one range', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'})
    });

    test('the whole range moves to the front of its parent, its comments with it', async ({page}) => {
        const errors = [];

        page.on('console', msg => msg.type() === 'error' && errors.push(msg.text()));

        await page.evaluate(() => {
            const root = document.getElementById('component-test-viewport'),
                  add  = node => root.appendChild(node),
                  div  = id => Object.assign(document.createElement('div'), {id});

            add(div('first'));
            add(document.createComment(' frag-2-start '));
            add(div('frag-child-a'));
            add(div('frag-child-b'));
            add(document.createComment(' frag-2-end '));
            add(div('last'))
        });

        // The fragment has no element of its own: the move resolves it by its comments
        await page.evaluate(() => {
            Neo.main.DeltaUpdates.update({
                deltas: [{action: 'moveNode', id: 'frag-2', parentId: 'component-test-viewport', index: 0}]
            })
        });

        const order = await page.evaluate(() => [...document.getElementById('component-test-viewport').childNodes]
            .map(node => node.nodeType === Node.COMMENT_NODE ? node.textContent.trim() : node.id)
            .filter(name => ['first', 'frag-2-start', 'frag-child-a', 'frag-child-b', 'frag-2-end', 'last'].includes(name)));

        expect(order).toEqual(['frag-2-start', 'frag-child-a', 'frag-child-b', 'frag-2-end', 'first', 'last']);
        expect(errors).toEqual([])
    })
});
