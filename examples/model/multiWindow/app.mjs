import Viewport from './Viewport.mjs';

const onStart = () => Neo.app({
    mainView: Viewport,
    name    : 'Neo.examples.model.multiWindow'
});

export {onStart as onStart};