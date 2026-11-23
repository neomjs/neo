import MainContainer       from './MainContainer.mjs';
import {resolveStartTheme} from '../../../src/util/Theme.mjs';

/**
 * @summary Starts the `Neo.component.Video` component workbench example in the requested catalog theme.
 */
export const onStart = () => Neo.app({
    mainView: {module: MainContainer, theme: resolveStartTheme(Neo.config)},
    name    : 'Neo.examples.component.video'
});
