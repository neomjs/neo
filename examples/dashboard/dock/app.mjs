import MainContainer from './MainContainer.mjs';
import Viewport      from '../../../src/container/Viewport.mjs';

/**
 * @summary Builds the standalone example's application composition: a real Viewport root containing
 * the dock workspace as its flex child. Root mounting and body ownership stay with the Viewport;
 * `MainContainer` owns only the docking surface.
 * @returns {Object} Neo.app-compatible mainView config.
 */
export const buildMainView = () => ({
    module: Viewport,
    items : [{module: MainContainer, flex: 1}]
});

export const onStart = () => Neo.app({
    mainView: buildMainView(),
    name    : 'Neo.examples.dashboard.dock'
});
