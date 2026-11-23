import {test, expect}                           from '@playwright/test';
import {landingReady, paintReady, trackNetwork} from '../../../../../buildScripts/docs/captureExamples.mjs';

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

test('capture readiness waits for a visible pixel of media after both the scroller and capture have clipped it', async ({page}) => {
    const clip = {x: 40, y: 0, width: 100, height: 50};
    await page.setContent(`<style>body{margin:0} section{width:100px;height:40px;position:relative;overflow:hidden}
        img{position:absolute;width:20px;height:10px;left:100px;top:10px}</style>
        <section><img loading="lazy" src="data:image/png,invalid" alt=""></section>`);
    const image = page.locator('img');
    await image.evaluate(el => el.decode().catch(() => {}));
    expect(await image.evaluate(el => el.naturalWidth)).toBe(0);

    // At x=100 the image touches the scroller's edge and its box overlaps the capture.
    await paintReady(page, clip, 1000);
    await image.evaluate(el => el.style.left = '99px');
    await expect(paintReady(page, clip, 600)).rejects.toThrow('inside the capture region');

    // One pixel inside the capture must also wait when the whole image is inside its scroller.
    await image.evaluate(el => el.style.left = '20px');
    await paintReady(page, clip, 1000);
    await image.evaluate(el => el.style.left = '21px');
    await expect(paintReady(page, clip, 600)).rejects.toThrow('inside the capture region');
    await image.evaluate(async el => {
        el.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"/>';
        await el.decode()
    });
    await paintReady(page, clip, 1000)
});

test('a clipped video cannot hold the capture, but a visible video with a source must paint', async ({page}) => {
    const clip = {x: 0, y: 0, width: 200, height: 100};
    await page.setContent(`<div style="width:80px;overflow:hidden">
        <video style="display:block;width:40px;height:20px;margin-left:81px"><source src="data:video/mp4,invalid"></video>
        </div>`);
    await paintReady(page, clip, 1000);
    await page.locator('video').evaluate(el => el.style.marginLeft = '79px');
    await expect(paintReady(page, clip, 600)).rejects.toThrow('inside the capture region')
});
