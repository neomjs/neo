import Viewport from './Viewport.mjs';

export const onStart = () => Neo.app({
    mainView: Viewport,
    name    : 'Neo.examples.stateProvider.multiWindow2'
});
