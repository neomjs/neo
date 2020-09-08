import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/fields/',
    mainView: MainContainer,
    name    : 'TestApp',
    parentId: 'main-container'
});

export {onStart as onStart};