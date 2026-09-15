import {test, expect} from '@playwright/test';

const PROBE_PATH = '../../test/playwright/component/apps/empty-viewport/ClsTransitionProbe.mjs';

let probeIds = [];

/**
 * @summary Whether splitting a class transition across several `cls` writes exposes an intermediate
 * state to the DOM.
 *
 * A class swap written as one aggregate `cls` assignment costs a single write. Written as
 * `removeCls()` then `addCls()` it costs one per class, and every `cls` write ends in `update()`.
 * The question is whether the extra update requests are observable, so both arms run the same
 * transition, from the same starting classes, in the same worker tick, and are watched from the
 * DOM side rather than from either implementation.
 *
 * The observable is measured rather than inferred: a `MutationObserver` on the element's `class`
 * attribute records every distinct class state the DOM holds. A flash is a recorded state carrying
 * no theme class at all — the frame in which an author would see an unthemed component.
 *
 * The second test is a **positive control** and is not a pattern anyone ships: it issues the same
 * two writes from two separate worker ticks, waiting for the first to land before sending the
 * second. It exists because "no flash observed" is worthless without proof that this observer can
 * see a flash when one occurs.
 */
test.describe('Neo.component.Base — a class transition split across several cls writes', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'})
    });

    test.afterEach(async ({page}) => {
        for (const id of probeIds) {
            await page.evaluate(value => Neo.worker.App.destroyNeoInstance(value), id)
        }

        probeIds = []
    });

    /**
     * Mounts a probe carrying one theme class plus an unrelated class, so a transition has something
     * to preserve as well as something to swap.
     * @param {Object} page
     * @param {String} writeMode
     * @returns {Promise<String>} the mounted probe's id
     */
    async function mountProbe(page, writeMode) {
        const result = await page.evaluate(([importPath, mode]) => Neo.worker.App.createNeoInstance({
            importPath,
            ntype     : 'cls-transition-probe',
            parentId  : 'component-test-viewport',
            cls       : ['app-unrelated'],
            height    : 60,
            probeTheme: 'neo-theme-light',
            width     : 120,
            writeMode : mode
        }), [PROBE_PATH, writeMode]);

        if (!result.success) {
            throw new Error(`probe creation failed (${writeMode}): ${result.error?.message}`)
        }

        probeIds.push(result.id);

        await page.waitForSelector(`#${result.id}`, {state: 'attached'});
        await waitForClass(page, result.id, 'neo-theme-light', true);

        return result.id
    }

    /**
     * Waits until the element carries — or has lost — a class. The transition's own observable is the
     * settle condition, so no arm has to guess at a duration.
     * @param {Object}  page
     * @param {String}  id
     * @param {String}  cls
     * @param {Boolean} present
     * @returns {Promise<void>}
     */
    function waitForClass(page, id, cls, present) {
        return page.waitForFunction(
            ([elementId, name, expected]) => {
                const el = document.getElementById(elementId);

                return !!el && el.className.split(' ').includes(name) === expected
            },
            [id, cls, present]
        )
    }

    /**
     * Records every class state the element holds while `run` executes, starting from the state
     * before it and ending once `settleClass` has arrived. Consecutive duplicates are dropped so a
     * genuine A → B → A sequence still survives.
     * @param {Object}   page
     * @param {String}   id
     * @param {Function} run
     * @param {String}   settleClass
     * @returns {Promise<String[][]>} each entry is that moment's class list
     */
    async function recordClassStates(page, id, run, settleClass) {
        await page.evaluate(elementId => {
            const el = document.getElementById(elementId);

            window.__clsStates = [el.className];

            window.__clsObserver = new MutationObserver(() => {
                const previous = window.__clsStates[window.__clsStates.length - 1];

                el.className !== previous && window.__clsStates.push(el.className)
            });

            window.__clsObserver.observe(el, {attributes: true, attributeFilter: ['class']})
        }, id);

        await run();
        await waitForClass(page, id, settleClass, true);

        return page.evaluate(() => {
            window.__clsObserver.disconnect();

            return window.__clsStates.map(value => value.split(' ').filter(Boolean))
        })
    }

    /**
     * @param {String[][]} states
     * @returns {String[][]} the recorded states which carry no theme class at all
     */
    const themelessStates = states => states.filter(
        entry => !entry.some(item => item.startsWith('neo-theme-'))
    );

    test('the API form exposes no class state the aggregate form does not', async ({page}) => {
        const aggregateId = await mountProbe(page, 'aggregate'),
              apiId       = await mountProbe(page, 'api'),

              setTheme    = id => page.evaluate(
                  value => Neo.worker.App.setConfigs({id: value, probeTheme: 'neo-theme-dark'}), id
              ),

              aggregate   = await recordClassStates(page, aggregateId, () => setTheme(aggregateId), 'neo-theme-dark'),
              api         = await recordClassStates(page, apiId,       () => setTheme(apiId),       'neo-theme-dark');

        console.log('aggregate (1 write) :', JSON.stringify(aggregate));
        console.log('api       (2 writes):', JSON.stringify(api));

        // both arms have to actually land the transition, or the comparison is between two no-ops
        expect(aggregate.at(-1), 'the aggregate arm drops the outgoing theme').not.toContain('neo-theme-light');
        expect(api.at(-1),       'the API arm drops the outgoing theme').not.toContain('neo-theme-light');
        expect(api.at(-1),       'the API arm preserves unrelated classes').toContain('app-unrelated');

        expect(themelessStates(api), 'the API arm never leaves the component unthemed').toEqual([]);

        expect(api.length, 'the API arm costs no extra class mutations').toBe(aggregate.length)
    });

    test('positive control: the same two writes in separate ticks DO expose a themeless frame', async ({page}) => {
        const id = await mountProbe(page, 'aggregate'),

              states = await recordClassStates(page, id, async () => {
                  await page.evaluate(async value => {
                      const cls = await Neo.worker.App.getConfigs({id: value, keys: 'cls'});

                      Neo.worker.App.setConfigs({id: value, cls: cls.filter(item => item !== 'neo-theme-light')})
                  }, id);

                  // the first write has to be on screen before the second is sent, or the two coalesce
                  // and this control passes or fails on timing instead of on what it demonstrates
                  await waitForClass(page, id, 'neo-theme-light', false);

                  await page.evaluate(async value => {
                      const cls = await Neo.worker.App.getConfigs({id: value, keys: 'cls'});

                      Neo.worker.App.setConfigs({id: value, cls: [...cls, 'neo-theme-dark']})
                  }, id)
              }, 'neo-theme-dark');

        console.log('split ticks         :', JSON.stringify(states));

        expect(
            themelessStates(states).length,
            'the observer can see an intermediate state, so its silence in the arm above is meaningful'
        ).toBeGreaterThan(0)
    })
});
