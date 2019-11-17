import MainContainer from './MainContainer.mjs';

Neo.onStart = function() {
    Neo.app({
        appPath : 'examples/form/field/number/',
        mainView: MainContainer,
        name    : 'TestApp'
    });
};