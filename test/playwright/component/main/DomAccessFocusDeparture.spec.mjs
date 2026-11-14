import {test, expect} from '@playwright/test';

/**
 * @summary `Neo.main.DomAccess#focus()` with `restoreFrom` hands focus back only to a lost focus, whatever order the
 * departure's DOM removals arrive in.
 *
 * A departing component can hold focus in a floating descendant that the DOM places outside its own node: a picker
 * on the document body, a submenu beside its menu. Its removal can come before the owner's or after it. Every arm
 * plays one order on a real DOM, with no worker involved, and reads where focus ended up.
 */
test.describe('Neo.main.DomAccess: focus handed back from a departure', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'});

        await page.evaluate(() => {
            document.body.insertAdjacentHTML('beforeend', [
                '<button id="fd-target">target</button>',
                '<div id="fd-departing"><input id="fd-inner"></div>',
                '<div id="fd-floating"><button id="fd-floating-item">item</button></div>',
                '<button id="fd-other">other</button>'
            ].join(''))
        })
    });

    /**
     * Focuses `holder`, starts the hand-back, removes the ids in `removals` in order, a frame apart, and resolves the
     * id of the element holding focus once the hand-back settled.
     */
    const depart = (page, holder, removals, moveTo) => page.evaluate(async ({holder, moveTo, removals}) => {
        const frame = () => new Promise(resolve => setTimeout(resolve, 30));

        document.getElementById(holder).focus();

        const handBack = Neo.main.DomAccess.focus({id: 'fd-target', restoreFrom: 'fd-departing'});

        moveTo && document.getElementById(moveTo).focus();

        for (const id of removals) {
            await frame();
            document.getElementById(id).remove()
        }

        await handBack;

        return document.activeElement === document.body ? 'body' : document.activeElement.id
    }, {holder, moveTo, removals});

    test('a focus inside the departing element is handed back', async ({page}) => {
        expect(await depart(page, 'fd-inner', ['fd-departing'])).toBe('fd-target')
    });

    test('a floating descendant that departs after its owner hands focus back too', async ({page}) => {
        expect(await depart(page, 'fd-floating-item', ['fd-departing', 'fd-floating'])).toBe('fd-target')
    });

    test('a floating descendant that departs before its owner hands focus back', async ({page}) => {
        expect(await depart(page, 'fd-floating-item', ['fd-floating', 'fd-departing'])).toBe('fd-target')
    });

    test('a focus the user moved on keeps its place', async ({page}) => {
        expect(await depart(page, 'fd-inner', ['fd-departing'], 'fd-other')).toBe('fd-other')
    })
});
