import Controller                                      from '../../../src/controller/Component.mjs';
import InstanceManager                                 from './fleet/InstanceManager.mjs';
import {createFleetProfile}                            from '../fleet/connectionProfiles.mjs';
import {establishFleetSessionCustody, resolveFleetUrl} from '../fleet/fleetSessionCustody.mjs';
import {installFleetBridge}                            from '../fleet/installFleetBridge.mjs';
import {
    INSTANCE_ROSTER_STORAGE_KEY,
    reviveInstanceRoster,
    serializeInstanceRoster
} from '../fleet/instanceRosterStorage.mjs';

/**
 * @class AgentOS.view.ViewportController
 * @extends Neo.controller.Component
 */
class ViewportController extends Controller {
    static config = {
        className: 'AgentOS.view.ViewportController',
        routes   : {
            '/accounts': 'onAccountsRoute',
            '/chat'    : 'onChatRoute',
            '/fleet'   : 'onFleetRoute',
            '/home'    : 'onHomeRoute'
        }
    }

    /**
     * @summary Applies the persisted harness theme before the viewport settles, then hydrates the
     * configured-instances roster.
     */
    onComponentConstructed() {
        let me = this;

        Neo.main.addon.LocalStorage.readLocalStorageItem({
            key     : 'agentosTheme',
            windowId: me.windowId
        }).then(({value}) => {
            if (value) {
                me.setTheme(value, false)
            } else if (Neo.config.prefersDarkTheme) {
                me.setTheme('neo-theme-neo-dark', false)
            }
        });

        me.initInstanceRoster()
    }

    /**
     * @summary Hydrates the configured-instances Store from storage, seeds the boot profile, and
     * mirrors the bound-instance fact.
     *
     * The Store is the view BINDING; `connectionProfiles.mjs` stays the record authority — revive
     * re-runs the closed-schema guard per row and DROPS refused rows loudly (console, not crash:
     * one corrupted row must not brick the switcher). The boot endpoint (`resolveFleetUrl`) seeds
     * as a profile when absent, so the implicit single instance becomes the roster's first honest
     * row. Bound truth is mirrored FROM the published bridge, never stored.
     */
    async initInstanceRoster() {
        let me    = this,
            store = me.component.stateProvider.getStore('fleetInstances'),
            seeded, value;

        let readError = null;

        try {
            ({value} = await Neo.main.addon.LocalStorage.readLocalStorageItem({
                key     : INSTANCE_ROSTER_STORAGE_KEY,
                windowId: me.windowId
            }))
        } catch (error) {
            // Collapsing an unreadable store into `null` made it indistinguishable from an unset key.
            // That is the worse half of this defect: the roster is intact on disk and maximally
            // recoverable, and the operator is told nothing at all.
            readError = error?.message ?? String(error);
            value     = null
        }

        const {records, dropped, envelope} = reviveInstanceRoster(value);

        dropped.forEach(({reason}) => console.warn(`fleet instance roster: dropped a stored row — ${reason}`));

        // Damage is not absence, and the difference has to govern the WRITE as much as the warning.
        const damaged = Boolean(readError) || envelope === 'unparseable' || envelope === 'not-an-array';

        // An envelope failure yields an EMPTY `dropped`, so the per-row warning above cannot fire for
        // it. Without this the switcher seeds the boot profile, shows exactly one instance, and is
        // indistinguishable from a fresh install while every configured instance is gone from view.
        if (readError) {
            console.warn(`fleet instance roster: storage unreadable, showing none of your configured instances — ${readError}`)
        } else if (damaged) {
            console.warn(`fleet instance roster: stored value is ${envelope}, showing none of your configured instances — the value is still on disk under "${INSTANCE_ROSTER_STORAGE_KEY}" and recoverable`)
        }
        records.length > 0 && store.add(records.map(record => ({...record})));

        // seed the boot endpoint as the roster's first row — the previously-implicit ONE instance
        // becomes explicit, honest state (unlabeled: the endpoint IS the identity; labels are UX)
        const bootProfile = createFleetProfile({custodian: 'session-only', endpoint: resolveFleetUrl()});

        if (!store.get(bootProfile.profileId)) {
            store.add({...bootProfile});
            seeded = true
        }

        // The seed lives in MEMORY on a damaged read, never on disk. Seeding leaves the store holding
        // exactly the boot profile, so `seeded` is true on damage too — and persisting there would
        // overwrite `agentosFleetInstances.v1` milliseconds after telling the operator the value is
        // "still on disk and recoverable". A warning whose own function destroys its subject is worse
        // than the silence it replaced: it is silence with a receipt. Row-level `dropped` still
        // persists, because there the envelope parsed and re-writing the survivors IS the salvage.
        (!damaged && (seeded || dropped.length > 0)) && me.persistInstanceRoster();
        me.syncBoundInstance()
    }

