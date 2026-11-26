import {test, expect} from '@playwright/test';

/**
 * @file test/playwright/component/list/NavigatorEventSource.spec.mjs
 * @summary A list whose navigator reads keys from another element subscribes only while that element is in the DOM.
 *
 * A picker list mounts on the document body, apart from the field input it takes keys from, so the list can mount
 * while the input is gone. `Neo.main.addon.Navigator#subscribe` must then neither subscribe nor throw, and the
 * list's later unmount must not throw either.
 */
const MISSING = 'navigator-event-source-missing',
      SOURCE  = 'component-test-viewport';

/**
 * @summary Creates a list in the component viewport whose navigator takes keys from `eventSource`, and waits for its
 * items.
 * @param {Object} page
 * @param {String} id
 * @param {String} eventSource
 */
async function createList(page, id, eventSource) {
    const result = await page.evaluate(([id, eventSource, parentId]) => Neo.worker.App.createNeoInstance({
        id, importPath: '../list/Base.mjs', ntype: 'list', parentId, height: 100, width: 200,
        navigator: {eventSource},
        store    : {
            ntype: 'store', keyProperty: 'id',
            model: {fields: [{name: 'id', type: 'String'}, {name: 'name', type: 'String'}]},
            data : [{id: 'a', name: 'Alpha'}, {id: 'b', name: 'Beta'}]
        }
    }), [id, eventSource, SOURCE]);

    expect(result.success).toBe(true);
    await expect(page.locator(`#${id} .neo-list-item`)).toHaveCount(2)
}

const hasNavigator = (page, id) => page.evaluate(id => document.getElementById(id)?.$navigator !== undefined, id);

test.beforeEach(async ({page}) => {
    await page.goto('test/playwright/component/apps/empty-viewport/index.html');
    await page.waitForSelector(`#${SOURCE}`);
});

test('a key handled by a nested navigator moves only the inner focus', async ({page}) => {
    await page.evaluate(() => {
        const outer = document.createElement('div');
        outer.id = 'outer-toolbar';
        outer.innerHTML = '<button>Outer</button><div id="inner-toolbar"><button>One</button><button>Two</button></div>';
        document.body.appendChild(outer);
        for (const id of ['outer-toolbar', 'inner-toolbar']) {
            Neo.main.addon.Navigator.subscribe({id, selector: '#' + id + ' > button', nextKey: 'ArrowRight', previousKey: 'ArrowLeft', wrap: true})
        }
    });

    await page.getByRole('button', {name: 'Outer', exact: true}).focus();
    await page.getByRole('button', {name: 'One', exact: true}).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('button', {name: 'Two', exact: true})).toBeFocused();
    await page.evaluate(() => {
        for (const id of ['inner-toolbar', 'outer-toolbar']) Neo.main.addon.Navigator.unsubscribe({id});
        document.getElementById('outer-toolbar').remove()
    })
});

test('a list whose eventSource is not in the DOM neither subscribes nor throws, mounting or unmounting', async ({page}) => {
    const errors = [];

    page.on('pageerror', error => errors.push(error.message));

    await createList(page, 'navigator-orphan-list', MISSING);
    // Main runs App-worker calls in order, so once the control's subscription lands, the orphan's has run
    await createList(page, 'navigator-control-list', SOURCE);
    await expect.poll(() => hasNavigator(page, 'navigator-control-list'), 'the control subscribes').toBe(true);

    expect(errors, 'mounting threw nothing').toEqual([]);
    expect(await hasNavigator(page, 'navigator-orphan-list'), 'no half-subscription').toBe(false);

    // Hiding unmounts the orphan, so it unsubscribes; a later control's subscription lands after that
    await page.evaluate(() => Neo.worker.App.setConfigs({id: 'navigator-orphan-list', hidden: true}));
    await createList(page, 'navigator-second-control-list', SOURCE);
    await expect.poll(() => hasNavigator(page, 'navigator-second-control-list'), 'the second control subscribes').toBe(true);

    expect(errors, 'unmounting threw nothing').toEqual([])
});

