import {resolveStartTheme} from '../../../src/util/Theme.mjs';
import Viewport            from './Viewport.mjs';

/**
 * @summary Starts each tab in the theme its own `?theme=` names. A SharedWorker serves every tab, and `Neo.config`
 * is the first tab's, so the booting window's configuration decides.
 * @returns {Neo.controller.Application}
 */
export const onStart = () => Neo.app({
    mainView: {module: Viewport, theme: resolveStartTheme(Neo.windowConfigs?.[Neo.bootingWindowId] || Neo.config)},
    name    : 'Neo.examples.dashboard.tearOut'
});
