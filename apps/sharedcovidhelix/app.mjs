import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    mainView: MainContainer,
    name    : 'SharedCovidHelix'
});

export {onStart as onStart};