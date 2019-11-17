import MainContainer  from './MainContainer.mjs';

Neo.onStart = function() {
    Neo.app({
        appPath : 'examples/viewport/',
        mainView: MainContainer,
        name    : 'TestApp'
    });
};