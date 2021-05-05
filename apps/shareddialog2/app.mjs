import MainContainer from './view/MainContainer.mjs';

const onStart = () => Neo.app({
    appThemeFolder: 'shareddialog',
    mainView      : MainContainer,
    name          : 'SharedDialog2'
});

export {onStart as onStart};