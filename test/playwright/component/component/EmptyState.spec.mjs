import {test, expect} from '@playwright/test';

let componentId;

test.beforeEach(async ({page}) => {
    componentId = null;
    await page.goto('test/playwright/component/apps/empty-viewport/index.html');
    await page.waitForSelector('#component-test-viewport', {state: 'attached'});
});

test.afterEach(async ({page}) => {
    if (componentId) {
        const result = await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), componentId);
        expect(result.success).toBe(true)
    }
});

test.describe('Neo.component.EmptyState browser contract', () => {
    test('exposes accessible text and keyboard-activatable button via Enter and Space without overflowing narrow 320px layout', async ({page}) => {
        await page.setViewportSize({width: 320, height: 640});

        componentId = await page.evaluate(async () => {
            window.__emptyStateActivations = 0;

            const result = await Neo.worker.App.createNeoInstance({
                actionIconCls: 'fa fa-xmark',
                actionText   : 'Clear active filter and show all entries',
                description  : 'Try a broader keyword such as grid, date or dashboard, or reset the active filter.',
                importPath   : '../component/EmptyState.mjs',
                ntype        : 'empty-state',
                parentId     : 'component-test-viewport',
                text         : 'No matching entries in this view.'
            });

            if (!result.success) throw new Error(result.error.message);
            return result.id
        });

        const root   = page.locator(`#${componentId}`),
              button = root.getByRole('button', {name: 'Clear active filter and show all entries'});

        await expect(root).toBeVisible();
        await expect(root.locator('.neo-empty-state-title')).toHaveText('No matching entries in this view.');
        await expect(root.locator('.neo-empty-state-description')).toContainText('Try a broader keyword');
        await expect(root.locator('.neo-empty-state-glyph')).toHaveCount(0);
        await expect(button).toBeVisible();
        await expect(root.locator('.neo-empty-state-action-glyph')).toHaveAttribute('aria-hidden', 'true');

        // Narrow 320px layout: zero horizontal overflow on root, paragraphs, or multi-word action button
        const layout = await root.evaluate(el => {
            const rect    = el.getBoundingClientRect(),
                  btnRect = el.querySelector('.neo-empty-state-action').getBoundingClientRect();

            return {
                buttonFits  : btnRect.left >= rect.left - 0.5 && btnRect.right <= rect.right + 0.5,
                fitsViewport: rect.right <= window.innerWidth + 0.5,
                overflowX   : el.scrollWidth > el.clientWidth + 1
            }
        });

        expect(layout).toEqual({
            buttonFits  : true,
            fitsViewport: true,
            overflowX   : false
        });

        // Keyboard focus + Enter and Space native button activation
        await page.evaluate(id => {
            window.__clickDetails = [];
            document.getElementById(id).querySelector('button').addEventListener('click', e => {
                window.__clickDetails.push(e.detail)
            })
        }, componentId);

        await page.keyboard.press('Tab');
        await expect(button).toBeFocused();
        await page.keyboard.press('Enter');
        await page.keyboard.press('Space');

        expect(await page.evaluate(() => window.__clickDetails)).toEqual([0, 0])
    });

    for (const theme of ['neo-theme-dark', 'neo-theme-light']) {
        test(`${theme}: title, description, and action button meet >= 4.5:1 WCAG AA contrast`, async ({page}) => {
            componentId = await page.evaluate(async () => {
                const result = await Neo.worker.App.createNeoInstance({
                    actionText : 'Clear search',
                    description: 'Supporting guidance stays legible.',
                    importPath : '../component/EmptyState.mjs',
                    ntype      : 'empty-state',
                    parentId   : 'component-test-viewport',
                    text       : 'No results found.'
                });

                if (!result.success) throw new Error(result.error.message);
                return result.id
            });

            const root = page.locator(`#${componentId}`);
            await expect(root).toBeVisible();

            const ratios = await page.evaluate(({id, theme}) => {
                document.querySelectorAll('[class*="neo-theme-"]').forEach(node => {
                    node.className = node.className.replace(/neo-theme-[a-z-]+/, theme)
                });

                const parseRgb = str => {
                    const m = str.match(/rgba?\(([^)]+)\)/);
                    if (!m) return [0, 0, 0, 1];
                    const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
                    return [parts[0], parts[1], parts[2], parts[3] ?? 1]
                };
                const lum = ([r, g, b]) => {
                    const ch = v => {
                        v /= 255;
                        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
                    };
                    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)
                };
                const contrast = (fg, bg) => {
                    const l1 = lum(fg), l2 = lum(bg);
                    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
                };

                const el      = document.getElementById(id),
                      bg      = parseRgb(getComputedStyle(el).backgroundColor),
                      titleFg = parseRgb(getComputedStyle(el.querySelector('.neo-empty-state-title')).color),
                      descFg  = parseRgb(getComputedStyle(el.querySelector('.neo-empty-state-description')).color),
                      btn     = el.querySelector('.neo-empty-state-action'),
                      btnBg   = parseRgb(getComputedStyle(btn).backgroundColor),
                      btnFg   = parseRgb(getComputedStyle(btn).color);

                return {
                    action     : contrast(btnFg, btnBg),
                    description: contrast(descFg, bg),
                    title      : contrast(titleFg, bg)
                }
            }, {id: componentId, theme});

            expect(ratios.title).toBeGreaterThanOrEqual(4.5);
            expect(ratios.description).toBeGreaterThanOrEqual(4.5);
            expect(ratios.action).toBeGreaterThanOrEqual(4.5)
        })
    }

    test('inherits ancestor --button-* sizing tokens for action chrome and preserves full title prominence when text-only', async ({page}) => {
        componentId = await page.evaluate(async () => {
            const result = await Neo.worker.App.createNeoInstance({
                actionText: 'Clear (Esc)',
                importPath: '../component/EmptyState.mjs',
                ntype     : 'empty-state',
                parentId  : 'component-test-viewport',
                text      : 'Select a file or a folder to see its details.'
            });

            if (!result.success) throw new Error(result.error.message);
            return result.id
        });

        const root = page.locator(`#${componentId}`);
        await expect(root).toBeVisible();

        const withAction = await page.evaluate(id => {
            const viewport = document.getElementById('component-test-viewport');
            viewport.style.setProperty('--neo-button-height', '48px');
            viewport.style.setProperty('--neo-button-padding', '0 16px');
            viewport.style.setProperty('--neo-button-text-font-size', '16px');

            const el    = document.getElementById(id),
                  title = getComputedStyle(el.querySelector('.neo-empty-state-title')),
                  btn   = el.querySelector('.neo-empty-state-action');

            return {
                buttonFontSize: getComputedStyle(btn).fontSize,
                buttonHeight  : Math.round(btn.getBoundingClientRect().height),
                titleColor    : title.color,
                titleFontSize : title.fontSize,
                titleWeight   : title.fontWeight
            }
        }, componentId);

        expect(withAction.buttonHeight).toBe(48);
        expect(withAction.buttonFontSize).toBe('16px');

        await page.evaluate(id => Neo.worker.App.setConfigs({id, actionText: null}), componentId);
        await expect(root.locator('.neo-empty-state-actions')).toHaveCount(0);

        const textOnly = await page.evaluate(id => {
            const title = getComputedStyle(document.getElementById(id).querySelector('.neo-empty-state-title'));
            return {
                titleColor   : title.color,
                titleFontSize: title.fontSize,
                titleWeight  : title.fontWeight
            }
        }, componentId);

        expect(textOnly, 'sole message keeps full title typography rather than demoting to description style').toEqual({
            titleColor   : withAction.titleColor,
            titleFontSize: withAction.titleFontSize,
            titleWeight  : withAction.titleWeight
        })
    })
});
