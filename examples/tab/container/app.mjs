import MainContainer from './MainContainer.mjs';

Neo.onStart = function() {
    Neo.app({
        appPath : 'examples/tab/container/',
        mainView: MainContainer,
        name    : 'TestApp'
    });
};