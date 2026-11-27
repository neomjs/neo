import Viewport from '../../../../../src/container/Viewport.mjs';

/**
 * A viewport pinned to the NEO themes.
 *
 * `empty-viewport` inherits `DefaultConfig.themes`, which is
 * `['neo-theme-light', 'neo-theme-dark', 'neo-theme-neo-light']` — the legacy pair plus one neo
 * theme. The rail-tab regression under test lives in `.neo-button { min-width: var(--button-min-width) }`,
 * which the neo themes value at `--button-size-medium-height` (`32px`) while the legacy themes leave
 * it unset, so a witness running there measures a document where the competing floor was
 * never active and reports a comfortable green.
 *
 * @see test/playwright/component/dashboard/DockRailTabPaint.spec.mjs
 */
export const onStart = () => Neo.app({
    mainView: {
        module: Viewport,
        id    : 'dock-rail-test-viewport'
    },
    name: 'DockRailTestApp'
});
