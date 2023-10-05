import MainContainer from './view/MainContainer.mjs';

export const onStart = () => Neo.app({
    appThemeFolder: 'shareddialog',
    mainView      : MainContainer,
    name          : 'SharedDialog2'
});
