import {resolveStartTheme} from '../../../../../src/util/Theme.mjs';
import Viewport            from './Viewport.mjs';

/**
 * @summary Starts a detached tile's window in the theme its dashboard passed as `?theme=`.
 * @returns {Neo.controller.Application}
 */
export const onStart = () => Neo.app({
    mainView: {module: Viewport, theme: resolveStartTheme(Neo.config)},
    name    : 'DashboardSortableWidget'
});
