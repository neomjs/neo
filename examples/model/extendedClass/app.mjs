import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/model/extendedClass/',
    mainView: MainContainer,
    name    : 'ComponentModelExample'
});

export {onStart as onStart};