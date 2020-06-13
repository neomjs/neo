import MainContainer from './MainContainer.mjs';

Neo.onStart = () => Neo.app({
    appPath : 'apps/sharedcovid3/',
    mainView: MainContainer,
    name    : 'Covid3'
});