import HelixMainContainer  from './HelixMainContainer.mjs';

Neo.onStart = function() {
    Neo.app({
        appPath : 'examples/component/helix/',
        mainView: HelixMainContainer,
        name    : 'TestApp'
    });
};