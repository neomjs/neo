import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/dialog/',
    mainView: MainContainer,
    name    : 'Neo.examples.dialog'
});

export {onStart as onStart};