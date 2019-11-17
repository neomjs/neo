import MainContainer from './MainContainer.mjs';

Neo.onStart = function() {
    Neo.app({
        appPath : 'examples/list/base/',
        mainView: MainContainer,
        name    : 'TestApp'
    });
};