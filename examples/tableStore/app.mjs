import MainContainer from './MainContainer.mjs';

Neo.onStart = function() {
    Neo.app({
        appPath : 'examples/tableStore/',
        mainView: MainContainer,
        name    : 'TestApp'
    });
};