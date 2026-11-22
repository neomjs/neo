import {resolveStartTheme} from '../../src/util/Theme.mjs';
import MainContainer       from './MainContainer.mjs';

/**
 * @summary Opens the contact scene in the theme requested by the examples catalog.
 * @returns {Neo.controller.Application}
 */
export const onStart = () => Neo.app({
    mainView: {module: MainContainer, theme: resolveStartTheme(Neo.config)},
    name    : 'Neo.examples.dialog'
});
