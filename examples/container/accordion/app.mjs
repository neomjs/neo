import {resolveStartTheme} from '../../../src/util/Theme.mjs';
import MainContainer       from './MainContainer.mjs';

/**
 * @summary Starts the accordion example in the theme `?theme=` names, else in the dark theme when the system prefers
 * dark, else in the first configured theme.
 * @returns {Neo.controller.Application}
 */
export const onStart = () => Neo.app({
    mainView: {module: MainContainer, theme: resolveStartTheme(Neo.config)},
    name    : 'Neo.examples.container.accordion'
});
