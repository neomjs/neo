import MainContainer  from './MainContainer.mjs';
import MainContainer2 from './MainContainer2.mjs';

const onStart = () => {
    Neo.app({
        mainView: MainContainer,
        name    : 'Neo.examples.tabs',
        parentId: 'main-container'
    });

    Neo.app({
        mainView: MainContainer2,
        name    : 'Neo.examples.tabs2',
        parentId: 'main-container2'
    });
};

export {onStart as onStart};