import {expect, test} from '../../fixtures.mjs';

/**
 * @summary A `promiseUpdate()` asked on a mounted component without a vnode settles in a live app.
 *
 * A move between windows in mid-flight can leave a component mounted while its vnode is gone. Only its parent's
 * payload can render it then, so the promise it is asked for must settle with that parent's flight instead of
 * staying parked. The arm puts a live button of the cross-window dock demo into that state: `vnode: null`, which has
 * no side effect of its own, and no node in this window's DOM. It reads whether the promise settles and the button is
 * rendered again.
 */
const
    APP     = '/examples/dashboard/crossWindow/index.html',
    PENDING = 'still pending after 5 s';

test.describe('A mounted component without a vnode', () => {
    test.setTimeout(120000);

    test('settles its promiseUpdate() through the parent flight that renders it', async ({page, neuralLink}) => {
        await page.goto(APP);
        await page.locator('.agentos-dockdemo-counter-pane').waitFor({timeout: 30000});

        const
            app     = await neuralLink.connectToApp('Neo.examples.dashboard.crossWindow'),
            buttons = await app.findInstances({ntype: 'button'}, ['id', 'mounted', 'parentId', 'vnode']),
            button  = (Array.isArray(buttons) ? buttons : [buttons])
                .map(record => ({...(record.properties ?? record), id: record.id ?? record.properties?.id}))
                .find(record => record.mounted === true && record.vnode && record.parentId);

        expect(button, 'the app renders a mounted toolbar button with a parent').toBeTruthy();

        // The state a move between windows leaves: mounted, no vnode, and no node in this window's DOM
        await app.setProperties(button.id, {vnode: null});
        await page.evaluate(id => document.getElementById(id)?.remove(), button.id);

        const outcome = await Promise.race([
            app.callMethod(button.id, 'promiseUpdate').then(() => 'resolved', () => 'rejected'),
            // wall-clock-under-test: a stranded promise never settles, so this bound stands in for "never"; the parent
            // flight settles it within milliseconds and the race ends there
            new Promise(resolve => setTimeout(() => resolve(PENDING), 5000))
        ]);

        expect(outcome, 'the parent flight that renders the button settles what was parked on it').toBe('resolved');

        const after = await app.getComponent(button.id, ['mounted', 'vnode']);

        expect(Boolean(after?.vnode), 'that flight rendered the button again').toBe(true);
        await expect(page.locator(`#${button.id}`), 'the parent flight put the button back into the DOM, once').toHaveCount(1)
    })
});
