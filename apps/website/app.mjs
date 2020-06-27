import MainContainer from './view/MainContainer.mjs';

Neo.onStart = () => Neo.app({
    appPath : 'apps/website/',
    mainView: MainContainer,
    name    : 'Website'
});