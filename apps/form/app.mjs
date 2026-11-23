import {resolveStartTheme} from '../../src/util/Theme.mjs';
import Overwrites          from './Overwrites.mjs';
import Viewport            from './view/Viewport.mjs';

/**
 * @summary Starts the form app in the theme its `?theme=` names, else by the start rule of `resolveStartTheme()`.
 * @returns {Neo.controller.Application}
 */
export const onStart = () => Neo.app({
    mainView: {module: Viewport, theme: resolveStartTheme(Neo.config)},
    name    : 'Form'
});
