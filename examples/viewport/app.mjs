import MainContainer  from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/viewport/',
    mainView: MainContainer,
    name    : 'Neo.examples.viewport'
});

export {onStart as onStart};