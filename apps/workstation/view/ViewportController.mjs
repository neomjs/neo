import Controller          from '../../../src/controller/Component.mjs';
import Transaction         from '../../../src/manager/Transaction.mjs';
import Workspace           from './Workspace.mjs';
import {resolveBootIntent} from '../BootIntent.mjs';

/**
 * @summary Decides one Workstation window's boot from the registry, and creates a root only where no owner exists.
 *
 * A window's URL says what it is FOR — `?popout=<id>`, `?workspace=<key>`, or the default root — and the
 * Group registry says what it is BOUND TO. Both are readable synchronously inside the App worker: the URL
 * from the config the main thread registered for the window, the binding from `Neo.manager.Transaction`,
 * which the engine admits at app registration. A held identity (a reload, a reserved slot) is bound before
 * this view constructs; a minted one is bound through the manager's `bind` event once its carrier accepts.
 * So the decision needs no round-trip to the main thread — which is what let the previous shape fail
 * silently: an awaited URL read inside an async `onConstructed` turned a boot defect into an unhandled
 * rejection that nothing listened for.
 *
 * The decision is deliberately narrow. A window that has an owner — a live root whose Group this window is
 * bound into — renders NOTHING here: the owner adopts it when the worker publishes the window's `connect`
 * (see {@link Workstation.view.WorkspaceController#onWindowConnect}). This controller only refuses what
 * cannot be adopted and creates a root where none exists. Nothing in it resolves another component's
 * controller to address that component.
 *
 * @class Workstation.view.ViewportController
 * @extends Neo.controller.Component
 */
class ViewportController extends Controller {
    static config = {
        /**
         * @member {String} className='Workstation.view.ViewportController'
         * @protected
         */
        className: 'Workstation.view.ViewportController'
    }

