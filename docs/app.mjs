import MainContainer from './app/view/MainContainer.mjs';

export const onStart = () => Neo.app({
    mainView: MainContainer,
    name    : 'Docs'
});

