import {expect, test}              from '../../fixtures.mjs';
import {contrastRatio, parseColor} from '../../../../buildScripts/util/check-theme-palette.mjs';

const
    PAGES  = ['/examples/scheduler/basic/index.html', '/examples/scheduler/resourceColumns/index.html', '/examples/gantt/basic/index.html'],
    THEMES = ['neo-theme-neo-light', 'neo-theme-neo-dark', 'neo-theme-light', 'neo-theme-dark', 'neo-theme-cyberpunk'];

/**
 * @summary Returns the WCAG contrast ratio of two computed colours, measured by the palette check. A role of theme Neo
 * computes as `oklch()`, so the colours are not read as `rgb()` channels.
 * @param {String} a
 * @param {String} b
 * @returns {Number}
 */
function contrast(a, b) {
    return contrastRatio(parseColor(a).rgba.slice(0, 3), parseColor(b).rgba.slice(0, 3))
}

/**
 * @summary Reads the timeline header's surface and every other header button of the page's scheduler or Gantt. A
 * surface is a colour in some themes and a gradient in others, so both properties are read; `ground` is the colour
 * text sits on: the background colour, or a gradient's first stop.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{surface: Object, headers: Object[]}>}
 */
function readHeaders(page) {
    return page.evaluate(() => {
        const
            read    = el => {
                const {backgroundColor, backgroundImage} = getComputedStyle(el), opaque = !/rgba\(.*,\s*0\)$/.test(backgroundColor);
                return {color: backgroundColor, ground: opaque ? backgroundColor : backgroundImage.match(/(?:rgba?|oklch)\([^)]+\)/)?.[0], image: backgroundImage}
            },
            buttons = [...document.querySelectorAll('.neo-grid-header-toolbar .neo-grid-header-button:not(.neo-timeline-header)')];

        return {
            surface: read(document.querySelector('.neo-timeline-header')),
            headers: buttons.map(button => ({
                alignRight: button.classList.contains('neo-header-align-right'),
                justify   : getComputedStyle(button).justifyContent,
                surface   : read(button),
                text      : button.textContent.trim(),
                textColor : getComputedStyle(button.querySelector('.neo-button-text') || button).color
            }))
        }
    })
}

test('the column headers beside a timeline wear the timeline header surface in every theme', async ({page}) => {
    await page.setViewportSize({width: 1440, height: 900});

    for (const url of PAGES) {
        for (const theme of THEMES) {
            await page.goto(`${url}?theme=${theme}`);
            await expect(page.locator(`.${theme}`).first()).toBeAttached();
            await expect(page.locator('.neo-timeline-header').first()).toBeVisible();

            const {surface, headers} = await readHeaders(page);
            expect(headers.length, `${url} ${theme}: column headers`).toBeGreaterThan(0);
            expect(surface.ground, `${url} ${theme}: the timeline header has a surface`).toBeTruthy();

            for (const header of headers) {
                const where = `${url} ${theme} "${header.text}"`;

                expect(header.surface, where).toEqual(surface);
                expect(contrast(header.textColor, header.surface.ground), where).toBeGreaterThanOrEqual(4.5);
                header.alignRight || expect(header.justify, where).toMatch(/start/)
            }
        }
    }
});

test('a sortable column header lights on hover in the header palette and stays legible', async ({page}) => {
    await page.setViewportSize({width: 1440, height: 900});

    for (const theme of THEMES) {
        await page.goto(`/examples/scheduler/resourceColumns/index.html?theme=${theme}`);
        await expect(page.locator('.neo-timeline-header').first()).toBeVisible();

        const
            technician = page.locator('.neo-grid-header-button:not(.neo-timeline-header)', {hasText: 'Technician'}),
            shadow     = () => technician.evaluate(el => getComputedStyle(el).boxShadow),
            rest       = await shadow();

        await technician.hover();

        // The tint is an inset overlay over the unchanged surface
        await expect.poll(shadow, theme).toContain('inset');
        expect(await shadow(), theme).not.toBe(rest);

        const {headers} = await readHeaders(page), hovered = headers.find(header => header.text.startsWith('Technician'));
        expect(hovered.surface.ground, `${theme}: ${JSON.stringify(hovered)}`).toBeTruthy();
        expect(contrast(hovered.textColor, hovered.surface.ground), theme).toBeGreaterThanOrEqual(4.5)
    }
});
