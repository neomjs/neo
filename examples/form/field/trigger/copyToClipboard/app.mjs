import MainContainer from './MainContainer.mjs';

Neo.onStart = function() {
    Neo.app({
        appPath : 'examples/form/field/trigger/copyToClipboard',
        mainView: MainContainer,
        name    : 'TestApp'
    });
};