import Button        from '../../../../src/button/Base.mjs';
import Container     from '../../../../src/container/Base.mjs';
import Component     from '../../../../src/component/Base.mjs';
import PasswordField from '../../../../src/form/field/Password.mjs';
import TextField     from '../../../../src/form/field/Text.mjs';
import {stateClass}  from './StateDot.mjs';

/**
 * @class AgentOS.view.fleet.InstanceManager
 * @extends Neo.container.Base
 *
 * @summary The manage-instances surface — a Settings-class drawer pane over the C1
 * profile contract, reached from the switcher menu's terminal row (never a rail keeper view).
 *
 * Custody discipline, stated because the layout encodes it:
 * - The EDITOR carries no credential field at all. A credential held between "save" and "use"
 *   would be Body-readable storage — the exact thing `connectionProfiles.mjs` forbids. Credentials
 *   flow only through one-action paths: the per-row **Connect** verb (fleet bearer → straight into
 *   the custody establish, field cleared) and the **plane admission** form (forge PAT →
 *   `connectTenant` over the authenticated wire, field cleared). Both fields are `Password` type
 *   and reset on submit; nothing echoes back.
 * - The ENDPOINT is identity (`deriveFleetProfileId` accepts only the endpoint), so it is
 *   immutable on existing rows: edit means LABEL edit; a different endpoint is a new instance.
 * - Custodian shapes render ALL THREE with their availability as TEXT — `session-only` is the one
 *   available custodian today; the other two name the custody leg that lands them instead of
 *   hiding (honest absence — the same discipline as the activity stream's actor chip).
 *
 * Like every fleet form (`OperatorComposeForm` precedent) this surface fires INTENT events only —
 * `saveinstance` / `retireinstance` / `probeinstance` / `connectinstance` / `connectplane` /
 * `closemanager` — and renders outcomes it is GIVEN via {@link #notice}; the controller owns every
 * transport and custody call.
 */
