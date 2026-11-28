import {resolveStartTheme} from '../../../src/util/Theme.mjs';
import MainContainer       from './view/MainContainer.mjs';

/**
 * @summary Starts the adaptive navigation example with the theme selected by the URL or app config.
 * @returns {Neo.controller.Application}
 */
export const onStart = () => Neo.app({
    mainView: {module: MainContainer, theme: resolveStartTheme(Neo.config)},
    name    : 'Neo.examples.toolbar.navigation'
});
