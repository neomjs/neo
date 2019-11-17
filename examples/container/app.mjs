import MainContainer from './MainContainer.mjs';

Neo.onStart = function() {
    Neo.app({
        appPath : 'examples/button/',
        mainView: MainContainer,
        name    : 'TestApp',
        parentId: 'main-container'
    });
};