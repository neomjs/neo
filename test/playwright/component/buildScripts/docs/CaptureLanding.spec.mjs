import {test, expect} from '@playwright/test';
import {landingReady} from '../../../../../buildScripts/docs/captureExamples.mjs';

/**
 * @summary A page whose `<body>` carries its theme from the start, as Neo's stylesheet startup sets it, and whose view
 * mounts after `mountMs`, beside the main thread's hidden measuring node.
 * @param {Number} mountMs
 * @returns {String}
 */
function lateMount(mountMs) {
    return `<!doctype html><html><head><style>body{margin:0}</style></head><body><script>
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
    await page.setContent(lateMount(2000));
    await landingReady(page);
    expect(await page.locator('.neo-viewport').count()).toBe(1)
});
