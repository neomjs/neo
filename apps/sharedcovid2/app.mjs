import MainContainer from './MainContainer.mjs';

Neo.onStart = Neo.app({
    appPath : 'apps/sharedcovid2/',
    mainView: MainContainer,
    name    : 'Covid2'
});