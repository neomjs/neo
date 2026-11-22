import {resolveStartTheme} from '../../../src/util/Theme.mjs';
import Viewport            from './Viewport.mjs';

/** @summary Starts the sales pipeline in the selected or preferred theme. @returns {Neo.controller.Application} */
export const onStart = () => Neo.app({
    mainView: {module: Viewport, theme: resolveStartTheme(Neo.config)},
    name    : 'BoardSalesPipeline'
});
