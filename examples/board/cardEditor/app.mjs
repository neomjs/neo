import {resolveStartTheme} from '../../../src/util/Theme.mjs';
import Viewport            from './Viewport.mjs';

/**
 * @summary Starts the hiring pipeline example in the theme `?theme=` names, else in the dark theme when the system
 * prefers dark, else in the first configured theme.
 * @returns {Neo.controller.Application}
 */
export const onStart = () => Neo.app({
    mainView: {module: Viewport, theme: resolveStartTheme(Neo.config)},
    name    : 'BoardCardEditor'
});