    /**
     * @summary Mirrors the published bridge's `profileId` — the bound-instance SSOT — into
     * provider data for the chrome to bind. A read-and-project, never a second store.
     */
    syncBoundInstance() {
        this.component.stateProvider.setData({
            boundProfileId: globalThis.AgentOS?.fleet?.registryBridge?.profileId ?? null
        })
    }

    /**
     * @summary Persists the roster Store's rows through the storage policy module. The projection
     * is explicit and omits empty optionals, so every stored row re-passes the closed-schema guard.
     */
    persistInstanceRoster() {
        let me    = this,
            store = me.component.stateProvider.getStore('fleetInstances'),
            rows  = store.items.map(record => ({
                canonicalEndpoint: record.canonicalEndpoint,
                contractVersion  : record.contractVersion,
                custodian        : record.custodian,
                generation       : record.generation,
                profileId        : record.profileId,
                ...(record.label        ? {label: record.label}               : {}),
                ...(record.bearerEnvVar ? {bearerEnvVar: record.bearerEnvVar} : {})
            }));

        Neo.main.addon.LocalStorage.updateLocalStorageItem({
            key     : INSTANCE_ROSTER_STORAGE_KEY,
            value   : serializeInstanceRoster(rows),
            windowId: me.windowId
        })
    }

    /**
     * @summary The switcher's `switchinstance` intent → the deliberate custody path.
     * @param {Object} data `{profileId}`
     */
    onSwitchInstance({profileId}) {
        let me     = this,
            record = me.component.stateProvider.getStore('fleetInstances').get(profileId);

        record && me.switchToProfile(record)
    }

    /**
     * @summary Rebinds the cockpit to one profile through the C1 custody path — the switch arc:
     * deliberate establish (bearer-less publishes the chosen instance FAIL-CLOSED — honest state,
     * never the old instance impersonating the choice), bound-fact re-mirror, tear-out title push
     * (scope is a per-window fact), and the cockpit's own full re-drive behind its generation
     * fences (no cross-instance bleed by construction).
     * @param {Object} record            A `fleetInstances` row.
     * @param {Object} [opts]
     * @param {String} [opts.bearerToken=null] Session-only fleet bearer — used once, never stored.
     * @returns {Promise<Boolean>} whether custody VERIFIED (authenticated whoami + ingress retire).
     */
    async switchToProfile(record, {bearerToken = null} = {}) {
        let me       = this,
            provider = me.component.stateProvider;

        provider.setData({instanceState: 'starting'});

        const {verified} = establishFleetSessionCustody({
            deliberate: true,
            fleetUrl  : record.canonicalEndpoint,
            redeemed  : bearerToken ? {bearerToken} : null
        });

        me.syncBoundInstance();
        me.pushTearOutTitles();

        const cockpit = me.getReference('fleet-cockpit');

        cockpit?.reconnectFleet();

        const ok = await verified;

        // the banner mirror owns the ONGOING state word; this only settles the transition verdict
        ok || provider.setData({instanceState: 'off'});

        return ok
    }

