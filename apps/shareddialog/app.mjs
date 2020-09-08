import MainContainer from './view/MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'apps/shareddialog/',
    mainView: MainContainer,
    name    : 'SharedDialog'
});

export {onStart as onStart};