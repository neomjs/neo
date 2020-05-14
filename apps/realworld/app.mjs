import MainContainer from './view/MainContainer.mjs';

Neo.onStart = () => Neo.app({
    appPath : 'apps/realworld/',
    mainView: MainContainer,
    name    : 'RealWorld'
});