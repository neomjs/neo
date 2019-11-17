import MainContainer from './MainContainer.mjs';

Neo.onStart = function() {
    Neo.app({
        appPath : 'examples/form/field/time/',
        mainView: MainContainer,
        name    : 'TestApp'
    });
};