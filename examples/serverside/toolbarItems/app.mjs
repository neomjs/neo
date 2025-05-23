import Overwrites from './Overwrites.mjs';
import Viewport   from './Viewport.mjs';

export const onStart = () => Neo.app({
    mainView: Viewport,
    name    : 'Neo.examples.serverside.toolbarItems'
});
