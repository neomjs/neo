import Button    from '../../../../../src/button/Base.mjs';
import Toolbar   from '../../../../../src/toolbar/Base.mjs';
import Workspace from '../../../../../src/dashboard/dock/Workspace.mjs';
import '../../../../../src/tab/Container.mjs';

/**
 * @class Test.Playwright.Component.DockAuthoring.PerspectiveWorkspace
 * @extends Neo.dashboard.dock.Workspace
 * @summary Standalone perspective consumer with a bound switcher and no persistence or Group wiring.
 */
class PerspectiveWorkspace extends Workspace {
    static config = {
        className        : 'Test.Playwright.Component.DockAuthoring.PerspectiveWorkspace',
        activePerspective: 'operator',
        dockShellIndex   : 1,
        layout           : {ntype: 'vbox', align: 'stretch'},
        panes            : {
            editor : {ntype: 'component', text: 'Editor'},
            preview: {ntype: 'component', text: 'Preview'}
        },
        perspectives: {
            operator: {center: {id: 'tabs', items: ['editor', 'preview']}},
            review  : {center: {id: 'tabs', items: ['preview', 'editor']}}
        }
    }

    /** @summary Binds ordinary buttons to the host's published selection after declaration capture. */
    onAfterConstructed() {
        super.onAfterConstructed();
        const me = this;
        me.add({
            module: Toolbar,
            items : me.declaredPerspectives().map(name => ({
                module   : Button,
                reference: name,
                text     : name,
                bind     : {pressed: data => data.dock.perspective.active === name},
                handler  : () => {me.activePerspective = name}
            }))
        })
    }
}

export default Neo.setupClass(PerspectiveWorkspace);
