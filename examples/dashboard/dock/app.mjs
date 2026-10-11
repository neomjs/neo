import MainContainer from './MainContainer.mjs';
import Viewport      from '../../../src/container/Viewport.mjs';

export const onStart = () => Neo.app({
    mainView: {
        module: Viewport,
        items : [{module: MainContainer, flex: 1}]
    },
    name    : 'Neo.examples.dashboard.dock'
});
