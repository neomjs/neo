import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/tree/',
    mainView: MainContainer,
    name    : 'ExamplesTree'
});

export {onStart as onStart};