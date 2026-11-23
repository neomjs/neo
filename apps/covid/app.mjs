import {resolveStartTheme} from '../../src/util/Theme.mjs';
import MainContainer       from './view/MainContainer.mjs';

/**
 * @summary Starts the COVID dashboard in the theme requested by the catalog.
 * @returns {Neo.controller.Application}
 */
export const onStart = () => Neo.app({
    mainView: {module: MainContainer, theme: resolveStartTheme(Neo.config)},
    name    : 'Covid'
});
