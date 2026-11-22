import {resolveStartTheme} from '../../../src/util/Theme.mjs';
import Viewport            from './Viewport.mjs';

/**
 * @summary Starts the repair workshop WIP-limits board example in `?theme=` when requested, else dark when preferred,
 * else the first configured theme (`neo-theme-neo-dark`).
 * @returns {Neo.controller.Application}
 */
export const onStart = () => Neo.app({
    mainView: {module: Viewport, theme: resolveStartTheme(Neo.config)},
    name    : 'BoardWipLimits'
});
