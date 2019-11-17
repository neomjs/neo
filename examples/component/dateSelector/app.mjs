import MainContainer from './MainContainer.mjs';

Neo.onStart = function() {
    Neo.app({
        appPath : 'examples/component/dateSelector/',
        mainView: MainContainer,
        name    : 'TestApp'
    });
};