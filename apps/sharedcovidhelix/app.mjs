import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'apps/sharedcovidhelix/',
    mainView: MainContainer,
    name    : 'SharedCovidHelix'
});

export {onStart as onStart};