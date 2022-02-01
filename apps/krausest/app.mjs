import MainComponent from './view/MainComponent.mjs';

export const onStart = () => Neo.app({
    appPath : 'apps/neoapp/',
    mainView: MainComponent,
    name    : 'NeoApp',
    parentId: 'main'
});
