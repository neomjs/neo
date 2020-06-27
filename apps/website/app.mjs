import MainContainer from './MainContainer.mjs';

Neo.onStart = () => Neo.app({
    appPath : 'apps/website/',
    mainView: MainContainer,
    name    : 'Website'
});