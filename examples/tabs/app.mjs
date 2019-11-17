import MainContainer  from './MainContainer.mjs';
import MainContainer2 from './MainContainer2.mjs';

Neo.onStart = function() {
    Neo.app({
        appPath : 'examples/tabs/',
        mainView: MainContainer,
        name    : 'TestApp',
        parentId: 'main-container'
    });

    Neo.app({
        appPath : 'examples/tabs/',
        mainView: MainContainer2,
        name    : 'TestApp2',
        parentId: 'main-container2'
    });
};