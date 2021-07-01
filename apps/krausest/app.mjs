import MainComponent from './view/MainComponent.mjs';

const onStart = () => Neo.app({
    appPath : 'apps/neoapp/',
    mainView: MainComponent,
    name    : 'NeoApp',
    parentId: 'main'
});

export {onStart as onStart};
