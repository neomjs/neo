import MainContainer from './view/MainContainer.mjs';

Neo.onStart = function() {
    Neo.app({
        appPath : 'apps/realworld/',
        mainView: MainContainer,
        name    : 'RealWorld'
    });
};