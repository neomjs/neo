import {expect, test} from '../../fixtures.mjs';

/**
 * @summary Verifies the Task Worker demo with a rendered input echo, not the browser's native text update.
 */
test('the same calculation leaves the App Worker free only when offloaded', async ({page}) => {
    await page.setViewportSize({width: 390, height: 844});
    await page.goto('/examples/worker/task/index.html?theme=neo-theme-neo-dark');
    await expect(page.getByRole('heading', {name: 'Heavy work off the UI'})).toBeVisible();

    const runTask    = page.getByRole('button', {name: 'Run in Task Worker'}),
          runApp     = page.getByRole('button', {name: 'Run in App Worker'}),
          input      = page.getByRole('textbox', {name: 'Type while the job runs'}),
          taskResult = page.locator('[data-ref="task-result"]'),
          appResult  = page.locator('[data-ref="app-result"]'),
          taskClock  = page.locator('[data-ref="task-clock"]'),
          appClock   = page.locator('[data-ref="app-clock"]'),
          echo       = page.locator('[data-ref="echo"]'),
          counted    = '1,031,130 primes found in the Task Worker.';

    await expect(taskResult).toHaveText(counted);
    await expect(appResult).not.toContainText('primes found');
    const inputBox = await input.boundingBox(),
          echoBox  = await echo.boundingBox();

    expect(inputBox.y + inputBox.height).toBeLessThanOrEqual(echoBox.y);

    await page.evaluate(() => {
        const result = document.querySelector('[data-ref="task-result"]'),
              echo   = document.querySelector('[data-ref="echo"]');

        const observer = new MutationObserver(() => {
            if (result.textContent === 'Counting primes in the Task Worker…' &&
                echo.textContent === 'App Worker received 1 character.') {
                echo.dataset.observedDuringJob = 'true';
                observer.disconnect()
            }
        });

        observer.observe(echo, {childList: true, characterData: true, subtree: true})
    });

    await runTask.click();
    await expect(input).toBeFocused();
    await expect(taskResult).toHaveText('Counting primes in the Task Worker…');
    await page.keyboard.press('a');
    await expect(echo).toHaveAttribute('data-observed-during-job', 'true');
    await expect(taskResult).toHaveText(counted);
    await expect(taskClock).toHaveText(/App Worker updates during job: [1-9]\d* · Longest gap: \d+ ms/);

    await runApp.click();
    await expect(input).toBeFocused();
    await expect(appResult).toHaveText('Counting primes in the App Worker…');
    await page.keyboard.press('b');
    await expect(appResult).toHaveText('1,031,130 primes found in the App Worker.');
    await expect(appClock).toHaveText(/App Worker updates during job: 0 · Longest gap: \d+ ms/);
    await expect(taskResult).toHaveText(counted);
    await expect(input).toHaveValue('ab');
    await expect(echo).toHaveText('App Worker received 2 characters.')
});
