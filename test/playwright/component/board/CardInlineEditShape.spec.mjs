import {test, expect} from '@playwright/test';

/**
 * @summary A card's inline title edit takes the title's place: the card keeps its height, and the name its font and its
 * horizontal start. The harness is the plain two-card board of `board-form-control`.
 */
const BOARD = 'board-form-control-board',
      card  = page => page.locator(`[id="${BOARD}__card__r1"]`),
      // The card's height, and the font and text start of whichever node holds the name: the title, or the inline
      // field's input (whose text starts after its border and padding)
      read  = page => card(page).evaluate(node => {
          const input = node.querySelector('.neo-board-card-inline-editor input'),
                name  = input || node.querySelector('.neo-board-card-title'),
                style = getComputedStyle(name),
                range = document.createRange();

          range.selectNodeContents(name);

          return {
              font  : `${style.fontSize} ${style.fontWeight}`,
              height: node.getBoundingClientRect().height,
              textX : input ? input.getBoundingClientRect().x + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft) : range.getBoundingClientRect().x
          }
      });

test('a card keeps its height, and its name its font and place, while the title is edited in place', async ({page}) => {
    await page.goto('/test/playwright/component/apps/board-form-control/index.html');
    await expect(card(page)).toBeVisible();

    const before = await read(page);

    await card(page).locator('.neo-board-card-title').dblclick();
    await expect(card(page).locator('.neo-board-card-inline-editor input')).toBeFocused();

    const during = await read(page);

    expect(during.height, 'the card keeps its height').toBeCloseTo(before.height, 1);
    expect(during.font, 'the name keeps the title\'s font').toBe(before.font);
    expect(during.textX, 'and its place').toBeCloseTo(before.textX, 0);

    await page.keyboard.press('Escape');
    await expect(card(page).locator('.neo-board-card-inline-editor')).toHaveCount(0)
});

test('the name being edited keeps the board\'s focus ring once its field is focused', async ({page}) => {
    await page.goto('/test/playwright/component/apps/board-form-control/index.html');
    await card(page).locator('.neo-board-card-title').dblclick();

    // A focused field sets its input's outline from `--neo-textfield-outline-active`, with `!important`
    const input = card(page).locator('.neo-board-card-inline-editor.neo-focus input');

    await expect(input).toBeFocused();
    await expect(input).toHaveCSS('outline-style', 'solid');
    await expect(input).toHaveCSS('outline-width', '2px')
});
