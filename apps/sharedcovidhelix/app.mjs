import MainContainer from './MainContainer.mjs';

Neo.onStart = () => Neo.app({
    appPath : 'apps/sharedcovidhelix/',
    mainView: MainContainer,
    name    : 'SharedCovidHelix'
});