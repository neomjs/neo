import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'apps/sharedcovidchart/',
    mainView: MainContainer,
    name    : 'SharedCovidChart'
});

export {onStart as onStart};