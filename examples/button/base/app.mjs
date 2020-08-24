import MainContainer from './MainContainer.mjs';

Neo.onStart = () => Neo.app({
    appPath : 'examples/button/base/',
    mainView: MainContainer,
    name    : 'TestApp'
});