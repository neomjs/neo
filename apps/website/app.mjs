import MainContainer from './view/MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'apps/website/',
    mainView: MainContainer,
    name    : 'Website'
});

export {onStart as onStart};