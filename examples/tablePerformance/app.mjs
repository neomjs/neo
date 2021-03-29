import Viewport from './Viewport.mjs';

const onStart = () => {
    Neo.app({
        appPath : 'examples/tablePerformance/',
        mainView: Viewport,
        name    : 'Neo.examples.tablePerformance'
    });
};

export {onStart as onStart};