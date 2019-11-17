import MainContainer from './MainContainer.mjs';

Neo.onStart = function() {
    Neo.app({
        appPath : 'examples/form/field/select/',
        mainView: MainContainer,
        name    : 'TestApp'
    });
};