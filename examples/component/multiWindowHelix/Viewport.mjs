import MainContainer from '../helix/MainContainer.mjs';

/**
 * @class Neo.examples.component.multiWindowHelix.Viewport
 * @extends Neo.examples.component.helix.MainContainer
 */
class Viewport extends MainContainer {
    static config = {
        className: 'Neo.examples.component.multiWindowHelix.Viewport'
    }
}

Neo.setupClass(Viewport);

export default Viewport;
