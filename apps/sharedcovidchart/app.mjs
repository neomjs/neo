import MainContainer from './MainContainer.mjs';

Neo.onStart = () => Neo.app({
    appPath : 'apps/sharedcovidchart/',
    mainView: MainContainer,
    name    : 'SharedCovidChart'
});