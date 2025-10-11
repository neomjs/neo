import Viewport from '../../../src/container/Viewport.mjs';

/**
 * @class ComponentTestApp.view.EmptyViewport
 * @extends Neo.container.Viewport
 */
class EmptyViewport extends Viewport {
    static config = {
        className: 'ComponentTestApp.view.EmptyViewport',
        id       : 'component-test-viewport',
        layout   : 'fit',
        items    : []
    }
}

export default Neo.setupClass(EmptyViewport);
