import {test, expect} from '@playwright/test';

test.describe('Neo.main.DeltaUpdates (Fragment Insert Batch)', () => {
    test.beforeEach(async ({page}) => {
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        await page.goto('test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport');
    });

    test('Manual Fragment Batch Insert Update (DomApiRenderer)', async ({page}) => {
        // Setup initial DOM state
        await page.evaluate(() => {
            Neo.config.useDomApiRenderer = true; // Ensure DomApiRenderer is used
            const root = document.getElementById('component-test-viewport');
            
            // Fragment Start
            const start = document.createComment(' frag-1-start ');
            root.appendChild(start);
            
            // Fragment End
            const end = document.createComment(' frag-1-end ');
            root.appendChild(end);
        });
        
        // Execute insertNodeBatch (simulated via update)
        // insertNodeBatch is triggered when sequential insertNode deltas are found
        await page.evaluate(async () => {
            await Neo.main.DeltaUpdates.importRenderer(); // Ensure renderer loaded

            Neo.main.DeltaUpdates.update({
                deltas: [{
                    action: 'insertNode',
                    parentId: 'frag-1',
                    index: 0,
                    vnode: {
                        nodeName: 'div',
                        id: 'child-1',
                        attributes: {},
                        className: [],
                        style: {},
                        childNodes: [],
                        innerHTML: 'Child 1'
                    }
                }, {
                    action: 'insertNode',
                    parentId: 'frag-1',
                    index: 1, // Sequential index
                    vnode: {
                        nodeName: 'div',
                        id: 'child-2',
                        attributes: {},
                        className: [],
                        style: {},
                        childNodes: [],
                        innerHTML: 'Child 2'
                    }
                }]
            });
        });

        // Verify children exist and order
        const result = await page.evaluate(() => {
            const item1 = document.getElementById('child-1');
            const item2 = document.getElementById('child-2');
            const start = document.evaluate(`//comment()[contains(., ' frag-1-start ')]`, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            const end = document.evaluate(`//comment()[contains(., ' frag-1-end ')]`, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            
            if (!item1 || !item2) return { exists: false };

            const startBefore1 = (start.compareDocumentPosition(item1) & Node.DOCUMENT_POSITION_FOLLOWING);
            const item1Before2 = (item1.compareDocumentPosition(item2) & Node.DOCUMENT_POSITION_FOLLOWING);
            const item2BeforeEnd = (item2.compareDocumentPosition(end) & Node.DOCUMENT_POSITION_FOLLOWING);
            
            return {
                exists: true,
                order: !!(startBefore1 && item1Before2 && item2BeforeEnd)
            };
        });
        
        expect(result.exists).toBe(true);
        expect(result.order).toBe(true);
    });
});
