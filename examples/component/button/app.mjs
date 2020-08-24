import MainContainer from './MainContainer.mjs';

Neo.onStart = function() {
    Neo.app({
        appPath : 'examples/button.Base/',
        mainView: MainContainer,
        name    : 'TestApp'
    });
};