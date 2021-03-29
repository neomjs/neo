import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/tableFiltering/',
    mainView: MainContainer,
    name    : 'Neo.examples.tableFiltering'
});

export {onStart as onStart};