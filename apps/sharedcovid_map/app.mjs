import MainContainer from './MainContainer.mjs';

Neo.onStart = () => Neo.app({
    appPath : 'apps/sharedcovid_map/',
    mainView: MainContainer,
    name    : 'CovidMap'
});