    /**
     * Whether this window's boot has been decided. One window, one decision: a `bind` arriving after a held
     * identity already decided the boot — a blank-root restart re-admits the same window — must not decide it
     * again.
     * @member {Boolean} #decided=false
     * @private
     */
    #decided = false

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        Transaction.on({
            admissionRefused: this.onAdmissionRefused,
            bind            : this.onGroupBind,
            scope           : this
        })
    }

    /**
     * @param {...*} args
     */
    destroy(...args) {
        Transaction.un({
            admissionRefused: this.onAdmissionRefused,
            bind            : this.onGroupBind,
            scope           : this
        });

        super.destroy(...args)
    }

    /**
     * What this window booted FOR, read from the URL the main thread registered for it: the mode by a
     * parameter's presence, the key by its value — the one reading the owner shares.
     * @member {{mode: String, key: String|null, params: URLSearchParams}} bootIntent
     */
    get bootIntent() {
        return resolveBootIntent(this.component.windowId)
    }

    /**
     * @summary Marks a pop-out host and decides a boot whose binding already settled.
     *
     * A held identity binds synchronously at app registration, before the viewport constructs, so its binding
     * is readable now. A minted identity is still awaiting its carrier; {@link #onGroupBind} decides that one.
     */
    onComponentConstructed() {
        const me = this;

        if (me.bootIntent.mode === 'popout') {
            me.component.addCls('workstation-popout-host')
        }

        me.decide(Transaction.findByWindow(me.component.windowId))
    }

    /**
     * @summary The carrier refused this window's identity: nothing can own it, so the window says so.
     * @param {Object} data
     * @param {String} data.windowId
     */
    onAdmissionRefused({windowId}) {
        windowId === this.component.windowId && this.decide(null, true)
    }

    /**
     * @summary A minted identity's carrier accepted: this window's binding exists now.
     * @param {Object} data
     * @param {String} data.windowId
     */
    onGroupBind({windowId}) {
        windowId === this.component.windowId && this.decide(Transaction.findByWindow(windowId))
    }

    /**
     * @summary Refuses what no owner can adopt, creates a root where none exists, and otherwise renders nothing.
     *
     * | URL                 | the binding says                            | this window does                                                   |
     * |---------------------|---------------------------------------------|--------------------------------------------------------------------|
     * | `?popout=<id>`      | anything                                    | nothing — the owner's tear-out lifecycle or its `connect` adoption mounts the vessel |
     * | `?workspace=<key>`  | bound under `key`, with a live root         | nothing — the root adopts on `connect`                             |
     * | `?workspace=<key>`  | anything else                               | the refusal, fail-closed                                            |
     * | default             | `main`, and the Group holds a live root     | nothing — the retained root moves in on `connect`                   |
     * | default             | `main`, no root                             | creates the root                                                   |
     * | default             | not `main`, or refused                      | the waiting notice {@link #createRoot} renders for a non-root slot  |
     *
     * @param {Object|null} binding The window's Group binding, `null` while none exists.
     * @param {Boolean} [refused=false] Whether the carrier refused the identity, which is final.
     * @returns {Promise<void>|undefined} The root creation, when this window creates one.
     */
    decide(binding, refused=false) {
        const me = this, {component} = me;

        if (me.#decided || component.isDestroyed || (!binding && !refused)) return;

        me.#decided = true;

        const intent = me.bootIntent;

        if (intent.mode === 'popout') return;

        if (intent.mode === 'workspace') {
            const root = binding && ViewportController.rootOf(Transaction.getParticipant(binding.groupId, binding.workspaceKey));

            if (!root || binding.workspaceKey !== intent.key) {
                component.add({ntype: 'component', html: 'This saved window is waiting for its original workspace.'})
            }

            return
        }

        if (binding?.workspaceKey === 'main' && ViewportController.rootOf(Transaction.getParticipant(binding.groupId, Workspace.MAIN_WORKSPACE_ID))) {
            return
        }

        return me.createRoot(binding, intent.params.get('layout') ?? undefined).catch(error => {
            console.error('[Workstation] root creation failed', error)
        })
    }

    /**
     * The live root a Group participant resolves to: the participant's own component when it is a root, its
     * `rootWorkspace` when it is a popup owner, `null` when it resolves to nothing live.
     * @param {Object|null} participant
     * @returns {Neo.component.Base|null}
     */
    static rootOf(participant) {
        const owner = participant?.componentId && Neo.getComponent(participant.componentId),
              root  = owner?.rootWorkspace ?? owner;

        return root && !root.isDestroyed ? root : null
    }

    /**
     * @summary Hydrates one explicitly selected topology before mounting its root render target.
     * @description Only a root binding can read storage. Popup carriers never select saved roots.
     * The library is reused with the Workspace on warm reload; this path runs only for a new heap owner.
     * @param {Object|null} binding The admitted Group binding, `null` when admission was refused.
     * @param {String} [layoutId] Omission uses only the persisted activeLayoutId.
     * @returns {Promise<void>}
     */
    async createRoot(binding, layoutId) {
        const me = this, view = me.component;

        if (!binding || binding.workspaceKey !== 'main') {
            view.add({ntype: 'component', html: 'This window is waiting for its original workspace.'});
            return
        }

        const {default: TopologyLibrary} = await import('../../../src/dashboard/dock/persistence/TopologyLibrary.mjs'),
              library                    = Neo.create(TopologyLibrary, {
                  persistenceAdapter: TopologyLibrary.createIndexedDBAdapter(binding.groupId)
              }),
              loaded = await library.hydrate();

        let selection = {topology: null, errors: []}, workspace;
        if (loaded.hydrated || layoutId !== undefined) selection = library.prepareSelection(layoutId);

        const errors = [...loaded.errors, ...selection.errors];
        if (selection.topology && !selection.topology.workspaces[Workspace.MAIN_WORKSPACE_ID]) {
            errors.push('saved topology has no Workstation root')
        }

        if (view.isDestroyed || errors.length) {
            library.destroy();
            if (!view.isDestroyed) me.showRootFailure();
            return
        }

        try {
            workspace = Neo.create(Workspace, {
                flex           : 1,
                initialTopology: selection.topology,
                topologyGroupId: binding.groupId,
                topologyLibrary: library,
                windowId       : view.windowId
            });

            if (selection.topology) {
                await Transaction.write({
                    cause       : 'cold-hydrate',
                    changes     : Object.entries(selection.topology.workspaces).map(([workspaceKey, document]) => ({workspaceKey, input: document})),
                    cursorAction: 'preserve',
                    descriptor  : {operation: 'hydrateTopology', layoutId: selection.topology.layoutId},
                    groupId     : binding.groupId,
                    provenance  : {source: 'cold-hydrate'}
                });
                library.adoptCollection(selection.collection, {expectedVersion: selection.version})
            }

            if (view.isDestroyed) {
                workspace.destroy();
                return
            }

            // The attach must follow the cold-hydrate write, so it stays a step of this boot; moving the
            // persistence cluster onto its owner is a separate change.
            workspace.getController().attachTopologyLibrary();
            view.add(workspace);
            if (!selection.topology) await workspace.saveTopology()
        } catch (error) {
            workspace?.destroy();
            library.destroy();
            if (!view.isDestroyed) me.showRootFailure();
            throw error
        }
    }

    /**
     * @summary Offers an explicit fresh root when a persisted selection cannot be used.
     */
    showRootFailure() {
        this.component.add([
            {ntype: 'component', html: 'The saved workspace could not be loaded.'},
            {ntype: 'button', text: 'Start a new workspace', handler: 'onStartBlankRoot'}
        ])
    }

    /**
     * @summary Declarative handler: starts a new logical root without replacing the refused saved collection.
     *
     * Re-admission binds this same window again, which the manager publishes as a `bind`; the boot was
     * decided long before, so that event changes nothing here.
     * @returns {Promise<void>}
     */
    async onStartBlankRoot() {
        const me = this, view = me.component, {windowId} = view;

        Transaction.release(windowId);

        const binding = await Transaction.admit({topologyIdentity: {}, windowId});

        if (binding.outcome === 'refused' || view.isDestroyed) return;

        view.removeAll();
        await me.createRoot(binding)
    }
}

export default Neo.setupClass(ViewportController);
