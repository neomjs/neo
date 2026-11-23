import {resolveStartTheme} from '../../../src/util/Theme.mjs';
import Viewport            from './Viewport.mjs';

/**
 * @summary Starts the sortable dashboard example in the theme `?theme=` names, else in Neo Dark when the system
 * prefers dark, else in the first configured theme. A SharedWorker serves every window, and `Neo.config` is the first
 * window's, so the booting window's configuration decides.
 * @returns {Neo.controller.Application}
 */
export const onStart = () => Neo.app({
    mainView: {module: Viewport, theme: resolveStartTheme(Neo.windowConfigs?.[Neo.bootingWindowId] || Neo.config)},
    name    : 'DashboardSortable'
});
