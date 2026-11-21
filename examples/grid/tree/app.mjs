import {resolveStartTheme} from '../../../src/util/Theme.mjs';
import MainContainer       from './MainContainer.mjs';

/**
 * @summary Boots the Tree Grid example in `?theme=` when valid, else in dark mode when the OS prefers dark.
 * @returns {Neo.controller.Application}
 */
export const onStart = () => Neo.app({
    mainView: {module: MainContainer, theme: resolveStartTheme(Neo.config)},
    name    : 'Neo.examples.grid.tree'
});
