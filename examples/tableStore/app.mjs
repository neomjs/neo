import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/tableStore/',
    mainView: MainContainer,
    name    : ' Neo.examples.tableStore'
});

export {onStart as onStart};