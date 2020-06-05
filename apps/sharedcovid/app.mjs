import MainContainer from './view/MainContainer.mjs';

Neo.onStart = function() {
    Neo.app({
        appPath : 'apps/sharedcovid/',
        mainView: MainContainer,
        name    : 'Covid'
    });
};