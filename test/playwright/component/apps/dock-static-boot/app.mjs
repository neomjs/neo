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
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * Arms the overlap: after the mount hook has taken its (empty) sample, install a tail that
         * REPLACES itself from inside its own `then`. The replacement therefore lands while the
         * deferred sweep is awaiting — the only moment the contested state exists. Staging both
         * promises up front cannot reach it: the deferral has not fired, so the sweep would sample
         * the replacement and never enter the race.
         * @member {Boolean} armTailReplacement=false
         */
        armTailReplacement_: false,
        /**
         * Spec trigger: settles the replacement tail. Each bump releases it once.
         * @member {Number} releaseTailCount=0
         */
        releaseTailCount_: 0,
        /**
         * Observable: how many times the boot sweep has actually run. The spec asserts this is
         * still 0 after the sampled tail settles, which is exactly what a single-sample await
         * cannot satisfy.
         * @member {Number} sweepCount=0
         */
        sweepCount_: 0,
        /**
         * Observable: set the instant the sampled tail is consumed, i.e. the sweep has reached its
         * await. The spec polls this instead of sleeping.
         * @member {Boolean} tailReplaced=false
         */
        tailReplaced_: false
    }

    /**
     * The resolver of the replacement tail, held until `releaseTailCount` bumps.
     * @member {Function|null} releaseTail=null
     */
    releaseTail = null

    /**
     * Counts real sweeps so the spec can assert the absence of a write, not merely the absence of
     * a rendered symptom — a hidden action and an un-run sweep look identical in the DOM.
     * @param {Map|null} [tabs=null]
     * @returns {*}
     */
    syncDockHeaderActions(tabs=null) {
        this.sweepCount++;
        return super.syncDockHeaderActions(tabs)
    }

    /**
     * Installs the self-replacing tail AFTER the hook has sampled, so the sweep is already
     * committed to awaiting when the replacement arrives.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @returns {Promise|null}
     */
    afterSetMounted(value, oldValue) {
        const chain = super.afterSetMounted(value, oldValue);

        if (value && this.armTailReplacement) {
            const me          = this,
                  replacement = new Promise(resolve => {me.releaseTail = resolve});

            me.refreshPromise = {
                then(onFulfilled) {
                    me.refreshPromise = replacement;
                    me.tailReplaced   = true;
                    onFulfilled?.();
                    return Promise.resolve()
                }
            }
        }

        return chain
    }

    /**
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetReleaseTailCount(value, oldValue) {
        oldValue !== undefined && value > 0 && this.releaseTail?.()
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

// The overlap arm boots this SAME module from a sibling page whose `neo-config.json` sets
// `dockStaticBootOverlap`, so one app serves both the plain static-boot witness and the
// contested-tail witness. A URL query cannot carry it: this module runs in the App Worker, where
// `location` is the worker script rather than the page.
const overlapArmed = Neo.config.dockStaticBootOverlap === true;

export const onStart = () => Neo.app({
    mainView: {
        module: Viewport,
        items : [
            {module: StaticBootFixtureWorkspace, armTailReplacement: overlapArmed, dockModel: staticDocument, flex: 1}
        ]
    },
    name: 'Test.Playwright.DockStaticBoot'
});
