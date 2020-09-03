import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/table/container/',
    mainView: MainContainer,
    name    : 'TestApp'
});

export {onStart as onStart};