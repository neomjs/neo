import MainContainer from './MainContainer.mjs';

Neo.onStart = function() {
    Neo.app({
        appPath : 'examples/fields/',
        mainView: MainContainer,
        name    : 'TestApp',
        parentId: 'main-container'
    });
};