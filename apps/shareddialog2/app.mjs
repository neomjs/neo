import MainContainer from './view/MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'apps/shareddialog2/',
    mainView: MainContainer,
    name    : 'SharedDialog2'
});

export {onStart as onStart};