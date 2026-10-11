import BaseContainer   from './BaseContainer.mjs';
import ContentBox      from '../ContentBox.mjs';
import FooterContainer from '../FooterContainer.mjs';

// The Brain's docs live in its own repository: the portal renders the engine's learn/ tree only
const brainDocs = 'https://github.com/neomjs/neo-agent-brain/blob/dev/learn/agentos/';

/**
 * @class Portal.view.home.parts.AiToolchain
 * @extends Portal.view.home.parts.BaseContainer
 */
class AiToolchain extends BaseContainer {
    static config = {
        /**
         * @member {String} className='Portal.view.home.parts.AiToolchain'
         * @protected
         */
        className: 'Portal.view.home.parts.AiToolchain',
        /**
         * @member {String[]} cls=['portal-home-parts-aitoolchain']
         * @reactive
         */
        cls: ['portal-home-parts-aitoolchain'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch',pack:'center'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch', pack: 'center'},
        /**
         * @member {Object[]} items
         */
        items: [{
            ntype: 'container',
            cls  : ['content-wrapper'],
            items: [{
                ntype: 'component',
                flex : 'none',
                vdom : {
                    cn: [{
                        tag : 'h1',
                        cls : ['neo-h1'],
                        text: 'The Agent OS Brain'
                    }, {
                        tag : 'h3',
                        cls : ['neo-h3'],
                        text: [
                            'A cross-model engineering swarm uses Memory Core, Active Hybrid GraphRAG, DreamService, ',
                            'and Neural Link to inspect, mutate, and improve live Neo.mjs apps.'
                        ].join('')
                    }]
                }
            }, {
                ntype : 'container',
                cls   : ['card-container'],
                layout: {ntype: 'grid', columns: 3, gap: '2rem'},
                items : [{
                    module : ContentBox,
                    header : 'Neural Link',
                    route  : '#/learn/agentos/NeuralLink',
                    content: [
                        'Possession interface for running apps.',
                        'Inspect semantic runtime state.',
                        'Mutate UI and data without reloads.',
                        'Verify behavior inside the live Scene Graph.'
                    ]
                }, {
                    module : ContentBox,
                    header : 'Active Hybrid GraphRAG',
                    route  : brainDocs + 'MemoryCore.md',
                    content: [
                        'Memory Core stores agent sessions.',
                        'Knowledge Base searches the codebase.',
                        'Native Edge Graph preserves topology.',
                        'Golden Path fuses semantic and structural signals.'
                    ]
                }, {
                    module : ContentBox,
                    header : 'Dream Pipeline',
                    route  : brainDocs + 'DreamPipeline.md',
                    content: [
                        'DreamService digests session memory.',
                        'Golden Path ranks next work.',
                        'Friction becomes tickets and skills.',
                        'The system evolves by predicting its own evolution.'
                    ]
                }, {
                    module : ContentBox,
                    header : 'The Night Shift',
                    route  : brainDocs + 'SwarmIntelligence.md',
                    content: [
                        'Peers wake peers through the night.',
                        '10-20 pull requests carried to approval, no operator awake.',
                        'Every change gated by cross-family quorum.',
                        'The human holds the merge gate - by governance, not limit.'
                    ]
                }, {
                    module : ContentBox,
                    header : 'Self-Healing',
                    route  : brainDocs + 'SelfHealing.md',
                    content: [
                        'Detects its own data-integrity faults.',
                        'Diagnoses the corruption mode, then heals it.',
                        'Runs unattended, with no human to escalate to.',
                        'Stops trusting a green health check blindly.'
                    ]
                }, {
                    module : ContentBox,
                    header : 'The Cross-Family Institution',
                    route  : brainDocs + 'FlatPeerInstitution.md',
                    content: [
                        'Named maintainers from rival labs: Claude, Gemini, GPT.',
                        'Each reviews the others across families.',
                        'Transparent A2A introspection, not just messaging.',
                        'Correlated blind spots caught by construction.'
                    ]
                }]
            }]
        }, {
            module: FooterContainer,
            flex  : 'none'
        }]
    }
}

export default Neo.setupClass(AiToolchain);
