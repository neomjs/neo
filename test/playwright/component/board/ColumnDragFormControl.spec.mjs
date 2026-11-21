import {test, expect} from '@playwright/test';

/**
 * @summary A column drag carries copies of its cards, and a copy's native form control must stay out of its source's
 * state. The harness cards share one radio group; the checked radio sits on the column that is carried.
 */
const BOARD  = 'board-form-control-board',
      source = page => page.locator(`[id="${BOARD}__card__r1__choice"]`);

test('a column drag leaves a checked radio on its card checked, while held and after the drop', async ({page}) => {
    await page.goto('/test/playwright/component/apps/board-form-control/index.html');
    await expect(source(page)).toBeChecked();

    const from = await page.locator(`[id="${BOARD}__col__todo"] .neo-board-column-header`).boundingBox(),
          to   = await page.locator(`[id="${BOARD}__col__done"]`).boundingBox(),
          y    = from.y + from.height / 2;

    await page.mouse.move(from.x + 24, y);
    await page.mouse.down();
    await page.mouse.move(from.x + 44, y, {steps: 4});

    await expect(page.locator('.neo-dragproxy input[type="radio"]'), 'the proxy carries a copy of the radio').toHaveCount(1);
    await expect(source(page), 'the carried column\'s radio keeps its state').toBeChecked();

    await page.mouse.move(to.x + to.width / 2, y, {steps: 8});
    await page.mouse.up();

    await expect(page.locator('.neo-dragproxy')).toHaveCount(0);
    await expect(source(page), 'and keeps it after the drop').toBeChecked()
});
