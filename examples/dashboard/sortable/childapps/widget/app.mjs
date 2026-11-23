import {resolveStartTheme} from '../../../../../src/util/Theme.mjs';
import Viewport            from './Viewport.mjs';

/**
 * @summary Starts a detached tile's window in the theme its dashboard passed as `?theme=`. The window boots in the
 * dashboard's SharedWorker, where `Neo.config` is the dashboard window's, so its own configuration decides.
 * @returns {Neo.controller.Application}
 */
export const onStart = () => Neo.app({
    mainView: {module: Viewport, theme: resolveStartTheme(Neo.windowConfigs?.[Neo.bootingWindowId] || Neo.config)},
    name    : 'DashboardSortableWidget'
});
