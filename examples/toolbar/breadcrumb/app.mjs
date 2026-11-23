import {resolveStartTheme} from '../../../src/util/Theme.mjs';
import MainContainer       from './view/MainContainer.mjs';

/**
 * @summary Starts the breadcrumb example in the theme its `?theme=` names, else by the start rule of
 * `resolveStartTheme()`.
 * @returns {Neo.controller.Application}
 */
export const onStart = () => Neo.app({
    mainView: {module: MainContainer, theme: resolveStartTheme(Neo.config)},
    name    : 'Neo.examples.toolbar.breadcrumb'
});
