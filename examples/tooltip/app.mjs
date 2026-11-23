import {resolveStartTheme} from '../../src/util/Theme.mjs';
import MainContainer       from './view/MainContainer.mjs';

/**
 * @summary Starts an independent sprint board in the browser window that loaded this entry point.
 * @returns {Neo.controller.Application}
 */
export function onStart() {
    const windowId  = Neo.bootingWindowId,
          config    = Neo.windowConfigs?.[windowId] || Neo.config,
          companion = new URLSearchParams(config.url?.search).get('companion') === '1';

    return Neo.app({
        mainView: {module: MainContainer, companion, theme: resolveStartTheme(config)},
        name    : companion ? 'Neo.examples.tooltip.companion' : 'Neo.examples.tooltip',
        windowId
    })
}
