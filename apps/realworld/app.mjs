import MainContainer from './view/MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'apps/realworld/',
    mainView: MainContainer,
    name    : 'RealWorld'
});

export {onStart as onStart};