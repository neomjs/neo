import Controller                       from '../../../../../src/controller/Component.mjs';
import GridContainer                    from '../../../../../src/grid/Container.mjs';
import {projectCreatedGrid}             from '../util/createdGridEvidence.mjs';
import {parseEditRequest}               from '../util/parseEditRequest.mjs';
import {firstWidgetRows, resolveWidgetEdit} from '../util/firstWidgetEditModel.mjs';
import {validateRequest}                from '../util/validateRequest.mjs';

/**
 * The first widget's grid config. The controller boots it by `add()`-ing it to the stage — the same
 * `add → insert` path a Neural-Link `create_component` drives (it calls
 * `call_method(parentId, 'add', [config])`). Keeping ONE create path is the provenance point: whatever
 * lands in the stage — this in-app bootstrap or an external agent's `create_component` — is what the
 * evidence pane projects, so the evidence always describes the grid that was actually inserted into the
 * stage. The bootstrap uses `module` (the class is imported here, registering the live app); an external
 * agent sends `ntype`/`className` instead, since a module reference cannot cross the Neural Link wire.
 * @type {Object}
 */
const firstWidgetGridConfig = {
    id            : 'first-widget-grid',
    // the controller resolves the live grid for follow-up edits via this reference (getReference matches
    // `reference`, not `id`); an external `create_component` grid carries no reference and is unaffected
    reference     : 'first-widget-grid',
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
        // the canonical seed rows — the same source the `reset` edit restores (see firstWidgetEditModel)
        data: firstWidgetRows
    }
};

/**
 * @class AgentOSWidget.view.ViewportController
 * @extends Neo.controller.Component
 * @summary Creates the first widget through the live create path, projects it into the evidence pane, and
 * applies bounded follow-up edits to it.
 *
 * One create path, then live mutation. On construct it boots the first grid by `add()`-ing it to the stage
 * container (the same `add → insert` path a Neural-Link `create_component` drives), so the live grid is
 * created through the stage insert seam rather than declared as a static item. It then observes the stage's
 * `insert` event — fired for that bootstrap AND for any later external `create_component` into the same
 * stage — and projects the inserted grid into the evidence pane via {@link projectCreatedGrid},
 * so the evidence always describes the grid that was inserted into the stage, not a hand-authored
 * blueprint. After the widget exists, {@link onSubmitEdit} accepts a bounded follow-up edit grammar
 * (rename / row-count / reset) and mutates the SAME live grid — never a replacement — then re-projects it
 * from {@link projectCreatedGrid} so the evidence reflects the actual mutated state. It also keeps the
 * deterministic chat-intake submit handling. No model invocation / persistence / git / admin tools.
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
     * Boots the first widget through the stage insert seam: binds the stage's `insert` observer, then
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

    /**
     * Triggered by the follow-up edit submit button. Parses the edit field through the bounded
     * {@link parseEditRequest} grammar and, on an accepted edit, mutates the EXISTING live first-widget
     * grid (never a replacement), then re-projects it into the evidence pane via {@link projectCreatedGrid}
     * so the evidence reflects the actual mutated state. An unaccepted edit — unknown command, overlong /
     * markup input, out-of-bounds value, or a missing prerequisite widget — fails closed to a bounded
     * rejected outcome line; the live grid is left untouched. Edit outcomes (accepted and rejected) render
     * as safe text in the evidence pane's transcript, never as HTML.
     * @param {Object} data
     * @protected
     */
    onSubmitEdit(data) {
        let me       = this,
            field    = me.getReference('edit-field'),
            evidence = me.getReference('evidence-pane'),
            grid     = me.getReference('first-widget-grid'),
            result   = parseEditRequest(field.value);

        if (!result.accepted) {
            evidence.editOutcome = `Rejected: ${result.reason}`;
            return
        }

        // missing prerequisite widget state — fail closed without touching anything
        if (!grid?.store) {
            evidence.editOutcome = 'Rejected: no widget to edit yet.';
            return
        }

        me.applyWidgetEdit(grid, result.edit);
        evidence.blueprint   = projectCreatedGrid(grid);
        evidence.editOutcome = me.describeEdit(result.edit)
    }

    /**
     * Applies a bounded mutation descriptor — resolved purely by {@link resolveWidgetEdit} — to the live
     * grid: a title relabel (read back by the evidence projection) and/or a full store-data replacement
     * (the canonical seed for `reset`, deterministic sample rows for `rowCount`). Only the two bounded
     * mutation keys are honoured; nothing else on the grid is touched.
     * @param {Neo.grid.Container} grid the live first-widget grid
     * @param {Object} edit the accepted, typed edit
     * @protected
     */
    applyWidgetEdit(grid, edit) {
        const mutation = resolveWidgetEdit(edit);

        if ('title' in mutation) {
            grid.title = mutation.title
        }
        if ('rows' in mutation) {
            grid.store.data = mutation.rows
        }
    }

    /**
     * Deterministic, human-readable echo of an applied edit for the evidence transcript. Rendered as a
     * safe text node; the title has already passed the grammar's plain-text + length bounds.
     * @param {Object} edit the accepted, typed edit
     * @returns {String}
     * @protected
     */
    describeEdit(edit) {
        switch (edit.type) {
            case 'rename':
                return `Renamed the widget to "${edit.title}".`;
            case 'rowCount':
                return `Updated the widget to show ${edit.count} rows.`;
            case 'reset':
                return 'Reset the widget to its sample data.'
        }

        return ''
    }
}

export default Neo.setupClass(ViewportController);
