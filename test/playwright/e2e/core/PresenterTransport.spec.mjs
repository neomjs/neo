import {expect, test} from '../../fixtures.mjs';

/**
 * @summary A canvas driven by the Canvas Worker stays in its own document and still receives pixels.
 *
 * Both halves matter and they fail differently.
 *
 * **Stays in its own document** is the structural half. `transferControlToOffscreen()` is irreversible: once
 * a canvas is transferred, `getContext('2d')` on it throws `InvalidStateError` forever. So the throw is a
 * precise, unfakeable witness that the node was handed away — and its absence is the witness that it was
 * not. That is the property the renderer-kill depends on, because a canvas a document no longer owns is
 * exactly what a worker in another process must never paint into.
 *
 * **Still receives pixels** is the behavioural half, and without it the first is satisfied trivially: never
 * transferring and never drawing would pass a structural check while rendering nothing. Reading the canvas
 * back catches that.
 *
 * The subject is `apps/portal` because it declares a canvas worker and draws several canvases, and unlike
 * the workstation app it carries no animated offscreen work, so it runs on a hosted runner.
 *
 * Canvases without a `neo-canvas-` id belong to other libraries on the page and are ignored — they are not
 * this engine's to govern, and including them would make the assertion depend on third-party behaviour.
 */
const
    APP      = '/apps/portal/index.html',
    SETTLE   = 5000,
    VIEWPORT = '.neo-viewport';

test.describe('a worker-driven canvas is presented locally, not transferred away', () => {
    test.setTimeout(180000);

    test('every neo canvas keeps its context and at least one carries painted pixels', async ({page}) => {
        const problems = [];

        page.on('pageerror', error => problems.push(`pageerror: ${error.message}`));
        page.on('console', message => message.type() === 'error' && problems.push(`console: ${message.text()}`));

        await page.goto(APP);
        await page.locator(VIEWPORT).first().waitFor({state: 'attached', timeout: 60000});
        await page.waitForFunction(() => document.querySelectorAll('canvas[id^="neo-canvas-"]').length > 0, null, {timeout: 60000});

        await page.waitForTimeout(SETTLE); // wall-clock-under-test: the frame loop is rAF-paced, so this is frames rather than a guess

        const report = await page.evaluate(() => [...document.querySelectorAll('canvas[id^="neo-canvas-"]')].map(canvas => {
            let painted = null;

            try {
                const data = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data;
                painted = data ? data.some(value => value !== 0) : null
            } catch (error) {
                painted = `throw: ${error.name}`
            }

            return {id: canvas.id, painted}
        }));

        console.log('neo canvases:', JSON.stringify(report));

        expect(report.length, 'the subject app must draw neo canvases at all').toBeGreaterThan(0);

        expect(
            report.filter(entry => entry.painted === 'throw: InvalidStateError'),
            'no neo canvas may have been transferred out of its document — InvalidStateError is that transfer, and it is irreversible'
        ).toEqual([]);

        expect(
            report.some(entry => entry.painted === true),
            'frames must actually arrive: a canvas that is never transferred and never painted would satisfy the check above while rendering nothing'
        ).toBe(true);

        expect(problems, 'the presenter path must not log errors').toEqual([])
    })
});