    /**
     * @summary Re-pushes the bound instance's label into every torn-out window's title after a
     * switch — the §7 gate decision (scope is a per-window fact). Composition lives with the
     * cockpit's `pushInstanceTitle` (one title authority); this just sweeps the owner-held
     * `tearOutConnects` map. Runs AFTER `syncBoundInstance`, so the titles speak the NEW binding.
     */
    pushTearOutTitles() {
        let cockpit = this.getReference('fleet-cockpit');

        cockpit && Object.values(cockpit.tearOutConnects ?? {}).forEach(({windowId}) => {
            windowId && cockpit.pushInstanceTitle(windowId)
        })
    }

    /**
     * @summary The switcher's `manageinstances` intent → reveal the manage drawer.
     */
    onManageInstances() {
        this.toggleInstanceManager(true)
    }

    /**
     * @summary The manage drawer's `closemanager` intent.
     */
    onCloseManager() {
        this.toggleInstanceManager(false)
    }

    /**
     * @summary Mounts/unmounts the manage drawer as a viewport overlay (reveal/dismiss class —
     * dismissed chrome leaves the tree, per the §06 motion ladder).
     * @param {Boolean} open
     */
    toggleInstanceManager(open) {
        let me       = this,
            viewport = me.component,
            existing = me.getReference('instance-manager');

        if (open && !existing) {
            viewport.add({
                module   : InstanceManager,
                reference: 'instance-manager',
                bind     : {
                    boundProfileId: data => data.boundProfileId,
                    instanceStore : 'stores.fleetInstances'
                },
                listeners: {
                    closemanager   : 'onCloseManager',
                    connectinstance: 'onConnectInstance',
                    connectplane   : 'onConnectPlane',
                    probeinstance  : 'onProbeInstance',
                    retireinstance : 'onRetireInstance',
                    saveinstance   : 'onSaveInstance'
                }
            })
        } else if (!open && existing) {
            viewport.remove(existing, true)
        }
    }

    /**
     * @summary Create or label-edit one instance over the C1 module — the ONLY write authority.
     * Refusals surface the module's own message verbatim (its vocabulary is the contract).
     * @param {Object} data `{endpoint, label, profileId, source}`
     */
    onSaveInstance({endpoint, label, profileId, source}) {
        let me    = this,
            store = me.component.stateProvider.getStore('fleetInstances'),
            record;

        if (profileId) {
            // label edit — the endpoint IS the identity and never mutates on an existing row
            record = store.get(profileId);

            if (record) {
                record.label = label || null;
                me.persistInstanceRoster();
                source.notice = {tone: 'ok', text: 'label saved'};
                me.refreshInstanceViews(source)
            }
            return
        }

        try {
            record = createFleetProfile({custodian: 'session-only', endpoint, ...(label ? {label} : {})})
        } catch (error) {
            source.notice = {tone: 'refused', text: error.message};
            return
        }

        if (store.get(record.profileId)) {
            source.notice = {tone: 'refused', text: 'already configured — the endpoint IS the identity'};
            return
        }

        store.add({...record});
        me.persistInstanceRoster();
        source.onClearClick();
        source.notice = {tone: 'ok', text: `added — ${record.profileId}`};
        me.refreshInstanceViews(source)
    }

    /**
     * @summary Retire one instance row. The BOUND instance refuses — switch away first; an operator
     * must never saw off the branch the cockpit sits on without choosing where to land.
     * @param {Object} data `{profileId, source}`
     */
    onRetireInstance({profileId, source}) {
        let me       = this,
            provider = me.component.stateProvider,
            store    = provider.getStore('fleetInstances'),
            record   = store.get(profileId);

        if (!record) return;

        if (profileId === provider.getData('boundProfileId')) {
            source.notice = {tone: 'refused', text: 'the bound instance cannot retire — switch away first'};
            return
        }

        store.remove(record);
        source.selectedProfileId === profileId && (source.selectedProfileId = null);
        me.persistInstanceRoster();
        source.notice = {tone: 'ok', text: 'retired'};
        me.refreshInstanceViews(source)
    }

