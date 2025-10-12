import Viewport from '../../../../../src/container/Viewport.mjs';

export const onStart = () => Neo.app({
    mainView: {
        module: Viewport,
        id    : 'component-test-viewport'
    },
    name: 'ComponentTestApp'
});