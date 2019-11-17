import MainContainer from './MainContainer.mjs';

Neo.onStart = function() {
    Neo.app({
        appPath : 'examples/form/field/picker/',
        mainView: MainContainer,
        name    : 'TestApp'
    });
};