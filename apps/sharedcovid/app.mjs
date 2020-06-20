import MainContainer from './view/MainContainer.mjs';

Neo.onStart = () => Neo.app({
    appPath : 'apps/sharedcovid/',
    mainView: MainContainer,
    name    : 'SharedCovid'
});