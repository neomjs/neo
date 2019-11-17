import MainContainer from './MainContainer.mjs';

Neo.onStart = function() {
    Neo.app({
        appPath : 'examples/list/chip/',
        mainView: MainContainer,
        name    : 'TestApp'
    });
};