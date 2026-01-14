import {test, expect} from '@playwright/test';

test.describe('Neo.main.DeltaUpdates (Fragment Support)', () => {
    test.beforeEach(async ({page}) => {
        //page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        await page.goto('test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport');
    });

    test('Manual Fragment Move Update', async ({page}) => {
        await page.evaluate(() => {
            const root = document.getElementById('component-test-viewport');
            
            // Fragment Start
            const start = document.createComment(' frag-1-start ');
            root.appendChild(start);
            
            // Fragment Item 1
            const item1 = document.createElement('div');
            item1.id = 'child-1';
            item1.textContent = 'Child 1';
            root.appendChild(item1);
            
            // Fragment End
            const end = document.createComment(' frag-1-end ');
            root.appendChild(end);
            
            // Mover (outside fragment)
            const mover = document.createElement('div');
            mover.id = 'mover';
            mover.textContent = 'Mover';
            root.appendChild(mover);
        });
        
        await page.evaluate(() => {
            Neo.main.DeltaUpdates.update({
                deltas: [{
                    action: 'moveNode',
                    id: 'mover',
                    parentId: 'frag-1',
                    index: 1
                }]
            });
        });

        const result = await page.evaluate(() => {
            const mover = document.getElementById('mover');
            const item1 = document.getElementById('child-1');
            const end = document.evaluate(`//comment()[contains(., ' frag-1-end ')]`, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            
            const isAfterItem1 = (item1.compareDocumentPosition(mover) & Node.DOCUMENT_POSITION_FOLLOWING);
            const isBeforeEnd = (mover.compareDocumentPosition(end) & Node.DOCUMENT_POSITION_FOLLOWING); 
            
            return {
                isAfterItem1: !!isAfterItem1,
                isBeforeEnd: !!isBeforeEnd
            };
        });
        
        expect(result.isAfterItem1).toBe(true);
        expect(result.isBeforeEnd).toBe(true);
    });

    test('Manual Fragment Insert Update (StringBasedRenderer)', async ({page}) => {
        await page.evaluate(async () => {
            Neo.config.useDomApiRenderer = false;
            await Neo.main.DeltaUpdates.importRenderer();
            
            const root = document.getElementById('component-test-viewport');
            root.innerHTML = ''; // Clear previous test artifacts
            
            const start = document.createComment(' frag-1-start ');
            root.appendChild(start);
            
            const item1 = document.createElement('div');
            item1.id = 'child-1';
            item1.textContent = 'Child 1';
            root.appendChild(item1);
            
            const end = document.createComment(' frag-1-end ');
            root.appendChild(end);
        });
        
        await page.evaluate(() => {
            Neo.main.DeltaUpdates.update({
                deltas: [{
                    action: 'insertNode',
                    parentId: 'frag-1',
                    index: 1,
                    outerHTML: '<div id="child-2">Child 2</div>'
                }]
            });
        });

        const result = await page.evaluate(() => {
            const item1 = document.getElementById('child-1');
            const item2 = document.getElementById('child-2');
            const end = document.evaluate(`//comment()[contains(., ' frag-1-end ')]`, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            
            if (!item2) return { exists: false };

            const isAfterItem1 = (item1.compareDocumentPosition(item2) & Node.DOCUMENT_POSITION_FOLLOWING);
            const isBeforeEnd = (item2.compareDocumentPosition(end) & Node.DOCUMENT_POSITION_FOLLOWING);
            
            return {
                exists: true,
                isAfterItem1: !!isAfterItem1,
                isBeforeEnd: !!isBeforeEnd
            };
        });
        
        expect(result.exists).toBe(true);
        expect(result.isAfterItem1).toBe(true);
        expect(result.isBeforeEnd).toBe(true);
    });

    test('Manual Fragment Batch Insert Update (DomApiRenderer)', async ({page}) => {
        await page.evaluate(async () => {
            Neo.config.useDomApiRenderer = true; 
            await Neo.main.DeltaUpdates.importRenderer();

            const root = document.getElementById('component-test-viewport');
            root.innerHTML = '';
            
            const start = document.createComment(' frag-1-start ');
            root.appendChild(start);
            
            const end = document.createComment(' frag-1-end ');
            root.appendChild(end);
        });
        
        await page.evaluate(async () => {
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
                    index: 1,
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

    test('Manual Fragment Batch Insert Update (StringBasedRenderer)', async ({page}) => {
        await page.evaluate(async () => {
            Neo.config.useDomApiRenderer = false; 
            await Neo.main.DeltaUpdates.importRenderer();

            const root = document.getElementById('component-test-viewport');
            root.innerHTML = '';
            
            const start = document.createComment(' frag-sb-start ');
            root.appendChild(start);
            
            const end = document.createComment(' frag-sb-end ');
            root.appendChild(end);
        });
        
        await page.evaluate(async () => {
            Neo.main.DeltaUpdates.update({
                deltas: [{
                    action: 'insertNode',
                    parentId: 'frag-sb',
                    index: 0,
                    outerHTML: '<div id="child-sb-1">Child SB 1</div>'
                }, {
                    action: 'insertNode',
                    parentId: 'frag-sb',
                    index: 1,
                    outerHTML: '<div id="child-sb-2">Child SB 2</div>'
                }]
            });
        });

        const result = await page.evaluate(() => {
            const item1 = document.getElementById('child-sb-1');
            const item2 = document.getElementById('child-sb-2');
            const start = document.evaluate(`//comment()[contains(., ' frag-sb-start ')]`, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            const end = document.evaluate(`//comment()[contains(., ' frag-sb-end ')]`, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            
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

    test('Standard DOM Forward Move (Same Parent)', async ({page}) => {
        await page.evaluate(() => {
            const root = document.getElementById('component-test-viewport');
            root.innerHTML = '';
            
            const a = document.createElement('div'); a.id = 'A'; a.textContent = 'A';
            const b = document.createElement('div'); b.id = 'B'; b.textContent = 'B';
            const c = document.createElement('div'); c.id = 'C'; c.textContent = 'C';
            
            root.appendChild(a);
            root.appendChild(b);
            root.appendChild(c);
            // Current: [A, B, C]
        });
        
        // Move A to index 2 (Target: [B, C, A])
        await page.evaluate(() => {
            Neo.main.DeltaUpdates.update({
                deltas: [{
                    action: 'moveNode',
                    id: 'A',
                    parentId: 'component-test-viewport',
                    index: 2
                }]
            });
        });

        const order = await page.evaluate(() => {
            const root = document.getElementById('component-test-viewport');
            return Array.from(root.children).map(el => el.id);
        });
        
        expect(order).toEqual(['B', 'C', 'A']);
    });

    test('DomApiRenderer Insert with Scroll State', async ({page}) => {
        await page.evaluate(async () => {
            Neo.config.useDomApiRenderer = true;
            await Neo.main.DeltaUpdates.importRenderer();

            const root = document.getElementById('component-test-viewport');
            root.innerHTML = '';
        });

        await page.evaluate(() => {
            Neo.main.DeltaUpdates.update({
                deltas: [{
                    action: 'insertNode',
                    parentId: 'component-test-viewport',
                    index: 0,
                    vnode: {
                        nodeName: 'div',
                        id: 'scroll-div',
                        style: {
                            height: '100px',
                            overflow: 'auto'
                        },
                        scrollTop: 50,
                        childNodes: [{
                            nodeName: 'div',
                            style: {height: '1000px'},
                            childNodes: [],
                            attributes: {},
                            className: []
                        }],
                        attributes: {},
                        className: []
                    }
                }]
            });
        });

        const scrollTop = await page.evaluate(() => {
            return document.getElementById('scroll-div').scrollTop;
        });

        expect(scrollTop).toBe(50);
    });

    test('StringBasedRenderer Insert with Scroll State', async ({page}) => {
        await page.evaluate(async () => {
            Neo.config.useDomApiRenderer = false;
            await Neo.main.DeltaUpdates.importRenderer();

            const root = document.getElementById('component-test-viewport');
            root.innerHTML = '';
        });

        await page.evaluate(() => {
            Neo.main.DeltaUpdates.update({
                deltas: [{
                    action: 'insertNode',
                    parentId: 'component-test-viewport',
                    index: 0,
                    outerHTML: '<div id="scroll-div-string" style="height:100px;overflow:auto;"><div style="height:1000px;"></div></div>',
                    postMountUpdates: [{
                        id: 'scroll-div-string',
                        scrollTop: 75
                    }]
                }]
            });
        });

        const scrollTop = await page.evaluate(() => {
            return document.getElementById('scroll-div-string').scrollTop;
        });

        expect(scrollTop).toBe(75);
    });
});
