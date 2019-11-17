import MainContainer from './views/MainContainer.mjs';

Neo.onStart = function() {
    Neo.app({
        appPath : 'apps/realworld/',
        mainView: MainContainer,
        name    : 'RealWorld'
    });
};