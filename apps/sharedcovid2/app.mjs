import MainContainer from './MainContainer.mjs';

Neo.onStart = function() {
    Neo.app({
        appPath : 'apps/covid2/',
        mainView: MainContainer,
        name    : 'Covid2'
    });
};