import Viewport from './view/Viewport.mjs';

export const onStart = () => Neo.app({
    mainView: Viewport,
    name    : 'NewWebsite'
})
