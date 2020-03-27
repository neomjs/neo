import MainContainer from './MainContainer.mjs';

Neo.onStart = () => Neo.app({
    appPath : 'examples/charts/',
    mainView: MainContainer,
    name    : 'TestApp'
});