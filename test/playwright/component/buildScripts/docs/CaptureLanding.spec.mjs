import {test, expect}               from '@playwright/test';
import {landingReady, trackNetwork} from '../../../../../buildScripts/docs/captureExamples.mjs';

/**
 * @summary A page whose `<body>` carries its theme from the start, as Neo's stylesheet startup sets it, and whose view
 * mounts after `mountMs`, beside the main thread's hidden measuring node.
 * @param {Number} mountMs
 * @param {String} [startup=''] Script the page runs first
 * @returns {String}
 */
function lateMount(mountMs, startup='') {
    return `<!doctype html><html><head><style>body{margin:0}</style></head><body><script>
        ${startup}
        globalThis.Neo = {config: {themes: ['neo-theme-neo-dark', 'neo-theme-neo-light']}};
        document.body.classList.add('neo-theme-neo-dark');
        const probe = document.createElement('div');
        probe.style.cssText = 'height:1px;overflow:hidden;position:absolute;visibility:hidden;width:1px';
        document.body.appendChild(probe);
        setTimeout(() => {
            const view = document.createElement('div');
            view.className = 'neo-viewport';
            view.style.cssText = 'position:absolute;inset:0';
            document.body.appendChild(view)
        }, ${mountMs});
    </script></body></html>`
}

test('a landing capture waits for the view a themed page mounts late, then for the frame to hold still', async ({page}) => {
    await page.setViewportSize({width: 960, height: 540});
    const network = await trackNetwork(page);
    await page.setContent(lateMount(2000));
    await landingReady(page, network);
    expect(await page.locator('.neo-viewport').count()).toBe(1)
});

test('an ordinary request left open keeps a mounted, still page from counting as a landing frame', async ({page}) => {
    test.setTimeout(40000);
    await page.setViewportSize({width: 960, height: 540});
    // Never answered: the request stays open, as a slow data load would
    await page.route('http://capture.test/held.json', () => {});
    const network = await trackNetwork(page);
    await page.setContent(lateMount(0, `fetch('http://capture.test/held.json').catch(() => {});`));
    await expect(landingReady(page, network)).rejects.toThrow('landing: the network never went quiet; open: http://capture.test/held.json')
});
