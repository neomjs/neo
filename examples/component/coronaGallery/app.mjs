import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/component/coronaGallery/',
    mainView: MainContainer,
    name    : 'Neo.examples.component.coronaGallery'
});

export {onStart as onStart};