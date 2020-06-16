import MainContainer from './MainContainer.mjs';

Neo.onStart = () => Neo.app({
    appPath : 'apps/sharedcovid_helix/',
    mainView: MainContainer,
    name    : 'CovidHelix'
});