import {expect, test} from '../../fixtures.mjs';

/**
 * @summary Verifies that `examples/component/video` boots on `Neo.examples.ConfigurationViewport` in the requested
 * `?theme=`, fits inside the workbench stage on phone (`390×844`) and desktop (`1440×900`), and switches cleanly
 * between live `<video>` playback and the `.neo-video-ghost` overlay through both the inspector and the stage.
 *
 * Aborts the external MP4 request so CI stays hermetic and independent of H.264 codecs on Linux runners.
 */
test('mounts Neo.component.Video on the workbench stage and syncs playing state with the inspector', async ({page, neuralLink}) => {
    const errors = [];

    page.on('pageerror', error => errors.push(error.message));
    page.on('console', msg => {
        if (msg.type() === 'error' && !msg.text().includes('ERR_FAILED')) {
            errors.push(msg.text())
        }
    });

    await page.route('**/big-buck-bunny-trailer.mp4*', route => route.abort());

    await page.setViewportSize({width: 390, height: 844});
    await page.goto('/examples/component/video/index.html?theme=neo-theme-neo-dark');

    const app = await neuralLink.connectToApp('Neo.examples.component.video');

    await expect(page.locator('body')).toHaveClass(/\bneo-theme-neo-dark\b/);

    const stage = page.locator('.neo-example-container').first(),
          video = stage.locator('.neo-video').first(),
          media = video.locator('video.neo-video-media');

    await expect(video).toBeVisible();
    await expect(media).toBeVisible();

    // Verify 320×180 video fits inside the 390×844 mobile workbench stage without horizontal or vertical clipping
    const mobileFit = await stage.evaluate(stageNode => {
        const s = stageNode.getBoundingClientRect(),
              v = stageNode.querySelector('.neo-video').getBoundingClientRect(),
              m = stageNode.querySelector('video.neo-video-media');

        return {
            fits  : v.left >= s.left - 1 && v.right <= s.right + 1 && v.top >= s.top - 1 && v.bottom <= s.bottom + 1,
            muted : m.muted,
            width : Math.round(v.width),
            height: Math.round(v.height)
        }
    });

    expect(mobileFit.fits).toBe(true);
    expect(mobileFit.muted).toBe(true);
    expect(mobileFit.width).toBe(320);
    expect(Math.abs(mobileFit.height - 180)).toBeLessThanOrEqual(2);

    const videoId   = await video.getAttribute('id'),
          videoInit = await app.getComponent(videoId, ['height', 'playing', 'width']);

    expect(videoInit).toEqual({height: 180, playing: true, width: 320});

    // Switch to 1440×900 desktop and toggle `playing` via the Inspector CheckBox
    await page.setViewportSize({width: 1440, height: 900});

    let playingFieldId = null;
    await expect.poll(async () => {
        const matches = [].concat(await app.queryComponent({ntype: 'checkboxfield', labelText: 'playing'}, ['id']) ?? []);
        playingFieldId = matches[0]?.id ?? null;
        return Boolean(playingFieldId)
    }, {timeout: 15000}).toBe(true);

    await page.locator(`#${playingFieldId} .neo-checkbox-icon`).click();

    await expect(media).toHaveCount(0);
    await expect(video.locator('.neo-video-ghost')).toBeVisible();
    expect((await app.getComponent(videoId, ['playing'])).playing).toBe(false);

    // Clicking the ghost play overlay restores live playback and updates the worker component state
    await video.locator('.neo-video-ghost').click();

    await expect(media).toBeVisible();
    await expect(video.locator('.neo-video-ghost')).toHaveCount(0);
    expect((await app.getComponent(videoId, ['playing'])).playing).toBe(true);
    expect(errors).toEqual([])
});
