import {test, expect} from '../../fixtures.mjs';

const
    EXAMPLE_URL = '/examples/board/cardDesigns/index.html',
    THEMES      = [
        'neo-theme-neo-dark',
        'neo-theme-neo-light',
        'neo-theme-light',
        'neo-theme-dark',
        'neo-theme-cyberpunk'
    ];

/**
 * @summary Resolves the dedicated App Worker for the current page.
 * @param {import('@playwright/test').Page} page
 * @returns {import('@playwright/test').Worker}
 */
function getAppWorker(page) {
    const worker = page.workers().find(candidate => candidate.url().includes('worker/App'));

    if (!worker) {
        throw new Error('App Worker not found for BoardCardDesigns')
    }

    return worker
}

/**
 * @summary Reads the live `Neo.board.Container` state (`cardItems` types, store count, and active design) from the App Worker.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object>}
 */
async function readWorkerState(page) {
    await expect.poll(() => page.workers().some(w => w.url().includes('worker/App'))).toBe(true);

    return getAppWorker(page).evaluate(() => {
        const
            viewport = [...globalThis.Neo.manager.Instance.items.values()]
                .find(inst => inst.className === 'Neo.examples.board.cardDesigns.Viewport'),
            board    = [...globalThis.Neo.manager.Instance.items.values()]
                .find(inst => inst.className === 'Neo.board.Container');

        return {
            articleCount: board?.store?.getCount() ?? 0,
            design      : viewport?.design ?? null,
            itemTypes   : (board?.cardItems || []).map(item => item.type)
        }
    })
}

