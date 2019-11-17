import MainContainer  from './MainContainer.mjs';
import MainContainer2 from './MainContainer2.mjs';
import MainContainer3 from './MainContainer3.mjs';

Neo.onStart = function() {
    Neo.app({
        appPath : 'examples/tablePerformance/',
        mainView: MainContainer,
        name    : 'TestApp',
        parentId: 'main-container'
    });

    Neo.app({
        appPath : 'examples/tablePerformance/',
        mainView: MainContainer2,
        name    : 'TestApp2',
        parentId: 'main-container2'
    });

    Neo.app({
        appPath : 'examples/tablePerformance/',
        mainView: MainContainer3,
        name    : 'TestApp3',
        parentId: 'main-container3'
    });
};