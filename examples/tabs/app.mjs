import MainContainer  from './MainContainer.mjs';
import MainContainer2 from './MainContainer2.mjs';

const onStart = () => {
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

export {onStart as onStart};