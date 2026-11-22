import MainContainer       from './view/MainContainer.mjs';
import {resolveStartTheme} from '../../src/util/Theme.mjs';

/** @summary Starts the preloading example in the theme requested by the Portal or the visitor. */
export const onStart = () => Neo.app({
    mainView: {module: MainContainer, theme: resolveStartTheme(Neo.config)},
    name    : 'Neo.examples.preloadingAssets'
});
