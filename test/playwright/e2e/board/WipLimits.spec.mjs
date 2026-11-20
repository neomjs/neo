import {test, expect} from '../../fixtures.mjs';

const EXAMPLE_URL = '/examples/board/wipLimits/index.html';

const THEMES = [
    'neo-theme-neo-dark',
    'neo-theme-neo-light',
    'neo-theme-light',
    'neo-theme-dark',
    'neo-theme-cyberpunk'
];

test.describe('Board WIP limits example (#21628)', () => {
    test('marks overloaded columns, updates both badges and marks on drop, and steps limits live', async ({page}) => {
        const errors = [];

        page.on('console', msg => {
            if (msg.type() === 'error') {
                errors.push(msg.text())
            }
        });
        page.on('pageerror', err => errors.push(err.message));
        page.on('response', res => {
            if (res.status() === 404) {
                errors.push(`404: ${res.url()}`)
            }
        });

        await page.setViewportSize({width: 1440, height: 900});
        await page.goto(`${EXAMPLE_URL}?theme=neo-theme-neo-dark`);

        const
            waitingCol = page.locator('.neo-board-column[id$="__col__waiting"]'),
            benchCol   = page.locator('.neo-board-column[id$="__col__bench"]'),
            testingCol = page.locator('.neo-board-column[id$="__col__testing"]'),
            pickupCol  = page.locator('.neo-board-column[id$="__col__pickup"]');

        await expect(benchCol).toBeVisible();
        await expect(page.locator('.neo-board-card')).toHaveCount(16);

        // AC-1 & AC-3: First frame — bench is marked overloaded and reads 4/3; Testing reads 2/2 and is not marked
        await expect(waitingCol.locator('.neo-board-column-count')).toHaveText('6');
        await expect(pickupCol.locator('.neo-board-column-count')).toHaveText('4');

        await expect(benchCol).toHaveClass(/neo-board-column-wip-exceeded/);
        await expect(benchCol.locator('.neo-board-column-count')).toHaveText('4/3');
        await expect(benchCol.locator('.neo-board-column-count')).toHaveClass(/neo-board-column-wip-exceeded/);
        await expect(benchCol.locator('.workshop-wip-over-banner')).toContainText('Over limit by 1');

        await expect(testingCol).not.toHaveClass(/neo-board-column-wip-exceeded/);
        await expect(testingCol.locator('.neo-board-column-count')).toHaveText('2/2');
        await expect(testingCol.locator('.workshop-wip-over-banner')).toHaveCount(0);

        // Observe main-thread delta updates for id-less insertNode regressions
        await page.evaluate(() => {
            Neo.config.logDeltaUpdates = true;
            window.__idlessInserts     = 0;

            const orig = console.log.bind(console);
            console.log = (...args) => {
                if (typeof args[0] === 'string' && args[0].startsWith('update ')) {
                    const
                        data   = args[3],
                        deltas = Array.isArray(data) ? data : (data?.deltas || []);

                    window.__idlessInserts += deltas.filter(d => d.action === 'insertNode' && !d.id && !d.vnode?.id).length
                }
                orig(...args)
            }
        });

        // AC-2 & AC-4: Drag a repair from On the bench (4/3) into Testing (2/2)
        const
            benchCard  = benchCol.locator('.neo-board-card').first(),
            cardBox    = await benchCard.boundingBox(),
            targetBody = testingCol.locator('.neo-board-column-body'),
            targetBox  = await targetBody.boundingBox(),
            startX     = cardBox.x + cardBox.width / 2,
            startY     = cardBox.y + 20,
            endX       = targetBox.x + targetBox.width / 2,
            endY       = targetBox.y + 60;

        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.mouse.move(startX + 12, startY + 6, {steps: 4});
        await page.mouse.move(endX, endY, {steps: 12});
        await expect(page.locator('.neo-dragproxy')).toBeVisible();
        await page.mouse.up();

        // Bench recovers to 3/3 (unmarked); Testing goes over at 3/2 (marked)
        await expect(benchCol.locator('.neo-board-column-count')).toHaveText('3/3');
        await expect(benchCol).not.toHaveClass(/neo-board-column-wip-exceeded/);
        await expect(benchCol.locator('.workshop-wip-over-banner')).toHaveCount(0);

        await expect(testingCol.locator('.neo-board-column-count')).toHaveText('3/2');
        await expect(testingCol).toHaveClass(/neo-board-column-wip-exceeded/);
        await expect(testingCol.locator('.neo-board-column-count')).toHaveClass(/neo-board-column-wip-exceeded/);
        await expect(testingCol.locator('.workshop-wip-over-banner')).toContainText('Over limit by 1');

        // AC-2: Stepper changes Testing's limit from 2 -> 3 (clears mark) and 3 -> 2 (restores mark)
        await testingCol.locator('[id$="__stepper-inc"]').click();
        await expect(testingCol.locator('.neo-board-column-count')).toHaveText('3/3');
        await expect(testingCol.locator('.workshop-wip-step-value')).toHaveText('limit 3');
        await expect(testingCol).not.toHaveClass(/neo-board-column-wip-exceeded/);
        await expect(testingCol.locator('.workshop-wip-over-banner')).toHaveCount(0);
        await expect(page.locator('.workshop-overload-pill')).toContainText('All stages within WIP limits');

        await testingCol.locator('[id$="__stepper-dec"]').click();
        await expect(testingCol.locator('.neo-board-column-count')).toHaveText('3/2');
        await expect(testingCol).toHaveClass(/neo-board-column-wip-exceeded/);

        expect(await page.evaluate(() => window.__idlessInserts)).toBe(0);
        expect(errors).toEqual([])
    });

    test('renders cleanly across all five themes at 1440x900 and 390x844 with styled steppers', async ({page}) => {
        const errors = [];

        page.on('console', msg => {
            if (msg.type() === 'error') {
                errors.push(msg.text())
            }
        });
        page.on('pageerror', err => errors.push(err.message));
        page.on('response', res => {
            if (res.status() === 404) {
                errors.push(`404: ${res.url()}`)
            }
        });

        for (const size of [{width: 1440, height: 900}, {width: 390, height: 844}]) {
            await page.setViewportSize(size);

            for (const theme of THEMES) {
                await page.goto(`${EXAMPLE_URL}?theme=${theme}`);

                const benchCol = page.locator('.neo-board-column[id$="__col__bench"]');
                await expect(benchCol).toBeVisible();
                await expect(benchCol.locator('.neo-board-column-count')).toHaveText('4/3');

                // AC-6: Steppers do not keep default browser button styling
                const stepperRadius = await benchCol.locator('.workshop-wip-stepper').evaluate(el => getComputedStyle(el).borderRadius);
                expect(parseFloat(stepperRadius)).toBeGreaterThanOrEqual(10)
            }
        }

        expect(errors).toEqual([])
    });
});
