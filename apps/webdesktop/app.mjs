import PopupViewport from '../../src/desktop/PopupViewport.mjs';
import Viewport      from './view/Viewport.mjs';

/**
 * @summary Starts the desktop or the child viewport that hosts a torn-out app.
 * @returns {Neo.controller.Application}
 */
export const onStart = () => {
    const windowId = Neo.bootingWindowId,
          config   = Neo.windowConfigs?.[windowId] || Neo.config,
          popup    = new URLSearchParams(config.url?.search).has('desktopPopup');

    return Neo.app({
        mainView: popup ? PopupViewport : Viewport,
        name    : popup ? 'WebDesktopPopup' : 'WebDesktop',
        windowId
    })
};
