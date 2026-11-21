import {test, expect} from '../../fixtures.mjs';

const EXAMPLE_URL = '/examples/board/columns/index.html';

const THEMES = [
    'neo-theme-neo-light',
    'neo-theme-neo-dark',
    'neo-theme-light',
    'neo-theme-dark',
    'neo-theme-cyberpunk'
];

test.describe('Board column arrangement example (#21632)', () => {
    test('reorders unlocked columns by header drag, keeps locked Delivered at index 5, folds/opens by click and keyboard, and resets to first frame', async ({page}) => {
        const errors = [];

        await page.route('**/favicon.ico', route => route.fulfill({status: 204, body: ''}));
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
            inWorkCol    = page.locator('.neo-board-column[id$="__col__in-work"]'),
            reviewCol    = page.locator('.neo-board-column[id$="__col__review"]'),
            archiveCol   = page.locator('.neo-board-column[id$="__col__archive"]'),
            deliveredCol = page.locator('.neo-board-column[id$="__col__delivered"]'),
            orderValue   = page.locator('.studio-order-value'),
            resetBtn     = page.locator('.studio-reset-btn');

        await expect(reviewCol).toBeVisible();
        await expect(archiveCol).toBeVisible();
        await expect(deliveredCol).toBeVisible();

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

        // AC-1 & AC-5: First frame shows folded Archive with readable vertical title & count 3, and locked Delivered with lock glyph at index 5
        await expect(archiveCol).toHaveClass(/neo-board-column-collapsed/);
        await expect(archiveCol.locator('.neo-board-column-title')).toHaveText('Archive');
        await expect(archiveCol.locator('.neo-board-column-count')).toHaveText('3');
        const archiveTitleBox = await archiveCol.locator('.neo-board-column-title').boundingBox();
        expect(archiveTitleBox.height).toBeGreaterThan(24);

        await expect(deliveredCol).toHaveClass(/neo-board-column-locked/);
        await expect(deliveredCol.locator('.neo-board-column-header')).toHaveAttribute('aria-disabled', 'true');
        await expect(deliveredCol.locator('.neo-board-column-lock')).toHaveText('🔒');
        await expect(deliveredCol.locator('.neo-board-column-count')).toHaveText('3');
        await expect(orderValue).toHaveText('Enquiry → Quote → In work → Review → Archive → Delivered');

        const readDomColumns = () => page.evaluate(() =>
            [...document.querySelectorAll('.neo-board-column')].map((el, index) => ({
                collapsed: el.classList.contains('neo-board-column-collapsed'),
                count    : Number(el.querySelector('.neo-board-column-count')?.textContent),
                index,
                locked   : el.classList.contains('neo-board-column-locked'),
                status   : el.id.split('__col__')[1]
            }))
        );

        let state = await readDomColumns();
        expect(state.map(c => c.status)).toEqual(['enquiry', 'quote', 'in-work', 'review', 'archive', 'delivered']);
        expect(state[4]).toMatchObject({status: 'archive', collapsed: true, count: 3});
        expect(state[5]).toMatchObject({status: 'delivered', locked: true, index: 5});

        // AC-2: Drag Review header in front of In work; order line follows
        const
            reviewHeaderBox = await reviewCol.locator('.neo-board-column-header').boundingBox(),
            inWorkHeaderBox = await inWorkCol.locator('.neo-board-column-header').boundingBox();

        await page.mouse.move(reviewHeaderBox.x + 80, reviewHeaderBox.y + 18);
        await page.mouse.down();
        await page.mouse.move(reviewHeaderBox.x + 60, reviewHeaderBox.y + 18, {steps: 4});
        await expect(page.locator('.neo-dragproxy')).toBeVisible();
        await page.mouse.move(inWorkHeaderBox.x + 24, inWorkHeaderBox.y + 18, {steps: 14});
        await page.mouse.up();

        await expect(orderValue).toHaveText('Enquiry → Quote → Review → In work → Archive → Delivered');
        state = await readDomColumns();
        expect(state.map(c => c.status)).toEqual(['enquiry', 'quote', 'review', 'in-work', 'archive', 'delivered']);
        expect(state[5]).toMatchObject({status: 'delivered', locked: true, index: 5});

        // AC-2: Trying to drag locked Delivered moves nothing
        const deliveredHeaderBox = await deliveredCol.locator('.neo-board-column-header').boundingBox();
        await page.mouse.move(deliveredHeaderBox.x + 80, deliveredHeaderBox.y + 18);
        await page.mouse.down();
        await page.mouse.move(inWorkHeaderBox.x + 40, inWorkHeaderBox.y + 18, {steps: 10});
        await page.mouse.up();

        await expect(orderValue).toHaveText('Enquiry → Quote → Review → In work → Archive → Delivered');

        // AC-2: Dragging an unlocked column all the way past Delivered never displaces Delivered from index 5
        const movedReviewBox = await reviewCol.locator('.neo-board-column-header').boundingBox();
        await page.mouse.move(movedReviewBox.x + 80, movedReviewBox.y + 18);
        await page.mouse.down();
        await page.mouse.move(movedReviewBox.x + 100, movedReviewBox.y + 18, {steps: 4});
        await page.mouse.move(deliveredHeaderBox.x + deliveredHeaderBox.width - 10, deliveredHeaderBox.y + 18, {steps: 16});
        await page.mouse.up();

        await expect(orderValue).toHaveText('Enquiry → Quote → In work → Archive → Review → Delivered');
        state = await readDomColumns();
        expect(state[5]).toMatchObject({status: 'delivered', locked: true, index: 5});

        // AC-3: Open Archive by click, then fold via keyboard Space and re-open via keyboard Enter
        const archiveToggle = archiveCol.locator('.neo-board-column-collapse');
        await archiveToggle.click();
        await expect(archiveCol).not.toHaveClass(/neo-board-column-collapsed/);
        await expect(archiveToggle).toHaveAttribute('aria-expanded', 'true');

        await archiveToggle.focus();
        await page.keyboard.press('Space');
        await expect(archiveCol).toHaveClass(/neo-board-column-collapsed/);
        await expect(archiveToggle).toHaveAttribute('aria-expanded', 'false');

        await page.keyboard.press('Enter');
        await expect(archiveCol).not.toHaveClass(/neo-board-column-collapsed/);
        await expect(archiveToggle).toHaveAttribute('aria-expanded', 'true');

        // AC-4: Reset button restores the exact first frame (order + folded Archive + locked Delivered)
        await expect(resetBtn).toHaveClass(/is-customized/);
        await resetBtn.click();

        await expect(orderValue).toHaveText('Enquiry → Quote → In work → Review → Archive → Delivered');
        await expect(archiveCol).toHaveClass(/neo-board-column-collapsed/);
        await expect(archiveCol.locator('.neo-board-column-count')).toHaveText('3');
        await expect(resetBtn).not.toHaveClass(/is-customized/);

        state = await readDomColumns();
        expect(state.map(c => c.status)).toEqual(['enquiry', 'quote', 'in-work', 'review', 'archive', 'delivered']);
        expect(state[4]).toMatchObject({status: 'archive', collapsed: true, count: 3});
        expect(state[5]).toMatchObject({status: 'delivered', locked: true, index: 5});

        expect(await page.evaluate(() => window.__idlessInserts)).toBe(0);
        expect(errors).toEqual([])
    });

    test('renders cleanly across all five configured themes at 1440x900 and 390x844 with styled reset button', async ({page}) => {
        const errors = [];

        await page.route('**/favicon.ico', route => route.fulfill({status: 204, body: ''}));
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

                const
                    archiveCol   = page.locator('.neo-board-column[id$="__col__archive"]'),
                    deliveredCol = page.locator('.neo-board-column[id$="__col__delivered"]'),
                    resetBtn     = page.locator('.studio-reset-btn');

                await expect(archiveCol).toBeVisible();
                await expect(deliveredCol).toBeVisible();
                await expect(archiveCol.locator('.neo-board-column-count')).toHaveText('3');
                await expect(deliveredCol.locator('.neo-board-column-lock')).toHaveText('🔒');

                // AC-7: Reset button does not keep default browser styling
                const btnStyle = await resetBtn.evaluate(el => {
                    const s = getComputedStyle(el);
                    return {borderRadius: parseFloat(s.borderRadius), borderStyle: s.borderTopStyle}
                });
                expect(btnStyle.borderRadius).toBeGreaterThanOrEqual(12);
                expect(btnStyle.borderStyle).toBe('solid')
            }
        }

        expect(errors).toEqual([])
    });
});
