import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/tab/container/',
    mainView: MainContainer,
    name    : 'TestApp'
});

export {onStart as onStart};