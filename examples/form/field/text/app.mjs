import MainContainer from './MainContainer.mjs';

Neo.onStart = function() {
    Neo.app({
        appPath : 'examples/form/field/text/',
        mainView: MainContainer,
        name    : 'TestApp'
    });
};