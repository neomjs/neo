import Viewport from './Viewport.mjs';

const onStart = () => Neo.app({
    mainView: Viewport,
    name    : 'Neo.examples.model.multiWindow2'
});

export {onStart as onStart};