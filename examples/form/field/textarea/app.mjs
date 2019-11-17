import MainContainer from './MainContainer.mjs';

Neo.onStart = function() {
    Neo.app({
        appPath : 'examples/form/field/textarea/',
        mainView: MainContainer,
        name    : 'TestApp'
    });
};