import PopupViewport from '../../../src/container/Viewport.mjs';
import Viewport      from './Viewport.mjs';

/**
 * @summary Starts the desktop or its empty popup host in the theme carried by this window.
 * @returns {Neo.controller.Application}
 */
export const onStart = () => {
    const
        windowId      = Neo.bootingWindowId,
        {themes, url} = Neo.windowConfigs?.[windowId] || Neo.config,
        params        = new URLSearchParams(url?.search),
        requested     = params.get('theme'),
        theme         = themes.includes(requested) ? requested : themes[0],
        popup         = Boolean(params.get('desktopPopup'));

    return Neo.app({
        mainView: popup ? {module: PopupViewport, layout: 'fit', theme} : {module: Viewport, theme},
        name    : popup ? 'DesktopBasicPopup' : 'DesktopBasic',
        windowId
    })
};
