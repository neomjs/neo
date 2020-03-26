import MainContainer from './view/MainContainer.mjs';

Neo.onStart = () => Neo.app({
    appPath : 'apps/covid/',
    mainView: MainContainer,
    name    : 'Covid'
});