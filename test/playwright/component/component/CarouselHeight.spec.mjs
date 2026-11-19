import {test, expect} from '@playwright/test';

/**
 * A Carousel's height config sizes its slides. The stylesheet used to hold the slide area at
 * 9rem, so a carousel configured 800 px high still showed a 144 px slide. The fixture
 * (`apps/carousel-height`) mounts carousels at 200 px, at 800 px and without a height, so the spec
 * measures both arms: the slide grows by exactly the configured difference, and an unconfigured
 * carousel keeps the 14rem default.
 */
const FIXTURE = 'test/playwright/component/apps/carousel-height/index.html';

/**
 * @param {import('@playwright/test').Page} page
 * @param {String} id the carousel's id in the fixture
 * @returns {Promise<Object>}
 */
const readCarousel = (page, id) => page.locator(`#${id}`).evaluate(root => {
    const
        inner     = root.querySelector('.neo-carousel-inner'),
        slide     = root.querySelector('.neo-carousel-item.neo-carousel-translate-x-0'),
        rootBox   = root.getBoundingClientRect(),
        innerBox  = inner.getBoundingClientRect(),
        slideBox  = slide.getBoundingClientRect();

    return {
        innerBottom: innerBox.bottom,
        innerHeight: innerBox.height,
        remPx      : parseFloat(getComputedStyle(document.documentElement).fontSize),
        rootBottom : rootBox.bottom,
        rootHeight : rootBox.height,
        slideHeight: slideBox.height
    }
});

test.describe('Carousel height', () => {
    test.beforeEach(async ({page}) => {
        await page.setViewportSize({height: 1000, width: 1100});
        await page.goto(FIXTURE);
        await page.waitForSelector('#carousel-default .neo-carousel-item.neo-carousel-translate-x-0', {state: 'visible'})
    });

    test('a configured height sizes the slide area', async ({page}) => {
        const
            small = await readCarousel(page, 'carousel-200'),
            large = await readCarousel(page, 'carousel-800');

        expect(small.rootHeight, 'the 200 px carousel is 200 px high').toBeCloseTo(200, 0);
        expect(large.rootHeight, 'the 800 px carousel is 800 px high').toBeCloseTo(800, 0);

        expect(large.slideHeight - small.slideHeight, 'the slide grows by the configured difference').toBeCloseTo(600, 0);

        for (const carousel of [small, large]) {
            expect(carousel.slideHeight, 'the slide fills the inner area').toBeCloseTo(carousel.innerHeight, 0);
            expect(carousel.innerBottom, 'the inner area ends inside the carousel').toBeLessThanOrEqual(carousel.rootBottom + 0.5)
        }
    });

    test('without a height, the carousel keeps its 14rem default', async ({page}) => {
        const carousel = await readCarousel(page, 'carousel-default');

        expect(carousel.rootHeight, 'the root is 14rem high').toBeCloseTo(14 * carousel.remPx, 0);
        expect(carousel.slideHeight, 'the slide is visible').toBeGreaterThan(0);
        expect(carousel.slideHeight, 'the slide fills the inner area').toBeCloseTo(carousel.innerHeight, 0)
    })
});
