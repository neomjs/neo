
import Base from '../../../src/container/Viewport.mjs';
import MainView from './MainView.mjs';

class Viewport extends Base {
    static config = {
        className: 'Route.view.Viewport',
        autoMount: true,
        layout: { ntype: 'fit' },
        items: [{ module: MainView }]
    }
    
}
Neo.applyClassConfig(Viewport);
export default Viewport;