    /**
     * @summary Reachability probe for one instance endpoint — transport-level, credential-free.
     * ANY HTTP answer is "reachable" (401 named as auth-gated); only a network refusal is
     * "unreachable", and the wording owns the CORS ambiguity instead of hiding it.
     * @param {Object} data `{profileId, source}`
     */
    async onProbeInstance({profileId, source}) {
        let record = this.component.stateProvider.getStore('fleetInstances').get(profileId);

        if (!record) return;

        try {
            const response = await fetch(record.canonicalEndpoint);

            source.notice = {
                tone: 'ok',
                text: `reachable — HTTP ${response.status}${response.status === 401 ? ' (authentication required)' : ''}`
            }
        } catch {
            source.notice = {tone: 'refused', text: 'unreachable from this origin (network or CORS refused)'}
        }
    }

    /**
     * @summary Connect + switch: the bearer goes STRAIGHT into the deliberate custody establish —
     * entry to transport closure in one action, nothing stored, outcome from the verify verdict.
     * @param {Object} data `{profileId, bearerToken, source}`
     */
    async onConnectInstance({profileId, bearerToken, source}) {
        let me     = this,
            record = me.component.stateProvider.getStore('fleetInstances').get(profileId);

        if (!record) return;

        if (!bearerToken) {
            source.notice = {tone: 'refused', text: 'a fleet process bearer is required to connect'};
            return
        }

        const verified = await me.switchToProfile(record, {bearerToken});

        source.notice = verified
            ? {tone: 'ok', text: 'connected — custody verified, ingress retired'}
            : {tone: 'refused', text: 'bearer refused or endpoint unreachable — the fail-closed bridge is published'}
    }

    /**
     * @summary Plane admission: the forge PAT rides the authenticated wire INBOUND
     * once through `connectTenant`; the outcome is the service's PUBLIC projection (closed
     * vocabulary, never the credential). Success re-drives the cockpit, whose identity re-read is
     * what clears the operator-seat conflation marker — the journey's visible proof.
     * @param {Object} data `{tenantUrl, credential, source}`
     */
    async onConnectPlane({tenantUrl, credential, source}) {
        let me     = this,
            bridge = globalThis.AgentOS?.fleet?.registryBridge;

        if (!bridge) {
            source.notice = {tone: 'refused', text: 'no live instance bridge — connect the instance first'};
            return
        }

        const result = await bridge.connectTenant({credential, tenantUrl})
            .catch(error => ({status: 'rejected', reason: error.message}));

        if (result?.status === 'connected') {
            source.notice = {tone: 'ok', text: `tenant connected — ${result.id}`};
            me.getReference('fleet-cockpit')?.reconnectFleet()
        } else {
            source.notice = {tone: 'refused', text: result?.reason ?? 'tenant connection rejected'}
        }
    }

    /**
     * @summary Explicit post-mutation re-render of the two roster consumers — v1 keeps the render
     * trigger visible instead of hiding it behind store-mutation plumbing.
     * @param {AgentOS.view.fleet.InstanceManager} [manager]
     */
    refreshInstanceViews(manager) {
        manager?.updateInstanceList();
        this.getReference('instance-switcher')?.updateSwitcher()
    }

