import MainContainer from './MainContainer.mjs';

Neo.onStart = () => Neo.app({
    appPath : 'apps/sharedcovid_chart/',
    mainView: MainContainer,
    name    : 'Covid2'
});