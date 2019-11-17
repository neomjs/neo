import MainContainer from './MainContainer.mjs';

Neo.onStart = function() {
    Neo.app({
        appPath : 'examples/form/field/email/',
        mainView: MainContainer,
        name    : 'TestApp'
    });
};