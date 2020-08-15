import MainContainer from './MainContainer.mjs';

Neo.onStart = function() {
    Neo.app({
        appPath : 'examples/dialog/',
        mainView: MainContainer,
        name    : 'Dialog'
    });
};