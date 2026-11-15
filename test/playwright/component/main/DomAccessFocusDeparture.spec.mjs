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
     * Focuses `holder`, lets the user move focus to `moveTo` first if given (the worker decides one round trip late, so
     * its hand-back arrives after the move), starts the hand-back, removes the ids in `removals` in order, a frame
     * apart, and resolves the id of the element holding focus once the hand-back settled.
     */
    const depart = (page, holder, removals, moveTo) => page.evaluate(async ({holder, moveTo, removals}) => {
        const frame = () => new Promise(resolve => setTimeout(resolve, 30));

        document.getElementById(holder).focus();
        moveTo && document.getElementById(moveTo).focus();

        const handBack = Neo.main.DomAccess.focus({id: 'fd-target', restoreFrom: 'fd-departing'});

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

    test('a focus the user moved on before the hand-back arrived keeps its place', async ({page}) => {
        expect(await depart(page, 'fd-inner', ['fd-departing'], 'fd-other')).toBe('fd-other')
    });

    // The departure settles in a mutation callback, and the hand-back applies a microtask later: a focus moved in
    // between, by a later observer of the same removal or a queued microtask, is the newer choice
    for (const via of ['observer', 'microtask']) {
        test(`a focus moved while the departure settles keeps its place (${via})`, async ({page}) => {
            expect(await page.evaluate(async via => {
                const other = () => document.getElementById('fd-other').focus();

                document.getElementById('fd-inner').focus();

                const handBack = Neo.main.DomAccess.focus({id: 'fd-target', restoreFrom: 'fd-departing'});

                if (via === 'observer') {
                    const newerChoice = new MutationObserver(() => {newerChoice.disconnect(); other()});
                    newerChoice.observe(document, {childList: true, subtree: true})
                }

                document.getElementById('fd-departing').remove();
                via === 'microtask' && queueMicrotask(other);

                await handBack;

                return document.activeElement.id
            }, via)).toBe('fd-other')
        })
    }

    test.describe('focus deferred across visibility staging', () => {
        test('focuses inside a visibility-hidden wrapper once revealed', async ({page}) => {
            expect(await page.evaluate(async () => {
                const wrap   = document.createElement('div'),
                      target = document.createElement('input');

                wrap.id               = 'fv-wrap';
                wrap.style.visibility = 'hidden';
                target.id             = 'fv-target';
                wrap.appendChild(target);
                document.body.appendChild(wrap);

                try {
                    const pending = Neo.main.DomAccess.focus({id: 'fv-target'});

                    await new Promise(resolve => setTimeout(resolve, 25));
                    wrap.style.visibility = '';
                    await pending;

                    return document.activeElement?.id
                } finally {
                    wrap.remove()
                }
            })).toBe('fv-target')
        });

        test('yields when focus moves manually to another element before reveal', async ({page}) => {
            expect(await page.evaluate(async () => {
                const wrap   = document.createElement('div'),
                      target = document.createElement('input'),
                      other  = document.createElement('input');

                wrap.id               = 'fv-wrap';
                wrap.style.visibility = 'hidden';
                target.id             = 'fv-target';
                other.id              = 'fv-other';
                wrap.appendChild(target);
                document.body.append(wrap, other);

                try {
                    const pending = Neo.main.DomAccess.focus({id: 'fv-target'});

                    other.focus();
                    wrap.style.visibility = '';
                    await pending;

                    return document.activeElement?.id
                } finally {
                    wrap.remove();
                    other.remove()
                }
            })).toBe('fv-other')
        });

        test('yields when a newer DomAccess.focus request runs before reveal', async ({page}) => {
            expect(await page.evaluate(async () => {
                const wrap   = document.createElement('div'),
                      target = document.createElement('input'),
                      other  = document.createElement('input');

                wrap.id               = 'fv-wrap';
                wrap.style.visibility = 'hidden';
                target.id             = 'fv-target';
                other.id              = 'fv-other';
                wrap.appendChild(target);
                document.body.append(wrap, other);

                try {
                    const pending = Neo.main.DomAccess.focus({id: 'fv-target'});

                    Neo.main.DomAccess.focus({id: 'fv-other'});
                    wrap.style.visibility = '';
                    await pending;

                    return document.activeElement?.id
                } finally {
                    wrap.remove();
                    other.remove()
                }
            })).toBe('fv-other')
        })
    })
});
