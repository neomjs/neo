import {resolveStartTheme} from '../../../src/util/Theme.mjs';
import Viewport            from './Viewport.mjs';

/**
 * @summary Starts the dialog row-editing grid example in the theme requested by the catalog.
 * @returns {Neo.controller.Application}
 */
export const onStart = () => Neo.app({
    mainView: {module: Viewport, theme: resolveStartTheme(Neo.config)},
    name    : 'Neo.examples.grid.nestedRecordFields'
});
