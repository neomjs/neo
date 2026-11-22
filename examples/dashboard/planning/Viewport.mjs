import Component     from '../../../src/component/Base.mjs';
import Container     from '../../../src/container/Base.mjs';
import ThemeSwitcher from '../../../src/button/ThemeSwitcher.mjs';
import Viewport      from '../../../src/container/Viewport.mjs';
import Workspace     from './Workspace.mjs';

/**
 * @summary The gallery plan starts docked on desktop or in three tabs on a phone. An opened
 * vessel mounts no second workspace; the shared worker moves the existing pane into its viewport.
 * @class Neo.examples.dashboard.planning.Viewport
 * @extends Neo.container.Viewport
 */
class PlanningViewport extends Viewport {
    static config = {
        className: 'Neo.examples.dashboard.planning.Viewport',
        cls      : ['planning-viewport'],
        layout   : {ntype: 'vbox', align: 'stretch'}
    }

    /** @summary Creates the visible desk only in its owning window. */
    async onConstructed() {
        super.onConstructed();
        const {windowId} = this, [url, dimensions] = await Promise.all([
            Neo.Main.getByPath({path: 'document.URL', windowId}), Neo.Main.getWindowData({windowId})
        ]);
        if (this.isDestroyed) return;
        if (new URL(url).searchParams.has('tearout')) {
            this.addCls('planning-target');
            const route = dimensions.nativeRoute,
                  owner = route?.targetWindowId === windowId && Neo.apps[route.ownerWindowId]?.mainView;
            if (owner instanceof PlanningViewport) {
                this.theme = owner.getTheme();
                this.observeConfig(owner, 'theme', theme => { if (theme) this.theme = theme })
            }
            return
        }
        const compact = dimensions.innerWidth < 720;
        this.add([{
            module: Container, cls: ['planning-header'], flex: 'none', layout: {ntype: 'hbox', align: 'center', wrap: 'wrap'},
            items : [{
                module: Component, cls: ['planning-intro'],
                html  : '<h1>One plan, three windows</h1><p>Gallery opening · 9–20 November 2026</p>'
            }, {
                module: Component, cls: ['planning-hint'], flex: 1,
                text  : compact
                    ? 'Drag Focus lighting to another day or person. Switch tabs to follow the task.'
                    : 'Drag Focus lighting to another day or person. Pop out the Scheduler and Gantt to follow it across windows.'
            }, {module: ThemeSwitcher}]
        }, {
            module: Workspace, flex: 1, reference: 'plan', compactRows: dimensions.innerHeight <= 640 && !compact,
            ...(compact && {enableDockTearOutLifecycle: false, zones: {center: {items: ['board', 'scheduler', 'gantt']}}})
        }])
    }
}

export default Neo.setupClass(PlanningViewport);