test('clickSelector routes Enter on a focused item to the matching descendant while leaving nested anchor Enter untouched (#22223)', async ({page}) => {
    const counts = await page.evaluate(() => {
        const host = document.createElement('ul');
        host.id = 'navigator-click-selector-host';
        host.innerHTML = [
            '<li id="nav-card-1" class="nav-card" tabindex="-1">',
            '  <a id="nav-primary-1" class="nav-primary" href="#primary">Primary</a>',
            '  <a id="nav-secondary-1" class="nav-secondary" href="#secondary">Secondary</a>',
            '</li>',
            '<li id="nav-card-2" class="nav-card" tabindex="-1">',
            '  <span>No matching link</span>',
            '</li>'
        ].join('');
        document.body.appendChild(host);

        const hits = {card1: 0, card2: 0, primary: 0, secondary: 0};
        document.getElementById('nav-card-1').addEventListener('click', e => {
            if (e.target.id === 'nav-card-1') hits.card1++
        });
        document.getElementById('nav-card-2').addEventListener('click', () => hits.card2++);
        document.getElementById('nav-primary-1').addEventListener('click', e => {
            e.preventDefault();
            hits.primary++
        });
        document.getElementById('nav-secondary-1').addEventListener('click', e => {
            e.preventDefault();
            hits.secondary++
        });

        Neo.main.addon.Navigator.subscribe({
            clickSelector: '.nav-primary',
            id           : host.id,
            selector     : '.nav-card'
        });

        const card1      = document.getElementById('nav-card-1'),
              card2      = document.getElementById('nav-card-2'),
              secondary1 = document.getElementById('nav-secondary-1');

        card1.focus();
        const enterOnCard = new KeyboardEvent('keydown', {bubbles: true, cancelable: true, key: 'Enter'});
        card1.dispatchEvent(enterOnCard);

        secondary1.focus();
        const enterOnSecondary = new KeyboardEvent('keydown', {bubbles: true, cancelable: true, key: 'Enter'});
        secondary1.dispatchEvent(enterOnSecondary);

        card2.focus();
        const enterOnUnmatched = new KeyboardEvent('keydown', {bubbles: true, cancelable: true, key: 'Enter'});
        card2.dispatchEvent(enterOnUnmatched);

        Neo.main.addon.Navigator.unsubscribe({id: host.id});
        host.remove();

        return {
            cardPrevented     : enterOnCard.defaultPrevented,
            hits,
            secondaryPrevented: enterOnSecondary.defaultPrevented,
            unmatchedPrevented: enterOnUnmatched.defaultPrevented
        }
    });

    expect(counts).toEqual({
        cardPrevented     : true,
        hits              : {card1: 0, card2: 0, primary: 1, secondary: 0},
        secondaryPrevented: false,
        unmatchedPrevented: false
    })
});

test('omitted clickSelector preserves native form submit when pressing Enter in a focused text input inside a subscribed item (#22223)', async ({page}) => {
    await page.evaluate(() => {
        window.__navFormCounts = {itemClicks: 0, submits: 0};

        const form = document.createElement('form');
        form.id = 'navigator-omitted-selector-form';
        form.innerHTML = [
            '<ul id="navigator-omitted-selector-list">',
            '  <li id="nav-form-item-1" tabindex="-1">',
            '    <input id="nav-form-input" type="text" value="alpha">',
            '  </li>',
            '</ul>',
            '<button type="submit">Submit</button>'
        ].join('');
        form.addEventListener('submit', e => {
            e.preventDefault();
            window.__navFormCounts.submits++
        });
        document.body.appendChild(form);

        document.getElementById('nav-form-item-1').addEventListener('click', () => {
            window.__navFormCounts.itemClicks++
        });

        Neo.main.addon.Navigator.subscribe({
            id      : 'navigator-omitted-selector-list',
            selector: 'li'
        })
    });

    await page.locator('#nav-form-input').focus();
    await page.keyboard.press('Enter');

    const counts = await page.evaluate(() => {
        Neo.main.addon.Navigator.unsubscribe({id: 'navigator-omitted-selector-list'});
        document.getElementById('navigator-omitted-selector-form')?.remove();
        const result = window.__navFormCounts;
        delete window.__navFormCounts;
        return result
    });

    expect(counts).toEqual({itemClicks: 1, submits: 1})
});
