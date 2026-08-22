import Viewport from '../../../../../src/container/Viewport.mjs';

/**
 * A viewport pinned to the NEO themes.
 *
 * `empty-viewport` inherits `DefaultConfig.themes`, which is
 * `['neo-theme-light', 'neo-theme-dark', 'neo-theme-neo-light']` — the legacy pair plus one neo
 * theme. The rail-tab regression under test lives in the neo themes' generic button floor
 * (`:root .neo-theme-neo-* .neo-button { min-width: var(--cmp-button-height) }`), which the legacy
 * themes do not carry, so a witness running there measures a document where the competing rule was
 * never loaded and reports a comfortable green.
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
