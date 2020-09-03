import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/dialog/',
    mainView: MainContainer,
    name    : 'Dialog'
});

export {onStart as onStart};