import {test, expect} from '../fixtures.mjs';

/**
 * @summary Harness Endurance Benchmark runner — Subject A (Neo).
 *
 * v1 = the foundation: confirms Subject A boots, its "Start load" control drives the deterministic
 * `LoadProfile` append stream into the streaming markdown transcript, and the transcript renders —
 * i.e. the end-to-end "drive a subject" capability the measurement layer builds on. The
 * keystroke→echo latency + frame-time / task-queue-depth / heap sampling over session-age layer on
 * next (this run only proves the drive path before measurement is wired).
 *
 * Selectors are grounded, not guessed: `.neo-markdown-vdom` is the component's `baseCls`
 * (`src/component/markdown/Component.mjs`); the app name + "Start load" button are authored in
 * `examples/harnessEndurance/neo/`.
 */
test.describe('Harness Endurance Benchmark — Subject A (Neo)', () => {
    test.setTimeout(90000);

    test('mounts, drives the LoadProfile stream, and renders the transcript', async ({page, neuralLink}) => {
        await page.goto('/examples/harnessEndurance/neo/index.html');

        // App Worker reachable → Subject A booted
        const app = await neuralLink.connectToApp('Neo.examples.harnessEndurance.neo');
        expect(app).toBeTruthy();

        // the "Start load" toolbar button → MainContainer.startLoad (default LoadProfile config)
        const startButton = page.getByRole('button', {name: 'Start load'});
        await expect(startButton).toBeVisible({timeout: 30000});
        await startButton.click();

        // the streamed appends render into the markdown-vdom transcript
        const transcript = page.locator('.neo-markdown-vdom').first();
        await expect.poll(async () => (await transcript.innerText()).length, {
            message: 'transcript should accumulate streamed markdown under the load',
            timeout: 20000
        }).toBeGreaterThan(0);
    });
});
