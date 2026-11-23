import MainContainer       from './MainContainer.mjs';
import {resolveStartTheme} from '../../src/util/Theme.mjs';

/**
 * @summary Starts the video reparenting example in the theme requested by the catalog or environment.
 */
export const onStart = () => Neo.app({
    mainView: {module: MainContainer, theme: resolveStartTheme(Neo.config)},
    name    : 'Neo.examples.videoMove'
});
