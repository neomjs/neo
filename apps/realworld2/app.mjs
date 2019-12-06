import MainContainer from './view/MainContainer.mjs';

Neo.onStart = function() {
    Neo.app({
        appPath : 'apps/realworld2/',
        mainView: MainContainer,
        name    : 'RealWorld2'
    });
};