import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'apps/sharedcovidmap/',
    mainView: MainContainer,
    name    : 'SharedCovidMap'
});

export {onStart as onStart};