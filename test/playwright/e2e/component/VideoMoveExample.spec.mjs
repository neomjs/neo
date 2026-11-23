import {expect, test} from '../../fixtures.mjs';

/**
 * @summary Verifies that `examples/videoMove` honors `?theme=`, mounts `<video>` muted for autoplay, and reparents the
 * live `<video>` DOM node across panels without pausing or resetting `currentTime`.
 *
 * Uses an in-page canvas `MediaStream` while aborting the external CDN MP4 request so CI stays hermetic and independent
 * of proprietary H.264 decoders on Linux Chromium runners.
 */
test('reparents a playing video element across panels without losing playback continuity', async ({page}) => {
    const errors = [];

    page.on('pageerror', error => errors.push(error.message));
    page.on('console', msg => {
        if (msg.type() === 'error' && !msg.text().includes('ERR_FAILED')) {
            errors.push(msg.text())
        }
    });

    await page.route('**/big-buck-bunny-trailer.mp4*', route => route.abort());

    await page.setViewportSize({width: 390, height: 844});
    await page.goto('/examples/videoMove/index.html?theme=neo-theme-neo-dark');

    await expect(page.getByRole('heading', {name: 'Moving a playing video'})).toBeVisible();
    await expect(page.locator('body')).toHaveClass(/\bneo-theme-neo-dark\b/);

    const video   = page.locator('video.neo-video-media'),
          readout = page.locator('[data-ref="status-readout"]'),
          badge1  = page.locator('[data-ref="panel-1-badge"]'),
          badge2  = page.locator('[data-ref="panel-2-badge"]');

    await expect(video).toBeVisible();
    await expect(badge1).toHaveText('Playing here');
    await expect(badge2).toHaveText('Ready to receive');

    // Verify DomApiRenderer synced live video.muted = true on initial mount, then feed a hermetic canvas stream
    const mountedMuted = await video.evaluate(async node => {
        const wasMuted = node.muted;
        const canvas   = document.createElement('canvas');
        canvas.width   = 160;
        canvas.height  = 90;
        const ctx   = canvas.getContext('2d');
        let   frame = 0;

        const draw = () => {
            ctx.fillStyle = `hsl(${frame++ % 360}, 60%, 45%)`;
            ctx.fillRect(0, 0, 160, 90);
            if (node.isConnected) requestAnimationFrame(draw)
        };
        draw();

        node.removeAttribute('src');
        node.querySelectorAll('source').forEach(source => source.remove());
        node.srcObject = canvas.captureStream(30);
        node.__neoIdentityToken = 'same-live-video-element';
        await node.play();
        return wasMuted
    });

    expect(mountedMuted).toBe(true);

    await expect.poll(() => video.evaluate(node => !node.paused && node.currentTime >= 1.1)).toBe(true);

    const beforeTime = await video.evaluate(node => node.currentTime);

    await page.getByRole('button', {name: 'Move Video'}).click();

    await expect(badge1).toHaveText('Ready to receive');
    await expect(badge2).toHaveText('Playing here');
    await expect(readout).toHaveText(/Moved to Panel B at \d+:\d{2}, still playing at \d+:\d{2} \(1 move\)/);

    // Wait until the post-move ticker advances to a later second than the move timestamp
    await expect.poll(async () => {
        const text  = await readout.textContent() || '',
              match = text.match(/Moved to Panel B at (\d+:\d{2}), still playing at (\d+:\d{2})/);

        return Boolean(match && match[1] !== match[2])
    }).toBe(true);

    const afterState = await page.evaluate(() => {
        const node  = document.querySelector('video.neo-video-media'),
              cards = [...document.querySelectorAll('.neo-videomove-card')];

        return {
            currentTime: node.currentTime,
            inPanelB   : cards[1].contains(node) && !cards[0].contains(node),
            paused     : node.paused,
            sameNode   : node.__neoIdentityToken === 'same-live-video-element'
        }
    });

    expect(afterState.sameNode).toBe(true);
    expect(afterState.inPanelB).toBe(true);
    expect(afterState.paused).toBe(false);
    expect(afterState.currentTime).toBeGreaterThan(beforeTime);
    expect(errors).toEqual([])
});
