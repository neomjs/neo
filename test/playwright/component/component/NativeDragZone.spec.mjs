import {test, expect} from '@playwright/test';

let componentId;

/**
 * The browser witness for `nativeDragZone`: a real component, mounted through the full worker
 * stack, whose declaration reaches the real NativeDragSource addon over the remote pipeline —
 * every interaction below enters through REAL document listeners, never a direct method call.
 */
test.describe('Neo.component.Base#nativeDragZone (browser)', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'});
    });

    test.afterEach(async ({page}) => {
        if (componentId) {
            await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), componentId);
            componentId = null
        }
    });

    test('a REAL browser drag carries the declared payload into a drop target, effectAllowed included', async ({page}) => {
        componentId = await page.evaluate(() => Neo.worker.App.createNeoInstance({
            ntype   : 'component',
            appName : 'ComponentTestApp',
            parentId: 'component-test-viewport',
            html    : '<span class="entity" data-record-id="cid-7" style="display:inline-block;padding:20px">row 7</span>' +
                            '<div class="drop-zone" style="display:inline-block;width:120px;height:60px;border:1px solid"></div>',
            nativeDragZone: {
                delegate     : '.entity',
                effectAllowed: 'copy',
                types        : {
                    'application/x-entity-id': '{data-record-id}',
                    'text/plain'             : 'entity:{data-record-id}'
                }
            }
        }));

        await page.waitForSelector('.entity', {state: 'attached'});

        // a real drop target observing the LIVE drag data store — no constructed events anywhere
        await page.evaluate(() => {
            const witness = globalThis.__dragWitness = {};

            document.querySelector('.drop-zone').addEventListener('dragover', event => {
                event.preventDefault();
                witness.effectAllowed = event.dataTransfer.effectAllowed;
                // the browser orders the types list by its own rules, not by insertion
                witness.types         = [...event.dataTransfer.types].sort();
                witness.shieldStamped = document.body.classList.contains('neo-drag-active')
            });

            document.querySelector('.drop-zone').addEventListener('drop', event => {
                event.preventDefault();
                witness.entityId = event.dataTransfer.getData('application/x-entity-id');
                witness.plain    = event.dataTransfer.getData('text/plain')
            })
        });

        await page.dragAndDrop('.entity', '.drop-zone');

        const verdict = await page.evaluate(() => ({
            ...globalThis.__dragWitness,
            restored: !document.querySelector('.entity').hasAttribute('draggable')
        }));

        expect(verdict).toEqual({
            effectAllowed: 'copy',
            types        : ['application/x-entity-id', 'text/plain'],
            shieldStamped: false,
            entityId     : 'cid-7',
            plain        : 'entity:cid-7',
            restored     : true
        })
    });

    test('declared types fill from the real drag store; the sensor stays out; terminal restores the DOM', async ({page}) => {
        componentId = await page.evaluate(() => Neo.worker.App.createNeoInstance({
            ntype         : 'component',
            appName       : 'ComponentTestApp',
            parentId      : 'component-test-viewport',
            html          : '<span class="entity" data-record-id="cid-7">row 7</span>',
            nativeDragZone: {
                delegate     : '.entity',
                effectAllowed: 'copy',
                types        : {
                    'application/x-entity-id': '{data-record-id}',
                    'text/plain'             : 'entity:{data-record-id}'
                }
            }
        }));

        await page.waitForSelector('.entity', {state: 'attached'});

        const verdict = await page.evaluate(() => {
            const node = document.querySelector('.entity');

            const armedBefore = node.draggable;

            // the physical gesture, through the document's own capture listeners
            node.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, button: 0}));

            const armed = node.draggable;

            /*
                `effectAllowed` is deliberately NOT asserted here: Chromium accepts the write only
                inside a REAL user-initiated drag's read/write drag data store — on a constructed
                DataTransfer it reads back 'none' whenever it is observed, even mid-dispatch. The
                addon's write is proven at the unit layer against the drag-store seam; this witness
                covers everything a synthetic native drag can truthfully reach.
            */
            const dataTransfer = new DataTransfer();

            node.dispatchEvent(new DragEvent('dragstart', {bubbles: true, dataTransfer}));

            const
                entityId      = dataTransfer.getData('application/x-entity-id'),
                plain         = dataTransfer.getData('text/plain'),
                shieldStamped = document.body.classList.contains('neo-drag-active');

            node.dispatchEvent(new DragEvent('dragend', {bubbles: true}));

            return {
                armedBefore,
                armed,
                entityId,
                plain,
                shieldStamped,
                restored: !node.draggable && !node.hasAttribute('draggable')
            }
        });

        expect(verdict).toEqual({
            armedBefore  : false,
            armed        : true,
            entityId     : 'cid-7',
            plain        : 'entity:cid-7',
            shieldStamped: false,
            restored     : true
        })
    });
});
