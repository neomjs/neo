import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/list/base/',
    mainView: MainContainer,
    name    : 'Neo.examples.list.base'
});

export {onStart as onStart};