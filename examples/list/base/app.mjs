import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/list/base/',
    mainView: MainContainer,
    name    : 'TestApp'
});

export {onStart as onStart};