import {test, expect} from '@playwright/test';

/**
 * A grid header label wider than its column ends in an ellipsis inside its own header instead of
 * painting over the header to its right. `grid/header/Button.scss` gave `.neo-button-text` no
 * overflow rule, so a composed label ("observed · Throughput") at a default width ran into the
 * next header ("queued · Pulse") and neither could be read. The fixture
 * (`apps/grid-header-ellipsis`) mounts two such 90 px columns side by side and a wide third one,
 * so the spec proves both arms: a long label is clipped to its header, a fitting label is not.
 * A click on the first header sorts it, and the sort glyph must still sit inside the header
 * next to the clipped label.
 */
const FIXTURE = 'test/playwright/component/apps/grid-header-ellipsis/index.html';

const HEADERS = '#grid-header-ellipsis .neo-grid-header-button';

/**
 * @param {import('@playwright/test').Page} page
 * @param {Number} index zero-based header position
 * @returns {Promise<Object>}
 */
const readHeader = (page, index) => page.locator(HEADERS).nth(index).evaluate(button => {
    const
        glyph     = button.querySelector('.neo-button-glyph'),
        text      = button.querySelector('.neo-button-text'),
        style     = getComputedStyle(text),
        buttonBox = button.getBoundingClientRect(),
        glyphBox  = glyph.getBoundingClientRect(),
        textBox   = text.getBoundingClientRect();

    return {
        buttonLeft  : buttonBox.left,
        buttonRight : buttonBox.right,
        buttonWidth : buttonBox.width,
        clientWidth : text.clientWidth,
        glyphLeft   : glyphBox.left,
        glyphRight  : glyphBox.right,
        glyphWidth  : glyphBox.width,
        overflow    : style.overflow,
        scrollWidth : text.scrollWidth,
        sorted      : button.classList.contains('neo-sort-asc'),
        textOverflow: style.textOverflow,
        textRight   : textBox.right
    }
});

test.describe('grid header text ellipsis', () => {
    test('a label wider than its column stays inside its own header', async ({page}) => {
        await page.setViewportSize({height: 600, width: 900});
        await page.goto(FIXTURE);
        await page.waitForSelector('#grid-header-ellipsis .neo-grid-header-button .neo-button-text', {state: 'visible'});

        const
            first  = await readHeader(page, 0),
            second = await readHeader(page, 1),
            third  = await readHeader(page, 2);

        expect(first.scrollWidth, 'the fixture label really is wider than its header').toBeGreaterThan(first.buttonWidth);

        expect(first.overflow,     'the label clips').toBe('hidden');
        expect(first.textOverflow, 'the label ends in an ellipsis').toBe('ellipsis');

        expect(first.textRight,  'the label does not reach past its header').toBeLessThanOrEqual(first.buttonRight + 0.5);
        expect(first.textRight,  'the label does not reach into the next header').toBeLessThanOrEqual(second.buttonLeft + 0.5);
        expect(second.textRight, 'the second long label is clipped the same way').toBeLessThanOrEqual(second.buttonRight + 0.5);

        expect(third.scrollWidth, 'a fitting label is left alone').toBeLessThanOrEqual(third.clientWidth)
    });

    test('a clipped header keeps its sort indicator inside the header', async ({page}) => {
        await page.setViewportSize({height: 600, width: 900});
        await page.goto(FIXTURE);
        await page.waitForSelector(`${HEADERS} .neo-button-text`, {state: 'visible'});

        const first = page.locator(HEADERS).first();

        await first.click();
        await expect(first).toHaveClass(/neo-sort-asc/);

        const header = await readHeader(page, 0);

        expect(header.sorted,       'the first header is sorted ascending').toBe(true);
        expect(header.scrollWidth,  'the label is still wider than its header').toBeGreaterThan(header.buttonWidth);
        expect(header.textOverflow, 'the label still ends in an ellipsis').toBe('ellipsis');
        expect(header.textRight,    'the label still stops inside its header').toBeLessThanOrEqual(header.buttonRight + 0.5);

        expect(header.glyphWidth, 'the sort glyph keeps its width').toBeGreaterThan(0);
        expect(header.glyphLeft,  'the sort glyph starts inside the header').toBeGreaterThanOrEqual(header.buttonLeft - 0.5);
        expect(header.glyphRight, 'the sort glyph ends inside the header').toBeLessThanOrEqual(header.buttonRight + 0.5);
        expect(header.glyphLeft,  'the label does not paint over the sort glyph').toBeGreaterThanOrEqual(header.textRight - 0.5)
    })
});
