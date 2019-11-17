import MainContainer from './MainContainer.mjs';

Neo.onStart = function() {
    Neo.app({
        appPath : 'examples/component/button/',
        mainView: MainContainer,
        name    : 'TestApp'
    });
};