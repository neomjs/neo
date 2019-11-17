import MainContainer from './MainContainer.mjs';

Neo.onStart = function() {
    Neo.app({
        appPath : 'examples/component/chip/',
        mainView: MainContainer,
        name    : 'TestApp'
    });
};