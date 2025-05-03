import Base     from '../../../src/container/Viewport.mjs';
import MainView from './MainView.mjs';

class Viewport extends Base {
    static config = {
        className: 'Route.view.Viewport',
        layout: { ntype: 'fit' },
        items: [{ module: MainView }]
    }
}

export default Neo.setupClass(Viewport);
