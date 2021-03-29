import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/table/container/',
    mainView: MainContainer,
    name    : 'Neo.examples.table.container'
});

export {onStart as onStart};