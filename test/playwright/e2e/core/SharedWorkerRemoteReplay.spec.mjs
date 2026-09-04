import {test, expect} from '@playwright/test';

/**
 * A window that connects to an already-running SharedWorker receives the App worker's remote methods.
 *
 * The first window gets `Neo.worker.App.*` through the singleton's startup registration. Every later
 * window — a second tab on the same origin, or the first window after a reload while another window
 * keeps the worker alive — depends on the per-connection replay of the stored registrations. This arm
 * drives both of those windows against a real SharedWorker app and reads the namespace the main thread
 * ends up with; the unit arms pin the message envelope, this one pins the outcome a user's window sees.
 *
 * The negative half matters as much: the first window must not report a duplicate registration when
 * the replay and the startup path both reach it, and the replay must not trip the deprecated-`main`
 * warning — a window with the proxies but a console full of throws would pass a namespace check.
 */
const
    APP      = '/apps/colors/index.html',
    VIEWPORT = '.neo-viewport',
    REMOTE   = 'moveComponent';

const remoteState = page => page.evaluate(remote => ({
    shared : globalThis.Neo?.config?.useSharedWorkers === true,
    remotes: Object.keys(globalThis.Neo?.worker?.App || {}),
    has    : typeof globalThis.Neo?.worker?.App?.[remote] === 'function'
}), REMOTE);

const watch = page => {
    const problems = [];

    page.on('pageerror', error => problems.push(`pageerror: ${error?.message || error}`));
    page.on('console', message => {
        const text = message.text();

        if (/Duplicate remote method definition|destination "main" is deprecated/.test(text)) {
            problems.push(`${message.type()}: ${text}`)
        }
    });

    return problems
};

const boot = async page => {
    await page.goto(APP);
    await page.locator(VIEWPORT).first().waitFor({state: 'attached', timeout: 60000});
    // the registrations ride the connect handshake; give the main thread one frame past first paint
    await page.waitForTimeout(500)
};

test.describe('SharedWorker remote registration reaches every window', () => {
    test.setTimeout(120000);

    test('a second window and a reloaded window both receive the App worker remotes, without duplicate or deprecation noise', async ({page, context}) => {
        const firstProblems = watch(page);

        await boot(page);

        const first = await remoteState(page);

        expect(first.shared, 'the subject app must run on a SharedWorker').toBe(true);
        expect(first.has, 'the first window gets the remotes through the startup registration').toBe(true);

        // A second window on the same origin joins the RUNNING worker: only the replay can serve it.
        const second         = await context.newPage(),
              secondProblems = watch(second);

        await boot(second);

        const late = await remoteState(second);

        expect(late.has, 'a window connecting to a running SharedWorker receives the remotes').toBe(true);
        expect(late.remotes, 'and the same set the first window received').toEqual(first.remotes);

        // The first window reloads while the second keeps the worker alive — the F5 case.
        await page.reload();
        await page.locator(VIEWPORT).first().waitFor({state: 'attached', timeout: 60000});
        await page.waitForTimeout(500);

        const reloaded = await remoteState(page);

        expect(reloaded.has, 'a reloaded window receives the remotes again').toBe(true);

        expect(firstProblems, 'no duplicate-registration throw and no deprecation warning in the first window').toEqual([]);
        expect(secondProblems, 'nor in the second').toEqual([])
    })
});
