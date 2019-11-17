import MainContainer from './MainContainer.mjs';

Neo.onStart = function() {
    Neo.app({
        appPath : 'examples/table/container/',
        mainView: MainContainer,
        name    : 'TestApp'
    });
};