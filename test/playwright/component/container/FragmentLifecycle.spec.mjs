import {test, expect} from '@playwright/test';

let rootId;

test.describe('Neo.container.Fragment Lifecycle (Moves & Nesting)', () => {
    test.beforeEach(async ({page}) => {
        // Use absolute path from server root (baseURL is http://localhost:8080)
        await page.goto('test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport');
        
        // Preload classes
        await page.evaluate(async () => {
            await Neo.worker.App.loadModule({path: '../button/Base.mjs'});
            await Neo.worker.App.loadModule({path: '../container/Base.mjs'});
            await Neo.worker.App.loadModule({path: '../container/Fragment.mjs'});
        });
    });

    test.afterEach(async ({page}) => {
        if (rootId) {
            await page.evaluate((id) => Neo.worker.App.destroyNeoInstance(id), rootId);
            rootId = null;
        }
    });

    test('Move In: Move a component from Container into a child Fragment', async ({page}) => {
        const config = {
            importPath: '../container/Base.mjs',
            ntype     : 'container',
            parentId  : 'component-test-viewport',
            layout    : 'vbox',
            items: [
                {ntype: 'button', id: 'mover', text: 'Mover'},
                {ntype: 'fragment', id: 'frag-target', items: [
                    {ntype: 'button', id: 'static', text: 'Static'}
                ]}
            ]
        };

        const result = await page.evaluate(config => Neo.worker.App.createNeoInstance(config), config);
        rootId = result.id;

        await expect(page.locator('#mover')).toBeVisible();
        await expect(page.locator('#static')).toBeVisible();

        // Wait for comments to appear
        await page.waitForFunction(() => {
            return document.evaluate(`//comment()[contains(., ' frag-target-start ')]`, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        });

        // Initial check: Mover is before Fragment start anchor
        let isBefore = await page.evaluate(() => {
            const mover = document.getElementById('mover');
            const startComment = document.evaluate(`//comment()[contains(., ' frag-target-start ')]`, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            return mover.compareDocumentPosition(startComment) & Node.DOCUMENT_POSITION_FOLLOWING;
        });
        expect(isBefore).toBeTruthy();

        // Move 'mover' into 'frag-target' at index 1 (after 'static')
        await page.evaluate(async () => {
            await Neo.worker.App.moveComponent({
                id      : 'mover',
                parentId: 'frag-target',
                index   : 1
            });
        });

        // Wait for move to settle (mover should be after start comment)
        await page.waitForFunction(() => {
            const mover = document.getElementById('mover');
            const startComment = document.evaluate(`//comment()[contains(., ' frag-target-start ')]`, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            return mover && startComment && (startComment.compareDocumentPosition(mover) & Node.DOCUMENT_POSITION_FOLLOWING);
        });

        // Verify Mover is now AFTER 'static' and INSIDE fragment anchors
        const positionState = await page.evaluate(() => {
            const mover = document.getElementById('mover');
            const startComment = document.evaluate(`//comment()[contains(., ' frag-target-start ')]`, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            const endComment = document.evaluate(`//comment()[contains(., ' frag-target-end ')]`, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            
            if (!mover || !startComment || !endComment) return {afterStart: false, beforeEnd: false};

            const afterStart = (startComment.compareDocumentPosition(mover) & Node.DOCUMENT_POSITION_FOLLOWING);
            const beforeEnd = (mover.compareDocumentPosition(endComment) & Node.DOCUMENT_POSITION_FOLLOWING);
            
            return {afterStart, beforeEnd};
        });

        expect(positionState.afterStart).toBeTruthy();
        expect(positionState.beforeEnd).toBeTruthy();
    });

    test('Move Out: Move a component from Fragment into parent Container', async ({page}) => {
        const config = {
            importPath: '../container/Base.mjs',
            ntype     : 'container',
            parentId  : 'component-test-viewport',
            layout    : 'vbox',
            items: [
                {ntype: 'fragment', id: 'frag-source', items: [
                    {ntype: 'button', id: 'mover', text: 'Mover'}
                ]}
            ]
        };

        const result = await page.evaluate(config => Neo.worker.App.createNeoInstance(config), config);
        rootId = result.id;

        // Wait for comments
        await page.waitForFunction(() => {
             return document.evaluate(`//comment()[contains(., ' frag-source-end ')]`, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        });

        // Move 'mover' out of 'frag-source' into root container
        await page.evaluate(async (rootId) => {
            await Neo.worker.App.moveComponent({
                id      : 'mover',
                parentId: rootId
            });
        }, rootId);

        // Wait for move
        await page.waitForFunction(() => {
            const mover = document.getElementById('mover');
            const endComment = document.evaluate(`//comment()[contains(., ' frag-source-end ')]`, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            
            if (!mover || !endComment) return false;
            
            const isFollowing = (endComment.compareDocumentPosition(mover) & Node.DOCUMENT_POSITION_FOLLOWING);
            return isFollowing;
        });

        // Verify Mover is AFTER fragment end anchor
        const isAfterEnd = await page.evaluate(() => {
            const mover = document.getElementById('mover');
            const endComment = document.evaluate(`//comment()[contains(., ' frag-source-end ')]`, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            if (!mover || !endComment) return false;
            return endComment.compareDocumentPosition(mover) & Node.DOCUMENT_POSITION_FOLLOWING;
        });

        expect(isAfterEnd).toBeTruthy();
    });

    test('Cross-Fragment Move: Move component between sibling fragments', async ({page}) => {
        const config = {
            importPath: '../container/Base.mjs',
            ntype     : 'container',
            parentId  : 'component-test-viewport',
            layout    : 'vbox',
            items: [
                {ntype: 'fragment', id: 'frag-a', items: [
                    {ntype: 'button', id: 'mover', text: 'Mover'}
                ]},
                {ntype: 'fragment', id: 'frag-b', items: []}
            ]
        };

        const result = await page.evaluate(config => Neo.worker.App.createNeoInstance(config), config);
        rootId = result.id;

        // Wait for comments
        await page.waitForFunction(() => {
            return document.evaluate(`//comment()[contains(., ' frag-b-start ')]`, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        });

        // Move 'mover' from A to B
        await page.evaluate(async () => {
            await Neo.worker.App.moveComponent({
                id      : 'mover',
                parentId: 'frag-b'
            });
        });

        // Wait for move (inside B)
        await page.waitForFunction(() => {
            const mover = document.getElementById('mover');
            const startB = document.evaluate(`//comment()[contains(., ' frag-b-start ')]`, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            return mover && startB && (startB.compareDocumentPosition(mover) & Node.DOCUMENT_POSITION_FOLLOWING);
        });

        // Verify Mover is inside Frag B anchors
        const inFragB = await page.evaluate(() => {
            const mover = document.getElementById('mover');
            const startB = document.evaluate(`//comment()[contains(., ' frag-b-start ')]`, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            const endB = document.evaluate(`//comment()[contains(., ' frag-b-end ')]`, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            
            if (!mover || !startB || !endB) return false;

            return (startB.compareDocumentPosition(mover) & Node.DOCUMENT_POSITION_FOLLOWING) &&
                   (mover.compareDocumentPosition(endB) & Node.DOCUMENT_POSITION_FOLLOWING);
        });

        expect(inFragB).toBeTruthy();
    });

    test('Nested Move: Move component deeper into nested fragment', async ({page}) => {
        const config = {
            importPath: '../container/Base.mjs',
            ntype     : 'container',
            parentId  : 'component-test-viewport',
            layout    : 'vbox',
            items: [
                {ntype: 'fragment', id: 'frag-outer', items: [
                    {ntype: 'button', id: 'mover', text: 'Mover'},
                    {ntype: 'fragment', id: 'frag-inner', items: []}
                ]}
            ]
        };

        const result = await page.evaluate(config => Neo.worker.App.createNeoInstance(config), config);
        rootId = result.id;

        // Wait for comments
        await page.waitForFunction(() => {
            return document.evaluate(`//comment()[contains(., ' frag-inner-start ')]`, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        });

        // Move 'mover' from outer to inner
        await page.evaluate(async () => {
            await Neo.worker.App.moveComponent({
                id      : 'mover',
                parentId: 'frag-inner'
            });
        });

         // Wait for move (inside Inner)
        await page.waitForFunction(() => {
            const mover = document.getElementById('mover');
            const startInner = document.evaluate(`//comment()[contains(., ' frag-inner-start ')]`, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            return mover && startInner && (startInner.compareDocumentPosition(mover) & Node.DOCUMENT_POSITION_FOLLOWING);
        });

        // Verify Mover is inside Frag Inner anchors
        const inFragInner = await page.evaluate(() => {
            const mover = document.getElementById('mover');
            const startInner = document.evaluate(`//comment()[contains(., ' frag-inner-start ')]`, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            const endInner = document.evaluate(`//comment()[contains(., ' frag-inner-end ')]`, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            
            if (!mover || !startInner || !endInner) return false;

            return (startInner.compareDocumentPosition(mover) & Node.DOCUMENT_POSITION_FOLLOWING) &&
                   (mover.compareDocumentPosition(endInner) & Node.DOCUMENT_POSITION_FOLLOWING);
        });

        expect(inFragInner).toBeTruthy();
    });
});