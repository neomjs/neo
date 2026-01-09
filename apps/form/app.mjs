import Overwrites from './Overwrites.mjs';
import Viewport   from './view/Viewport.mjs';

export const onStart = () => Neo.app({
    mainView: Viewport,
    name    : 'Form'
});
