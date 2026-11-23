import {resolveStartTheme} from '../../../../src/util/Theme.mjs';
import MainContainer       from './MainContainer.mjs';

/** @summary Starts the functional button workbench on the requested theme. */
export const onStart = () => Neo.app({
    mainView: {module: MainContainer, theme: resolveStartTheme(Neo.config)},
    name    : 'Neo.examples.functional.button.base'
});
