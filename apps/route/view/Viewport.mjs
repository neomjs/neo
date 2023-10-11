
import Base from '../../../src/container/Viewport.mjs';
import MainView from './MainView.mjs';

class Viewport extends Base {
    static config = {
        className: 'Route.view.Viewport',
        autoMount: true,
        layout: { ntype: 'fit' },
        items: [{ module: MainView }]
    }
    
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);
        if (!value) return;
        this.addDomListeners({
            "neo-debug-item-select": (event) => {
                event.path.forEach((item) => {
                    const component = Neo.getComponent(item.id);
                    if (component) console.log(component);
                });
            },
        });
    }
    
}
Neo.applyClassConfig(Viewport);
export default Viewport;
