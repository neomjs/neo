import MainContainer  from './MainContainer.mjs';
import MainContainer2 from './MainContainer2.mjs';
import MainContainer3 from './MainContainer3.mjs';

const onStart = () => {
    Neo.app({
        appPath : 'examples/tablePerformance/',
        mainView: MainContainer,
        name    : 'Neo.examples.tablePerformance',
        parentId: 'main-container'
    });

    Neo.app({
        appPath : 'examples/tablePerformance/',
        mainView: MainContainer2,
        name    : 'Neo.examples.tablePerformance2',
        parentId: 'main-container2'
    });

    Neo.app({
        appPath : 'examples/tablePerformance/',
        mainView: MainContainer3,
        name    : 'Neo.examples.tablePerformance3',
        parentId: 'main-container3'
    });
};

export {onStart as onStart};