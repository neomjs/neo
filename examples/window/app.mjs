import MainContainer from './MainContainer.mjs';

Neo.onStart = function() {
    Neo.app({
        appPath : 'examples/window/',
        mainView: MainContainer,
        name    : 'TestApp'
    });
};