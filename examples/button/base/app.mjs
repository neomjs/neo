import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/button/base/',
    mainView: MainContainer,
    name    : 'TestApp'
});

export {onStart as onStart};