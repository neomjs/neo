import {resolveStartTheme} from '../../../src/util/Theme.mjs';
import MainContainer       from './MainContainer.mjs';

/**
 * @summary Starts the tree big-data grid example in the theme requested by the catalog.
 * @returns {Neo.controller.Application}
 */
export const onStart = () => Neo.app({
    mainView: {module: MainContainer, theme: resolveStartTheme(Neo.config)},
    name    : 'Neo.examples.grid.treeBigData'
});
