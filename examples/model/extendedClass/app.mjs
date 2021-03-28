import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/model/extendedClass/',
    mainView: MainContainer,
    name    : 'Neo.examples.model.extendedClass'
});

export {onStart as onStart};