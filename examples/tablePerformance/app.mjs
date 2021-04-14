import Viewport from './Viewport.mjs';

const onStart = () => {
    Neo.app({
        mainView: Viewport,
        name    : 'Neo.examples.tablePerformance'
    });
};

export {onStart as onStart};