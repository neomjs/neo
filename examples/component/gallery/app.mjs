import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/component/gallery/',
    mainView: MainContainer,
    name    : 'Neo.examples.component.gallery'
});

export {onStart as onStart};