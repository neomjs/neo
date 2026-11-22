import {expect, test} from '../../fixtures.mjs';

/**
 * @summary Verifies the Task Worker demo with a rendered input echo, not the browser's native text update.
 */
test('the same calculation leaves the App Worker free only when offloaded', async ({page}) => {
    await page.setViewportSize({width: 390, height: 844});
    await page.goto('/examples/worker/task/index.html?theme=neo-theme-neo-dark');
    await expect(page.getByRole('heading', {name: 'Heavy work off the UI'})).toBeVisible();

    const run     = page.getByRole('button', {name: 'Count primes'}),
          input   = page.getByRole('textbox', {name: 'Type while the job runs'}),
          result  = page.getByRole('status'),
          clock   = page.locator('[data-ref="clock"]'),
          mode    = page.getByRole('checkbox', {name: 'Use App Worker'}),
          running = 'Counting primes in the Task Worker…';

    await page.evaluate(() => {
        const result = document.querySelector('[data-ref="result"]'),
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

    await run.click();
    await expect(result).toHaveText(running);
    await input.press('a');
    await expect(page.locator('[data-ref="echo"]')).toHaveAttribute('data-observed-during-job', 'true');
    await expect(result).toHaveText('1,031,130 primes found in the Task Worker.');
    await expect(clock).toHaveText(/App Worker updates during job: [1-9]\d* · Longest gap: \d+ ms/);

    await mode.check();
    await run.click();
    await expect(result).toHaveText('1,031,130 primes found in the App Worker.');
    await expect(clock).toHaveText(/App Worker updates during job: 0 · Longest gap: \d+ ms/);
    await expect(input).toHaveValue('a')
});
