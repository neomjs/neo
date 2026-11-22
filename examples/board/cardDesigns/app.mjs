import {resolveStartTheme} from '../../../src/util/Theme.mjs';
import Viewport            from './Viewport.mjs';

/**
 * @summary Boots the editorial calendar board example in the `?theme=` query theme, else dark when preferred, else the
 * first configured theme.
 * @returns {Neo.controller.Application}
 */
export const onStart = () => Neo.app({
    mainView: {module: Viewport, theme: resolveStartTheme(Neo.config)},
    name    : 'BoardCardDesigns'
});