    /**
     * @summary The ONE product-shaped Fleet-bridge injector — (re)wires the authenticated
     * app↔fleet transport in the App-Worker realm, where the bridge actually lives.
     *
     * Why this exists: the process bearer is an in-memory hand-off and the bearer slot the boot
     * path reads lives in the App Worker's global — a realm no page-side init script can reach.
     * So the Option-B delivery story is boot-fail-closed, then inject THROUGH the worker: the
     * Neural Link (dev browser), the Electron main process (product), and the e2e fixture (tests)
     * all call exactly this method, and `installFleetBridge` being idempotent makes the re-wire
     * safe at any time. The bearer arrives as an argument and is handed straight through — never
     * stored on the controller, never logged, never readable back off this surface.
     *
     * @param {Object} config `{url, bearerToken}` — the loopback fleet endpoint + process bearer;
     *     `installFleetBridge` enforces the URL policy and refuses credential-shaped query params.
     * @returns {Boolean} true once the authenticated bridge is (re)published — the bridge object
     *     itself deliberately does not cross this seam (Neural Link callers get a serializable ack,
     *     not a live handle carrying the credentialed `send`).
     */
    wireFleetBridge(config) {
        // The injector IS the selection act: Neural Link, tests, and dev tooling wiring a bridge
        // here means "this source was deliberately chosen" — its empty registry renders the true
        // zero state. The packaged/default boot installs elsewhere and keeps the sample flagship.
        installFleetBridge({...config, selected: true});
        return true
    }

    /**
     * @summary Activates the shell keeper-view whose header button owns the route.
     * @param {String} route
     */
    activateRoute(route) {
        let shell = this.getReference('shell'),
            tab   = shell?.getTabBar()?.items?.find(button => button.route === route);

        if (tab) {
            shell.activeIndex = tab.index
        }
    }

    /**
     * @summary Activates the Accounts keeper-view from the route.
     */
    onAccountsRoute() {
        this.activateRoute('/accounts')
    }

    /**
     * @summary Activates the Chat keeper-view from the route.
     */
    onChatRoute() {
        this.activateRoute('/chat')
    }

    /**
     * @summary Activates the Fleet keeper-view from the route.
     */
    onFleetRoute() {
        this.activateRoute('/fleet')
    }

    /**
     * @summary Activates the Home keeper-view from the route.
     */
    onHomeRoute() {
        this.activateRoute('/home')
    }

    /**
     * @summary Toggles the harness between the Neo dark and light themes.
     * @param {Object} data
     */
    async onSwitchTheme(data) {
        let me       = this,
            viewport = me.component,
            oldTheme = viewport.theme || 'neo-theme-neo-light',
            newTheme = oldTheme === 'neo-theme-neo-light' ? 'neo-theme-neo-dark' : 'neo-theme-neo-light',
            radius, x, y;

        if (data.clientX !== undefined && data.clientY !== undefined) {
            x      = data.clientX;
            y      = data.clientY;
            radius = Math.hypot(Math.max(x, 3000 - x), Math.max(y, 3000 - y))
        } else {
            x      = 0;
            y      = 0;
            radius = 3000
        }

        await Neo.main.DomAccess.startViewTransition({
            animate: {
                keyframes: [
                    {clipPath: `circle(0px at ${x}px ${y}px)`},
                    {clipPath: `circle(${radius}px at ${x}px ${y}px)`}
                ],
                options: {
                    duration     : 500,
                    easing       : 'ease-in',
                    pseudoElement: '::view-transition-new(root)'
                }
            },
            delay   : 100,
            windowId: me.windowId
        });

        me.setTheme(newTheme)
    }

    /**
     * @summary Applies and persists the active harness theme.
     * @param {String} theme
     * @param {Boolean} [updateStorage=true]
     */
    setTheme(theme, updateStorage=true) {
        let me      = this,
            btn     = me.getReference('theme-switch-button'),
            iconCls = theme === 'neo-theme-neo-dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';

        me.component.theme = theme;

        if (btn) {
            btn.iconCls = iconCls
        }

        if (updateStorage) {
            Neo.main.addon.LocalStorage.updateLocalStorageItem({
                key     : 'agentosTheme',
                value   : theme,
                windowId: me.windowId
            })
        }
    }
}

export default Neo.setupClass(ViewportController);
