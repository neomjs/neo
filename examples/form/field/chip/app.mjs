import MainContainer from './MainContainer.mjs';

Neo.onStart = function() {
    Neo.app({
        appPath : 'examples/form/field/chip/',
        mainView: MainContainer,
        name    : 'TestApp'
    });
};