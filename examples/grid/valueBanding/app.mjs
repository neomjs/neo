import {resolveStartTheme} from '../../../src/util/Theme.mjs';
import MainContainer       from './MainContainer.mjs';

export const onStart = () => Neo.app({
    mainView: {module: MainContainer, theme: resolveStartTheme(Neo.config)},
    name    : 'Neo.examples.grid.valueBanding'
});
