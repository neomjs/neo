import BlueprintPreview        from './BlueprintPreview.mjs';
import Button                  from '../../../../src/button/Base.mjs';
import Container               from '../../../../src/container/Base.mjs';
import CreateSurfaceController from './CreateSurfaceController.mjs';
import CreationStateProvider   from './CreationStateProvider.mjs';
import Label                   from '../../../../src/component/Label.mjs';
import TextField               from '../../../../src/form/field/Text.mjs';
import {CREATION_STATES}       from './util/creationFlowState.mjs';

/**
 * @class AgentOS.view.create.CreateSurface
 * @extends Neo.container.Base
 *
 * @summary The keeper chat surface — the five SSOT states as ONE bound view over the
 * create-module provider. Every visible branch binds `data.flowState` / `data.flowReason`; the
 * view holds no flow booleans (the provider is the single truth, the transition table its
 * oracle). The stage container is the ONE create path: accepted blueprints are `add()`ed into it
 * by the accept path and recorded by the insert registrar.
 *
 * The five states render visibly distinct per the SSOT wedge — empty invitation · composing
 * preview · generating (cancellable) · materialized (live panel in the stage + dispose) · error
 * (the pipeline reason verbatim + edit-and-retry). Visual polish beyond state-distinctness is
 * the design-iteration leaf's concern; the STATE BINDING is this leaf's contract.
 */
class CreateSurface extends Container {
    static config = {
        /**
         * @member {String} className='AgentOS.view.create.CreateSurface'
         * @protected
         */
        className: 'AgentOS.view.create.CreateSurface',
        /**
         * @member {String} ntype='agentos-create-surface'
         * @protected
         */
        ntype: 'agentos-create-surface',
        /**
         * @member {String[]} cls=['agentos-create-surface']
         * @reactive
         */
        cls: ['agentos-create-surface'],
        /**
         * @member {Neo.controller.Component} controller=CreateSurfaceController
         * @reactive
         */
        controller: CreateSurfaceController,
        /**
         * The create-module provider — flow state + registry exposure for every consumer below.
         * @member {Neo.state.Provider} stateProvider=CreationStateProvider
         * @reactive
         */
        stateProvider: CreationStateProvider,
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            // The intake row — the single affordance of the EMPTY invitation, live in every state.
            module: Container,
            cls   : ['agentos-create-intake'],
            layout: {ntype: 'hbox', align: 'center'},
            items : [{
                module       : TextField,
                reference    : 'intent-field',
                flex         : 1,
                labelPosition: 'inline',
                labelText    : 'Describe an app to build…',
                clearable    : true,
                listeners    : {change: 'onIntentChange'}
            }, {
                module : Button,
                text   : 'Create',
                iconCls: 'fas fa-wand-magic-sparkles',
                handler: 'onSubmitIntent',
                bind   : {
                    // the single affordance disables while a build is in flight
                    disabled: data => data.flowState === 'generating'
                }
            }]
        }, {
            // The state strip — one Label whose text IS the flow state's SSOT narration.
            module: Label,
            cls   : ['agentos-create-state'],
            bind  : {
                text: data => ({
                    [CREATION_STATES.EMPTY]       : 'The invitation: one affordance, no chrome — describe an app to build.',
                    [CREATION_STATES.COMPOSING]   : 'Composing — the blueprint previews on create; refine your words freely.',
                    [CREATION_STATES.GENERATING]  : 'Materializing… honest progress, cancellable below.',
                    [CREATION_STATES.MATERIALIZED]: 'Live — the app is a real docked panel in the stage below.',
                    [CREATION_STATES.ERROR]       : `Blocked: ${data.flowReason || 'generation refused'} — edit and retry; never a dead-end.`
                })[data.flowState] || ''
            }
        }, {
            module: BlueprintPreview
        }, {
            // The action strip — state-dependent affordances, all provider-event dispatchers.
            module: Container,
            cls   : ['agentos-create-actions'],
            layout: {ntype: 'hbox'},
            items : [{
                module : Button,
                text   : 'Retry',
                ui     : 'secondary',
                handler: 'onRetry',
                bind   : {hidden: data => data.flowState !== 'error'}
            }, {
                module : Button,
                text   : 'Dispose',
                ui     : 'secondary',
                handler: 'onDispose',
                bind   : {hidden: data => data.flowState !== 'materialized'}
            }, {
                module : Button,
                text   : 'Cancel',
                ui     : 'secondary',
                handler: 'onReset',
                bind   : {hidden: data => data.flowState !== 'generating' && data.flowState !== 'composing'}
            }]
        }, {
            // THE stage — the ONE create path's target: accepted blueprints are add()ed here by
            // the accept path (never declared as static items), recorded on insert.
            module   : Container,
            reference: 'create-stage',
            cls      : ['agentos-create-stage'],
            flex     : 1,
            layout   : {ntype: 'fit'}
        }]
    }
}

export default Neo.setupClass(CreateSurface);
