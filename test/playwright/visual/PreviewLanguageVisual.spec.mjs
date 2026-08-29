import {test, expect} from '@playwright/test';

/**
 * The preview-language specimen pair — visual-regression baselines for the design-exploration
 * switch: DEFAULT vs SIGNAL GLOW, side by side on one board, captured per color mode. A diff
 * here means a DESIGN regression on the affordance language (an off-alias chroma, a lost ring,
 * a fallback silently replacing a projected token), never content churn.
 *
 * The board is a deterministic composition of the REAL affordance classes (indicator chip,
 * hover-locked chip, accepted zone preview, accepted split bar) under the two scopes — the
 * same elements a live drag renders, without a live drag's nondeterminism. The capture scopes
 * to the board element only, so the living workstation behind it never affects the goldens.
 *
 * Baselines refresh ONLY via `--update-snapshots` under the visual config — a refreshed
 * golden is a reviewed design decision (the PR diff is the review surface).
 */
test.describe('Preview design language — the candidate specimen pair', () => {
    test.setTimeout(120000);

    test.skip(process.env.NEO_TEST_SKIP_CI === 'true', 'visual baselines are rendered-platform artifacts — local harness only');

    /**
     * Boots the workstation settled and mounts the deterministic specimen board.
     * @param {Object} page
     */
    const bootSpecimen = async page => {
        await page.goto('/apps/workstation/index.html');
        await expect(page.locator('.workstation-dock-host')).toBeVisible({timeout: 60000});
        await page.evaluate(() => document.fonts.ready);
        await expect(page.locator('.neo-dashboard-dock-animating')).toHaveCount(0);

        // The workstation composes the preview renderer with the affordance-layers leaf; until
        // that merges, its CSS map does not load the DockPreview skin — inject the compiled
        // sheet so the specimen renders the REAL zone/split treatments being compared.
        await page.evaluate(async () => {
            if (![...document.styleSheets].some(sheet => sheet.href?.includes('dashboard/dock/interaction/Preview.css'))) {
                await new Promise(resolve => {
                    const link = document.createElement('link');

                    link.rel  = 'stylesheet';
                    link.href = '/dist/development/css/src/dashboard/dock/interaction/Preview.css';
                    link.onload = link.onerror = resolve;
                    document.head.appendChild(link)
                })
            }
        });

        await page.evaluate(() => {
            document.getElementById('g5-specimen')?.remove();

            const board = document.createElement('div');

            board.id = 'g5-specimen';
            board.style.cssText = 'position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;display:flex;gap:16px;'
                + 'padding:16px;background:var(--workstation-ground,#0b0e13);border:1px solid var(--workstation-line,#262f3d);'
                + 'border-radius:10px;font:12px system-ui;color:var(--workstation-ink,#d6dce6)';

            const mkCol = (title, cls) => {
                const col = document.createElement('div');

                col.className = cls;
                col.style.cssText = 'flex:1;display:flex;flex-direction:column;gap:10px;position:relative';
                col.innerHTML = `<b style="letter-spacing:.08em">${title}</b>`;

                const row = document.createElement('div');

                row.style.cssText = 'display:flex;gap:10px;align-items:center';

                ['', ' neo-dashboard-dock-drop-indicator-active'].forEach(state => {
                    const chip = document.createElement('div');

                    chip.className = `neo-dashboard-dock-drop-indicator${state}`;
                    chip.style.cssText = 'position:relative;width:26px;height:26px';
                    row.appendChild(chip)
                });

                const previewWrap = document.createElement('div');

                previewWrap.className = 'neo-dock-preview';
                previewWrap.style.cssText = 'position:relative;height:74px';

                const zone = document.createElement('div');

                zone.className = 'neo-dock-preview-affordance neo-dock-preview-edge neo-dock-preview-accepted';
                zone.style.cssText = 'position:absolute;inset:0';

                const bar = document.createElement('div');

                bar.className = 'neo-dock-preview-affordance neo-dock-preview-split neo-dock-preview-accepted';
                bar.style.cssText = 'position:absolute;left:46%;top:8px;bottom:8px;width:5px';

                previewWrap.append(zone, bar);
                col.append(row, previewWrap);

                return col
            };

            board.append(
                mkCol('DEFAULT',     'neo-dashboard'),
                mkCol('SIGNAL GLOW', 'neo-dashboard neo-preview-lang-signal')
            );

            // Mount INSIDE the themed subtree: the workstation's theme class rides an inner
            // root, not <body> — a body-mounted board would silently resolve dark fallbacks
            // in both modes (the fallback-masking class this whole cycle exists to kill).
            document.querySelector('.workstation-workspace').appendChild(board)
        });

        await expect(page.locator('#g5-specimen')).toBeVisible()
    };

    test('the pair in dark mode — projected aliases, not fallbacks', async ({page}) => {
        await bootSpecimen(page);

        await expect(page.locator('#g5-specimen')).toHaveScreenshot('preview-language-pair-dark.png')
    });

    test('the pair in light mode — the daylight deep-pigment signal', async ({page}) => {
        await bootSpecimen(page);

        await page.locator('button, .neo-button').filter({hasText: /light mode/i}).first().click();

        // Settle on a SIGNAL, never a sleep: the swap is done when the app palette computes
        // to the daylight ground on the dock host (the light theme file has loaded + applied).
        await page.waitForFunction(() =>
            getComputedStyle(document.querySelector('.workstation-dock-host'))
                .getPropertyValue('--workstation-ground').trim() === '#f2f5f9'
        , null, {timeout: 15000});
        await page.evaluate(() => document.fonts.ready);

        await expect(page.locator('#g5-specimen')).toHaveScreenshot('preview-language-pair-light.png')
    })
});
