import HelixMainContainer  from './HelixMainContainer.mjs';

Neo.onStart = function() {
    Neo.app({
        appPath : 'examples/component/coronaHelix/',
        mainView: HelixMainContainer,
        name    : 'TestApp'
    });
};