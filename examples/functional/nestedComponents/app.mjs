import {resolveStartTheme} from '../../../src/util/Theme.mjs';
import MainContainer       from './MainContainer.mjs';

/** @summary Starts the mixed-component nesting workbench on the requested theme. */
export const onStart = () => Neo.app({
    mainView: {module: MainContainer, theme: resolveStartTheme(Neo.config)},
    name    : 'Neo.examples.functional.nestedComponents'
});
