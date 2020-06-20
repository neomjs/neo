import MainContainer from './MainContainer.mjs';

Neo.onStart = () => Neo.app({
    appPath : 'apps/sharedcovidmap/',
    mainView: MainContainer,
    name    : 'SharedCovidMap'
});