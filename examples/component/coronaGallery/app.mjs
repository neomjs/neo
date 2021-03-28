import GalleryMainContainer  from './GalleryMainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/component/coronaGallery/',
    mainView: GalleryMainContainer,
    name    : 'Neo.examples.component.coronaGallery'
});

export {onStart as onStart};