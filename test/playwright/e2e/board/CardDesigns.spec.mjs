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
            btnCompact  = page.locator('.neo-segmented-button > .neo-button', {hasText: 'Compact'}),
            btnStandard = page.locator('.neo-segmented-button > .neo-button', {hasText: 'Standard'}),
            btnDetailed = page.locator('.neo-segmented-button > .neo-button', {hasText: 'Detailed'});

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

    test('navigates and activates the reusable segmented control without losing Board state', async ({page}) => {
        await page.goto(`${EXAMPLE_URL}?theme=neo-theme-neo-dark`);

        const control  = page.locator('.neo-segmented-button'),
              compact  = control.locator(':scope > .neo-button', {hasText: 'Compact'}),
              standard = control.locator(':scope > .neo-button', {hasText: 'Standard'}),
              detailed = control.locator(':scope > .neo-button', {hasText: 'Detailed'}),
              card     = page.locator('[id$="__card__art-1"]');

        await expect(control).toBeVisible();
        await expect(control).toHaveAccessibleName('Card design');
        const id = await control.getAttribute('id');
        expect(id).toBeTruthy();
        const worker = getAppWorker(page);
        expect(await worker.evaluate(id => {
            const component = Neo.getComponent(id);
            return {className: component.className, value: component.value}
        }, id)).toEqual({className: 'Neo.button.Segmented', value: 'detailed'});
        await expect(detailed).toHaveAttribute('aria-pressed', 'true');

        // Navigation moves focus, while activation alone changes the selected design.
        await detailed.focus();
        await page.keyboard.press('Home');
        await expect(compact).toBeFocused();
        await expect(detailed).toHaveAttribute('aria-pressed', 'true');
        await page.keyboard.press('ArrowRight');
        await expect(standard).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(standard).toHaveAttribute('aria-pressed', 'true');
        await expect(standard).toBeFocused();
        await expect.poll(async () => (await readWorkerState(page)).design).toBe('standard');
        await expect(card.locator('.neo-board-card-text')).toHaveCount(0);
        await page.keyboard.press('End');
        await expect(detailed).toBeFocused();
        await page.keyboard.press('ArrowLeft');
        await expect(standard).toBeFocused();
        await page.keyboard.press('ArrowLeft');
        await expect(compact).toBeFocused();
        await page.keyboard.press('Space');
        await expect(compact).toHaveAttribute('aria-pressed', 'true');
        await expect(compact).toBeFocused();
        await expect.poll(async () => (await readWorkerState(page)).design).toBe('compact');
        await expect(card.locator('.neo-board-card-tags')).toHaveCount(0);

        // A disabled middle choice is skipped by the real toolbar navigator.
        await worker.evaluate(({id, choices}) => { Neo.getComponent(id).choices = choices }, {id, choices: [
            {value: 'compact', text: 'Compact'},
            {value: 'standard', text: 'Standard', disabled: true},
            {value: 'detailed', text: 'Detailed'}
        ]});
        await expect(standard).toBeDisabled();
        await compact.focus();
        await page.keyboard.press('ArrowRight');
        await expect(detailed).toBeFocused();
        await expect(compact).toHaveAttribute('aria-pressed', 'true');
        await detailed.click();
        await expect(detailed).toHaveAttribute('aria-pressed', 'true');
        await expect.poll(async () => (await readWorkerState(page)).design).toBe('detailed');
        await expect(card.locator('.neo-board-card-text')).toBeVisible();

        // Programmatic writes travel through the same control-to-Board path.
        await worker.evaluate(id => { Neo.getComponent(id).value = 'compact' }, id);
        await expect(compact).toHaveAttribute('aria-pressed', 'true');
        await expect(detailed).toHaveAttribute('aria-pressed', 'false');
        await expect.poll(async () => (await readWorkerState(page)).design).toBe('compact');
        expect(await worker.evaluate(id => Neo.getComponent(id).value, id)).toBe('compact');

        const viewportId = await page.locator('.editorial-viewport').getAttribute('id');
        expect(viewportId).toBeTruthy();
        await worker.evaluate(id => { Neo.getComponent(id).design = 'detailed' }, viewportId);
        await expect(detailed).toHaveAttribute('aria-pressed', 'true');
        await expect(compact).toHaveAttribute('aria-pressed', 'false');
        await expect(card.locator('.neo-board-card-text')).toBeVisible();
        expect(await worker.evaluate(id => Neo.getComponent(id).value, id)).toBe('detailed');

        // Replacing descriptors keeps the same buttons: losing the current tab stop must not
        // strand keyboard users outside the group, including after a group disable/enable cycle.
        await worker.evaluate(({id, choices}) => { Neo.getComponent(id).choices = choices }, {id, choices: [
            {value: 'compact', text: 'Compact'},
            {value: 'standard', text: 'Standard'},
            {value: 'detailed', text: 'Detailed'}
        ]});
        await compact.focus();
        await expect(compact).toHaveAttribute('tabindex', '0');
        await page.evaluate(id => {
            const button = document.createElement('button');
            button.id = 'segmented-tab-probe';
            document.getElementById(id).before(button)
        }, id);
        const probe = page.locator('#segmented-tab-probe');
        await probe.focus();
        await worker.evaluate(({id, choices}) => { Neo.getComponent(id).choices = choices }, {id, choices: [
            {value: 'compact', text: 'Compact', disabled: true},
            {value: 'standard', text: 'Standard'},
            {value: 'detailed', text: 'Detailed'}
        ]});
        await expect(compact).toBeDisabled();
        await expect(standard).toHaveAttribute('tabindex', '0');
        await page.keyboard.press('Tab');
        await expect(standard).toBeFocused();
        await worker.evaluate(id => { Neo.getComponent(id).disabled = true }, id);
        await expect(standard).toBeDisabled();
        await worker.evaluate(id => { Neo.getComponent(id).disabled = false }, id);
        await expect(standard).toBeEnabled();
        await expect(standard).toHaveAttribute('tabindex', '0');
        await probe.focus();
        await page.keyboard.press('Tab');
        await expect(standard).toBeFocused()
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
