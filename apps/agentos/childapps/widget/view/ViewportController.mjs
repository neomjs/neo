import Controller          from '../../../../../src/controller/Component.mjs';
import GridContainer       from '../../../../../src/grid/Container.mjs';
import {projectCreatedGrid} from '../util/createdGridEvidence.mjs';
import {validateRequest}    from '../util/validateRequest.mjs';

/**
 * The first widget's grid config. The controller boots it by `add()`-ing it to the stage — the same
 * `add → insert` path a Neural-Link `create_component` drives (it calls
 * `call_method(parentId, 'add', [config])`). Keeping ONE create path is the provenance point: whatever
 * lands in the stage — this in-app bootstrap or an external agent's `create_component` — is what the
 * evidence pane projects, so the evidence always describes the grid that actually crossed the create
 * path. The bootstrap uses `module` (the class is imported here, registering the live app); an external
 * agent sends `ntype`/`className` instead, since a module reference cannot cross the Neural Link wire.
 * @type {Object}
 */
const firstWidgetGridConfig = {
    id            : 'first-widget-grid',
    module        : GridContainer,
    cls           : ['agent-os-first-widget-grid'],
    columnDefaults: {width: 140},
    flex          : 1,
    columns: [
        {dataField: 'id',       text: 'ID'},
        {dataField: 'task',     text: 'Task'},
        {dataField: 'owner',    text: 'Owner'},
        {dataField: 'evidence', text: 'Evidence'}
    ],
    store: {
        keyProperty: 'id',
        model      : {fields: [
            {name: 'id',       type: 'String'},
            {name: 'task',     type: 'String'},
            {name: 'owner',    type: 'String'},
            {name: 'evidence', type: 'String'}
        ]},
        data: [
            {id: 'intent',   task: 'Verify intent', owner: 'Ada',           evidence: 'Blueprint'},
            {id: 'render',   task: 'Render grid',   owner: 'Runtime',       evidence: 'Live widget'},
            {id: 'evidence', task: 'Show evidence', owner: 'Evidence pane', evidence: 'Safe text'}
        ]
    }
};

/**
 * @class AgentOSWidget.view.ViewportController
 * @extends Neo.controller.Component
 * @summary Creates the first widget through the live create path and projects it into the evidence pane.
 *
 * Two responsibilities, one path. On construct it boots the first grid by `add()`-ing it to the stage
 * container (the same `add → insert` path a Neural-Link `create_component` drives), so the live grid is
 * created through the create seam rather than declared as a static item. It then observes the stage's
 * `insert` event — fired for that bootstrap AND for any later external `create_component` into the same
 * stage — and projects the actually-created grid into the evidence pane via {@link projectCreatedGrid},
 * so the evidence always describes the grid that crossed the bridge, not a hand-authored blueprint.
 * It also keeps the deterministic chat-intake submit handling. No model invocation / persistence.
 */
class ViewportController extends Controller {
    static config = {
        /**
         * @member {String} className='AgentOSWidget.view.ViewportController'
         * @protected
         */
        className: 'AgentOSWidget.view.ViewportController'
    }

    /**
     * Boots the first widget through the live create path: binds the stage's `insert` observer, then
     * `add()`s the grid config (firing `insert`, which {@link onStageInsert} projects into the evidence
     * pane). Binding before the add ensures the bootstrap insert is observed, exactly as a later
     * external `create_component` into the same stage would be.
     * @protected
     */
    onComponentConstructed() {
        let me    = this,
            stage = me.getReference('widget-stage');

        stage.on('insert', me.onStageInsert, me);
        stage.add(firstWidgetGridConfig)
    }

    /**
     * Triggered by the stage container's `insert` event — for the in-app bootstrap and for any external
     * Neural-Link `create_component` into the same stage. Projects the created grid into the evidence
     * pane; a non-grid insert or an unprojectable grid leaves the pane to fail closed downstream.
     * @param {Object} data
     * @param {Neo.component.Base} data.item the just-inserted, mounted component
     * @protected
     */
    onStageInsert({item}) {
        if (item?.ntype === 'grid-container') {
            this.getReference('evidence-pane').blueprint = projectCreatedGrid(item)
        }
    }

    /**
     * Triggered by the intake submit button. Reads the current request field value, validates it,
     * and projects an accepted request into the evidence pane or shows the rejected reason.
     * @param {Object} data
     * @protected
     */
    onSubmitRequest(data) {
        let me     = this,
            field  = me.getReference('request-field'),
            error  = me.getReference('request-error'),
            result = validateRequest(field.value);

        if (result.accepted) {
            me.getReference('evidence-pane').request = result.value
        }

        error.vdom.cn[0].text = result.accepted ? '' : result.reason;
        error.update()
    }
}

export default Neo.setupClass(ViewportController);
