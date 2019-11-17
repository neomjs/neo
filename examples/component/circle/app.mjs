import MainContainer from './MainContainer.mjs';

Neo.onStart = function() {
    Neo.app({
        appPath : 'examples/component/circle/',
        mainView: MainContainer,
        name    : 'TestApp'
    });
};