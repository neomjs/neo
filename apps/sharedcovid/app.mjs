import MainContainer from './view/MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'apps/sharedcovid/',
    mainView: MainContainer,
    name    : 'SharedCovid'
});

export {onStart as onStart};