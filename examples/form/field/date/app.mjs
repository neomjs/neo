import MainContainer from './MainContainer.mjs';

Neo.onStart = function() {
    Neo.app({
        appPath : 'examples/form/field/date/',
        mainView: MainContainer,
        name    : 'TestApp'
    });
};