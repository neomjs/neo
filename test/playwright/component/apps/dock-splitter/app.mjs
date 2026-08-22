import Viewport from '../../../../../src/container/Viewport.mjs';

/**
 * A viewport pinned to the NEO themes.
 *
 * `empty-viewport` inherits `DefaultConfig.themes`, which is
 * `['neo-theme-light', 'neo-theme-dark', 'neo-theme-neo-light']` — the legacy pair plus one neo
 * theme. Pinning both neo themes here keeps the witness measuring the documents the dock actually
 * ships into, rather than a legacy one where half the variables the engine floor mixes against were
 * never loaded.
 *
 * @see test/playwright/component/dashboard/DockSplitterPaint.spec.mjs
 */
export const onStart = () => Neo.app({
    mainView: {
        module: Viewport,
        id    : 'dock-splitter-test-viewport'
    },
    name: 'DockSplitterTestApp'
});
