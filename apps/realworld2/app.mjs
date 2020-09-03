import MainContainer from './view/MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'apps/realworld2/',
    mainView: MainContainer,
    name    : 'RealWorld2'
});

export {onStart as onStart};