class InstanceManager extends Container {
    static config = {
        /**
         * @member {String} className='AgentOS.view.fleet.InstanceManager'
         * @protected
         */
        className: 'AgentOS.view.fleet.InstanceManager',
        /**
         * @member {String[]} cls=['fm-instance-manager']
         * @reactive
         */
        cls: ['fm-instance-manager'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * The provider-scoped configured-instances Store (C1 records) — injected via bind,
         * never created here.
         * @member {Neo.data.Store|null} instanceStore_=null
         * @reactive
         */
        instanceStore_: null,
        /**
         * The bound instance's profileId (bridge SSOT, mirrored) — marks the row + scopes the
         * plane-admission section to the instance it actually talks to.
         * @member {String|null} boundProfileId_=null
         * @reactive
         */
        boundProfileId_: null,
        /**
         * The row selected for label edit / connect, or `null` (create mode).
         * @member {String|null} selectedProfileId_=null
         * @reactive
         */
        selectedProfileId_: null,
        /**
         * The last action outcome to render — `{tone: 'ok'|'refused', text}` or `null`. Set by the
         * controller from CLOSED vocabularies (the tenant service's rejection reasons, the probe's
         * reachable/refused/unreachable verdicts); this surface never invents outcome text.
         * @member {Object|null} notice_=null
         * @reactive
         */
        notice_: null,
        /**
         * The skeleton is DECLARATIVE: header, list slot, editor form, connect form, plane form,
         * notice slot. Every handler is a `up.` string so the tree stays free of closures — the
         * lookup strips the prefix and walks `parent` until it finds the method on this class
         * (`resolveCallback`), which is what keeps the whole structure declarable here instead of
         * assembled in a lifecycle hook. Row CONTENT re-renders via {@link #updateInstanceList}.
         * @member {Object[]} items
         */
        items: [{
            module: Container,
            cls   : ['fm-im-head'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            items : [{
                module: Component,
                cls   : ['fm-im-title'],
                flex  : 1,
                text  : 'Instances'
            }, {
                module : Button,
                cls    : ['fm-im-close'],
                handler: 'up.onCloseClick',
                text   : 'Close'
            }]
        }, {
            module   : Component,
            cls      : ['fm-im-list'],
            flex     : 'none',
            reference: 'instance-list',

            domListeners: [{
                click   : 'up.onRowSelectClick',
                delegate: '.fm-im-row-main'
            }, {
                click   : 'up.onRowRetireClick',
                delegate: '.fm-im-retire'
            }, {
                click   : 'up.onRowProbeClick',
                delegate: '.fm-im-probe'
            }]
        }, {
            module   : Container,
            cls      : ['fm-im-editor'],
            flex     : 'none',
            layout   : {ntype: 'vbox', align: 'stretch'},
            reference: 'editor',
            items    : [{
                module   : Component,
                cls      : ['fm-im-section-label'],
                reference: 'editor-title',
                text     : 'Add instance'
            }, {
                module         : TextField,
                labelText      : 'Endpoint',
                labelWidth     : 90,
                name           : 'endpoint',
                reference      : 'endpoint-field',
                placeholderText: 'https://fleet.example.io — or http://127.0.0.1:8083/fleet'
            }, {
                module         : TextField,
                labelText      : 'Label',
                labelWidth     : 90,
                name           : 'label',
                reference      : 'label-field',
                placeholderText: 'mutable display name — never identity'
            }, {
                // the custodian ladder renders ALL shapes with availability as TEXT — the two
                // unavailable legs teach the operator the real system instead of vanishing
                module: Component,
                cls   : ['fm-im-custodians'],
                vdom  : {cn: [
                    {cls: ['fm-im-custodian', 'is-available'],   text: `session-only — available; the credential lives in transport closures and is re-entered per session`},
                    {cls: ['fm-im-custodian', 'is-unavailable'], text: `electron-main — not available in this build; packaged-shell custody, where the shell process holds the credential`},
                    {cls: ['fm-im-custodian', 'is-unavailable'], text: `env-indirection — not available in this build; a client file naming an environment variable, never its value`}
                ]}
            }, {
                module: Container,
                cls   : ['fm-im-actions'],
                layout: {ntype: 'hbox', align: 'center'},
                items : [{
                    module   : Button,
                    handler  : 'up.onSaveClick',
                    reference: 'save-button',
                    text     : 'Add'
                }, {
                    module   : Button,
                    cls      : ['fm-im-secondary'],
                    handler  : 'up.onClearClick',
                    reference: 'clear-button',
                    text     : 'Clear'
                }]
            }]
        }, {
            module   : Container,
            cls      : ['fm-im-connect'],
            flex     : 'none',
            layout   : {ntype: 'vbox', align: 'stretch'},
            reference: 'connect-section',
            items    : [{
                module   : Component,
                cls      : ['fm-im-section-label'],
                reference: 'connect-title',
                text     : 'Connect (fleet process bearer)'
            }, {
                module         : PasswordField,
                labelText      : 'Bearer',
                labelWidth     : 90,
                name           : 'fleetBearer',
                reference      : 'bearer-field',
                placeholderText: 'session-only custody — used once, never stored'
            }, {
                module   : Button,
                handler  : 'up.onConnectClick',
                reference: 'connect-button',
                text     : 'Connect + switch'
            }]
        }, {
            module   : Container,
            cls      : ['fm-im-plane'],
            flex     : 'none',
            layout   : {ntype: 'vbox', align: 'stretch'},
            reference: 'plane-section',
            items    : [{
                module: Component,
                cls   : ['fm-im-section-label'],
                text  : 'Plane admission (operator PAT)'
            }, {
                module: Component,
                cls   : ['fm-im-plane-note'],
                text  : 'Admits the BOUND instance to a tenant plane as the credential’s subject — there is no username field; the token proves the name. Success clears the operator-seat conflation marker.'
            }, {
                module         : TextField,
                labelText      : 'Tenant URL',
                labelWidth     : 90,
                name           : 'tenantUrl',
                reference      : 'tenant-url-field',
                placeholderText: 'the plane endpoint this instance should serve'
            }, {
                module         : PasswordField,
                labelText      : 'Forge PAT',
                labelWidth     : 90,
                name           : 'planeCredential',
                reference      : 'pat-field',
                placeholderText: 'rides the authenticated wire inbound once — never returned'
            }, {
                module   : Button,
                handler  : 'up.onAdmitClick',
                reference: 'admit-button',
                text     : 'Admit'
            }]
        }, {
            module   : Component,
            cls      : ['fm-im-notice'],
            flex     : 'none',
            reference: 'notice-line'
        }]
    }

    /**
     * @summary Renders the initial list + notice once the declared skeleton exists — the only work
     * this hook still owns, because the structure itself is config.
     * @param {...*} args
     */
    onConstructed(...args) {
        super.onConstructed(...args);

        this.updateInstanceList();
        this.updateNotice()
    }

    /**
     * @summary Close verb → the dismiss intent; the controller owns unmounting the drawer.
     */
    onCloseClick() {
        this.fire('closemanager', {source: this})
    }

    /**
     * @summary Roster swap: keep the list rendering the injected store, with load-tracking.
     * @param {Neo.data.Store|null} value
     * @param {Neo.data.Store|null} oldValue
     * @protected
     */
    afterSetInstanceStore(value, oldValue) {
        let me = this;

        oldValue?.un('load', me.onRosterLoad, me);
        value?.on('load', me.onRosterLoad, me);
        me.rendered && me.updateInstanceList()
    }

    /**
     * @summary Bound-instance change re-marks the list + re-scopes the connect/plane sections.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetBoundProfileId(value, oldValue) {
        this.rendered && this.updateInstanceList()
    }

    /**
     * @summary Selection drives edit-vs-create mode: fills the editor from the row (endpoint
     * IMMUTABLE — identity), retitles the save action.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetSelectedProfileId(value, oldValue) {
        let me            = this,
            record        = value && me.instanceStore?.get(value) || null,
            endpointField = me.getReference('endpoint-field'),
            labelField    = me.getReference('label-field');

        if (!endpointField) return;

        endpointField.value    = record?.canonicalEndpoint ?? '';
        endpointField.disabled = !!record;
        labelField.value       = record?.label ?? '';

        me.getReference('editor-title').text = record ? 'Edit instance (label — the endpoint IS the identity)' : 'Add instance';
        me.getReference('save-button').text  = record ? 'Save label' : 'Add';

        me.rendered && me.updateInstanceList()
    }

    /**
     * @summary Outcome line render — tone as class, text verbatim from the closed vocabulary.
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @protected
     */
    afterSetNotice(value, oldValue) {
        this.updateNotice()
    }

    /**
     * @summary Roster load → re-render rows.
     * @protected
     */
    onRosterLoad() {
        this.updateInstanceList()
    }

    /**
     * @summary Renders the instance rows: dot (bound state marking rides the switcher's truth, so
     * this list only marks WHICH row is bound), name, endpoint, custodian, and the row verbs.
     * @protected
     */
    updateInstanceList() {
        let me   = this,
            list = me.getReference('instance-list'),
            rows = me.instanceStore?.items ?? [];

        if (!list) return;

        list.vdom.cn = rows.length === 0 ? [{
            cls : ['fm-im-empty'],
            text: 'No instances configured — add the first one below.'
        }] : rows.map(record => {
            let bound    = record.profileId === me.boundProfileId,
                selected = record.profileId === me.selectedProfileId;

            return {
                cls: ['fm-im-row', ...(bound ? ['is-bound'] : []), ...(selected ? ['is-selected'] : [])],
                cn : [{
                    tag              : 'button',
                    cls              : ['fm-im-row-main'],
                    'data-profile-id': record.profileId,
                    title            : record.profileId,
                    cn               : [
                        {tag: 'span', cls: ['fm-state-dot', stateClass(bound ? 'ok' : 'off')], 'aria-hidden': 'true'},
                        {tag: 'span', cls: ['fm-im-row-name'],     text: record.label || record.canonicalEndpoint},
                        {tag: 'span', cls: ['fm-im-row-endpoint'], text: record.canonicalEndpoint},
                        {tag: 'span', cls: ['fm-im-row-custodian'], text: record.custodian},
                        ...(bound ? [{tag: 'span', cls: ['fm-im-row-boundword'], text: 'bound'}] : [])
                    ]
                }, {
                    tag              : 'button',
                    cls              : ['fm-im-probe'],
                    'data-profile-id': record.profileId,
                    text             : 'Probe'
                }, {
                    tag              : 'button',
                    cls              : ['fm-im-retire'],
                    'data-profile-id': record.profileId,
                    text             : 'Retire'
                }]
            }
        });

        list.update()
    }

    /**
     * @summary Renders the outcome line from {@link #notice}.
     * @protected
     */
    updateNotice() {
        let me     = this,
            line   = me.getReference('notice-line'),
            notice = me.notice;

        if (!line) return;

        line.cls  = ['fm-im-notice', ...(notice ? [`is-${notice.tone}`] : [])];
        line.text = notice?.text ?? ''
    }

    /**
     * @summary Extracts the event path's profileId (the MailboxPane dataset idiom).
     * @param {Object} data
     * @returns {String|undefined}
     * @protected
     */
    pathProfileId(data) {
        return data.path?.find(node => node.data?.profileId)?.data?.profileId
    }

    /**
     * @summary Row select toggles edit mode for that row.
     * @param {Object} data
     */
    onRowSelectClick(data) {
        let me = this,
            id = me.pathProfileId(data);

        me.selectedProfileId = me.selectedProfileId === id ? null : id
    }

    /**
     * @summary Retire verb → intent; the controller owns the store/persistence mutation.
     * @param {Object} data
     */
    onRowRetireClick(data) {
        let id = this.pathProfileId(data);

        id && this.fire('retireinstance', {profileId: id, source: this})
    }

    /**
     * @summary Probe verb → intent; the controller runs the detached reachability probe.
     * @param {Object} data
     */
    onRowProbeClick(data) {
        let id = this.pathProfileId(data);

        id && this.fire('probeinstance', {profileId: id, source: this})
    }

    /**
     * @summary Save: create (endpoint + label) or label-edit (selected row) — one intent, the
     * C1 module decides validity controller-side; refusals come back through {@link #notice}.
     */
    onSaveClick() {
        let me = this;

        me.fire('saveinstance', {
            endpoint : me.getReference('endpoint-field').value,
            label    : me.getReference('label-field').value,
            profileId: me.selectedProfileId,
            source   : me
        })
    }

    /**
     * @summary Clear resets to create mode.
     */
    onClearClick() {
        let me = this;

        me.selectedProfileId = null;
        me.getReference('endpoint-field').value = '';
        me.getReference('label-field').value    = '';
        me.notice = null
    }

    /**
     * @summary Connect + switch: hands the bearer STRAIGHT to the custody intent and clears the
     * field in the same tick — entry-to-closure in one action, no Body-state residence.
     */
    onConnectClick() {
        let me          = this,
            bearerField = me.getReference('bearer-field'),
            bearerToken = bearerField.value,
            profileId   = me.selectedProfileId ?? me.boundProfileId;

        bearerField.value = '';

        profileId && me.fire('connectinstance', {bearerToken: bearerToken || null, profileId, source: me})
    }

    /**
     * @summary Plane admission: tenant URL + PAT → the `connectTenant` intent; the PAT field
     * clears in the same tick (inbound once, never returned — the service's own boundary).
     */
    onAdmitClick() {
        let me         = this,
            patField   = me.getReference('pat-field'),
            credential = patField.value;

        patField.value = '';

        me.fire('connectplane', {
            credential,
            source   : me,
            tenantUrl: me.getReference('tenant-url-field').value
        })
    }

    /**
     * @summary Detach the roster listener with the pane.
     * @param args
     */
    destroy(...args) {
        this.instanceStore?.un('load', this.onRosterLoad, this);
        super.destroy(...args)
    }
}

export default Neo.setupClass(InstanceManager);
