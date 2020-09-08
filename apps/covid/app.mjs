import MainContainer from './view/MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'apps/covid/',
    mainView: MainContainer,
    name    : 'Covid'
});

export {onStart as onStart};