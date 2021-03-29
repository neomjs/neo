import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/tree/',
    mainView: MainContainer,
    name    : 'Neo.examples.tree'
});

export {onStart as onStart};