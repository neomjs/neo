import {resolveStartTheme} from '../../../src/util/Theme.mjs';
import MainContainer       from './MainContainer.mjs';
import Viewport            from '../../../src/container/Viewport.mjs';

export const onStart = () => Neo.app({
    mainView: {
        module: Viewport,
        items : [{module: MainContainer, flex: 1}],
        theme : resolveStartTheme(Neo.config)
    },
    name    : 'Neo.examples.dashboard.desk'
});
