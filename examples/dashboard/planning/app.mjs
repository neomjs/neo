import {resolveStartTheme} from '../../../src/util/Theme.mjs';
import Viewport            from './Viewport.mjs';

/**
 * @summary Mounts one plan in the opener. A tear-out window is a render target for an existing pane.
 * @returns {Neo.controller.Application}
 */
export function onStart() {
    const windowId = Neo.bootingWindowId,
          config   = Neo.windowConfigs?.[windowId] || Neo.config;

    return Neo.app({
        name    : 'SharedPlanning', windowId,
        mainView: {module: Viewport, theme: resolveStartTheme(config)}
    })
}