test.describe('Board cardDesigns example', () => {
    test('switches Compact, Standard, and Detailed in place without reloading, preserves column scroll, and omits missing fields cleanly', async ({page}) => {
        const consoleErrors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') {
                consoleErrors.push(msg.text())
            }
        });
        page.on('pageerror', err => consoleErrors.push(err.message));

        await page.setViewportSize({width: 1440, height: 900});
        await page.goto(`${EXAMPLE_URL}?theme=neo-theme-neo-dark`);

        await expect(page.locator('.editorial-board .neo-board-column')).toHaveCount(5);
        await expect(page.locator('.editorial-board .neo-board-card')).toHaveCount(32);

        // Stamp a boot marker + positive-control delta counter to prove reload-free in-place re-renders
        await page.evaluate(() => {
            window.__editorialBootMarker = 'alive';
            window.__observedUpdates     = 0;
            window.__idlessInserts       = 0;
            globalThis.Neo.config.logDeltaUpdates = true;

            const orig = console.log.bind(console);
            console.log = (...args) => {
                if (typeof args[0] === 'string' && args[0].startsWith('update ')) {
                    window.__observedUpdates++;
                    const data   = args[3],
                          deltas = Array.isArray(data) ? data : (data?.deltas || []);
                    window.__idlessInserts += deltas.filter(d => d.action === 'insertNode' && !d.id && !d.vnode?.id).length
                }
                orig(...args)
            }
        });

        // 1. Detailed design at boot: all five item types on art-1, missing values omitted without gaps or "undefined"
        const initialState = await readWorkerState(page);
        expect(initialState).toEqual({
            articleCount: 32,
            design      : 'detailed',
            itemTypes   : ['title', 'text', 'tags', 'progress', 'avatars']
        });

        const
            card1       = page.locator('[id$="__card__art-1"]'),
            card2       = page.locator('[id$="__card__art-2"]'),
            card3       = page.locator('[id$="__card__art-3"]'),
            card20      = page.locator('[id$="__card__art-20"]'),
            btnCompact  = page.locator('.editorial-seg-btn', {hasText: 'Compact'}),
            btnStandard = page.locator('.editorial-seg-btn', {hasText: 'Standard'}),
            btnDetailed = page.locator('.editorial-seg-btn', {hasText: 'Detailed'});

        await expect(btnDetailed).toHaveAttribute('aria-pressed', 'true');
        await expect(btnStandard).toHaveAttribute('aria-pressed', 'false');
        await expect(btnCompact).toHaveAttribute('aria-pressed', 'false');

        // Detailed: art-1 renders all 5 item types (title, text, tags, progress, avatars with initials)
        await expect(card1.locator('.neo-board-card-title')).toContainText('North Sea tidal batteries');
        await expect(card1.locator('.neo-board-card-text')).toContainText('Wilhelmshaven');
        await expect(card1.locator('.neo-board-card-tag')).toHaveCount(2);
        await expect(card1.locator('.neo-board-card-progress')).toHaveAttribute('aria-valuenow', '25');
        await expect(card1.locator('.neo-board-card-avatar')).toHaveText(['ML', 'TV']);

        // Missing editor (art-2): 1 avatar ('NO'), no empty avatar slot
        await expect(card2.locator('.neo-board-card-avatar')).toHaveText(['NO']);

        // Missing tags & 0% progress & missing editor (art-3): tags and progress omitted, no empty gap, no "undefined"
        await expect(card3.locator('.neo-board-card-title')).toHaveText('Glass-free cryo-microscopy on a benchtop');
        await expect(card3.locator('.neo-board-card-text')).toContainText('Liquid-jet sample holders');
        await expect(card3.locator('.neo-board-card-tags')).toHaveCount(0);
        await expect(card3.locator('.neo-board-card-progress')).toHaveCount(0);
        await expect(card3.locator('.neo-board-card-avatar')).toHaveText(['HL']);

        // Missing author & editor (art-20): avatars container omitted completely
        await expect(card20.locator('.neo-board-card-avatars')).toHaveCount(0);

        const boardText = await page.locator('.editorial-board').innerText();
        expect(boardText).not.toContain('undefined');
        expect(boardText).not.toContain('null');

        // 2. Scroll the Idea column body, then switch Detailed -> Standard -> Compact -> Detailed and verify scrollTop persists
        const ideaBody = page.locator('.neo-board-column').first().locator('.neo-board-column-body');
        await ideaBody.evaluate(el => {
            el.scrollTop = 44
        });
        await expect.poll(() => ideaBody.evaluate(el => Math.round(el.scrollTop))).toBe(44);

        // Switch to Standard: card1 has title + tags + avatars (3 items); text and progress removed
        await btnStandard.click();
        await expect(btnStandard).toHaveAttribute('aria-pressed', 'true');
        await expect(btnDetailed).toHaveAttribute('aria-pressed', 'false');
        await expect(card1.locator('.neo-board-card-title')).toBeVisible();
        await expect(card1.locator('.neo-board-card-tag')).toHaveCount(2);
        await expect(card1.locator('.neo-board-card-avatar')).toHaveText(['ML', 'TV']);
        await expect(card1.locator('.neo-board-card-text')).toHaveCount(0);
        await expect(card1.locator('.neo-board-card-progress')).toHaveCount(0);
        expect(await ideaBody.evaluate(el => Math.round(el.scrollTop))).toBe(44);

        // Switch to Compact: card1 has title only (1 item); text, tags, progress, and avatars removed
        await btnCompact.click();
        await expect(btnCompact).toHaveAttribute('aria-pressed', 'true');
        await expect(btnStandard).toHaveAttribute('aria-pressed', 'false');
        await expect(card1.locator('.neo-board-card-title')).toBeVisible();
        await expect(card1.locator('.neo-board-card-text')).toHaveCount(0);
        await expect(card1.locator('.neo-board-card-tags')).toHaveCount(0);
        await expect(card1.locator('.neo-board-card-progress')).toHaveCount(0);
        await expect(card1.locator('.neo-board-card-avatars')).toHaveCount(0);
        expect(await ideaBody.evaluate(el => Math.round(el.scrollTop))).toBe(44);

        // Switch back to Detailed: all 5 items restored, scrollTop still 44, boot marker intact
        await btnDetailed.click();
        await expect(btnDetailed).toHaveAttribute('aria-pressed', 'true');
        await expect(card1.locator('.neo-board-card-text')).toBeVisible();
        await expect(card1.locator('.neo-board-card-progress')).toHaveAttribute('aria-valuenow', '25');
        expect(await ideaBody.evaluate(el => Math.round(el.scrollTop))).toBe(44);

        const deltaStats = await page.evaluate(() => ({
            bootMarker     : window.__editorialBootMarker,
            idlessInserts  : window.__idlessInserts,
            observedUpdates: window.__observedUpdates
        }));
        expect(deltaStats.bootMarker).toBe('alive');
        expect(deltaStats.observedUpdates).toBeGreaterThan(0);
        expect(deltaStats.idlessInserts).toBe(0);
        expect(consoleErrors).toEqual([])
    });

    test('renders cleanly at 1440x900 and 390x844 across all five shipped themes with two-line title clamping and custom controls', async ({page}) => {
        const consoleErrors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') {
                consoleErrors.push(msg.text())
            }
        });
        page.on('response', res => {
            if (res.status() === 404) {
                consoleErrors.push(`404:${res.url()}`)
            }
        });
        page.on('pageerror', err => consoleErrors.push(err.message));

        for (const viewport of [{width: 1440, height: 900}, {width: 390, height: 844}]) {
            await page.setViewportSize(viewport);

            for (const theme of THEMES) {
                await page.goto(`${EXAMPLE_URL}?theme=${theme}`);
                await expect(page.locator(`.editorial-viewport.${theme}`)).toBeVisible();
                await expect(page.locator('.editorial-board .neo-board-column')).toHaveCount(5);

                const styleMetrics = await page.evaluate(() => {
                    const
                        seg   = document.querySelector('.editorial-segmented'),
                        title = document.querySelector('[id$="__card__art-1"] .neo-board-card-title');

                    return {
                        lineClamp: title ? getComputedStyle(title).webkitLineClamp : null,
                        segRadius: seg   ? getComputedStyle(seg).borderRadius      : null
                    }
                });
                expect(styleMetrics.segRadius).toBe('999px');
                expect(styleMetrics.lineClamp).toBe('2')
            }
        }

        expect(consoleErrors).toEqual([])
    })
});
