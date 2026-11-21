import MainContainer from './view/MainContainer.mjs';

export const onStart = () => Neo.app({
    mainView: MainContainer,
    name    : 'Neo.examples.toolbar.breadcrumb'
});
