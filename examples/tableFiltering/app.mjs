import MainContainer from './MainContainer.mjs';

Neo.onStart = function() {
    Neo.app({
        appPath : 'examples/tableFiltering/',
        mainView: MainContainer,
        name    : 'TestApp'
    });
};