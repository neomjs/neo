import MainContainer       from './MainContainer.mjs';
import {resolveStartTheme} from '../../../src/util/Theme.mjs';

/**
 * @summary Starts the worker comparison in the selected theme.
 */
export const onStart = () => Neo.app({
    mainView: {module: MainContainer, theme: resolveStartTheme(Neo.config)},
    name    : 'Neo.examples.worker.task'
});
