import Component     from '../../../../../src/component/Base.mjs';
import DockWorkspace from '../../../../../src/dashboard/dock/Workspace.mjs';
import Viewport      from '../../../../../src/container/Viewport.mjs';
import '../../../../../src/tab/Container.mjs';

/**
 * @summary A pane owning the reload contract. Its mere presence is what makes the contract-free
 * sibling's corrected state observable: the projection cannot tell the two apart, so a header
 * showing reload for one and not the other can only be the sweep's doing.
 */
class ContractPane extends Component {
    static config = {
        className: 'Test.Playwright.Component.DockStaticBoot.ContractPane',
        ntype    : 'dock-static-boot-contract-pane'
    }

    /**
     * The contract probe's positive case. Never invoked here — this fixture asserts availability,
     * not delegation.
     * @returns {void}
     */
    dockReload() {}
}

ContractPane = Neo.setupClass(ContractPane);

const staticDocument = {
    schema: 'neo.dock.zone.v1',
    root  : 'static-root',
    items : {
        bare    : {componentRef: 'Bare',     title: 'Bare',     kind: 'panel'},
        contract: {componentRef: 'Contract', title: 'Contract', kind: 'panel'}
    },
    nodes: {
        // `contract` is ACTIVE at boot on purpose. The projection hardcodes reload to
        // `hidden: true` (`LayoutAdapter`), so ABSENCE is the projected default and asserting it
        // would hold with the sweep removed — the direction that discriminates is REVEAL: only the
        // sweep can turn the projected-hidden row into rendered chrome for a pane that owns the
        // contract. `bare` sits beside it as the untouched negative.
        'static-root': {type: 'tabs', items: ['contract', 'bare'], activeItemId: 'contract'}
    }
};

/**
 * @summary The STATIC-FIRST-PROJECTION consumer: items assembled in `construct()` and never a
 * refresh.
 *
 * This is the boot path `Workspace#afterSetMounted` exists for, and the only fixture in the tree
 * that takes it. Every other dock fixture calls `onDockZoneDocumentChange` during construct, which
 * sets `refreshPromise` before mount — so the mount hook returns null there and the post-reconcile
 * sweep does the correcting instead. A witness booted on one of those cannot observe this hook at
 * all: disabling the hook outright leaves those fixtures green.
 *
 * Nothing here may open a refresh. Adding one would silently re-route the correction and turn any
 * arm riding this fixture back into decoration.
 */
class StaticBootFixtureWorkspace extends DockWorkspace {
    static config = {
        /**
         * @member {String} className='Test.Playwright.Component.DockStaticBoot.Workspace'
         * @protected
         */
        className: 'Test.Playwright.Component.DockStaticBoot.Workspace',
        /**
         * Always-visible, pane-independent: the control that proves the header rendered at all, so
         * reload's absence cannot pass by the whole toolbar being missing.
         * @member {Boolean} enableDockCloseAction=true
         */
        enableDockCloseAction: true,
        /**
         * The subject: its projected row is constant while its `hidden` state is pane-dependent.
         * @member {Boolean} enableDockReloadAction=true
         */
        enableDockReloadAction: true,
        /**
         * @member {String} id='dock-static-boot-workspace'
         */
        id: 'dock-static-boot-workspace',
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'}
    }

    /**
     * Assembles the first projection statically. Deliberately no `onDockZoneDocumentChange`.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        this.add(this.projectDockModel())
    }

    /**
     * @param {String} itemId
     * @param {Object} item
     * @returns {Object}
     */
    resolvePane(itemId, item) {
        return itemId === 'contract'
            ? {module: ContractPane, id: `dock-static-boot-pane-${itemId}`, text: item?.title || itemId}
            : {id: `dock-static-boot-pane-${itemId}`, ntype: 'component', text: item?.title || itemId}
    }
}

StaticBootFixtureWorkspace = Neo.setupClass(StaticBootFixtureWorkspace);

export const onStart = () => Neo.app({
    mainView: {
        module: Viewport,
        items : [
            {module: StaticBootFixtureWorkspace, dockModel: staticDocument, flex: 1}
        ]
    },
    name: 'Test.Playwright.DockStaticBoot'
});
