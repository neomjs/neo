import BaseContainer   from './BaseContainer.mjs';
import ContentBox      from '../ContentBox.mjs';
import FooterContainer from '../FooterContainer.mjs';

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
                        text: 'Code at the Speed of Thought'
                    }, {
                        tag : 'h3',
                        cls : ['neo-h3'],
                        text: 'AI agents can now "see" and "touch" your running Neo.mjs app in real-time via the Neural Link.'
                    }]
                }
            }, {
                ntype : 'container',
                cls   : ['card-container'],
                layout: {ntype: 'grid', columns: 3, gap: '2rem'},
                items : [{
                    module : ContentBox,
                    header : 'The Neural Link',
                    route  : '#/learn/guides/mcp/NeuralLink',
                    content: [
                        'Introspect the live Scene Graph.',
                        'Live Runtime Mutation (Hot-Swapping).',
                        'Simulate user interactions for E2E.',
                        'Bi-directional agent communication.'
                    ]
                }, {
                    module : ContentBox,
                    header : 'MCP Infrastructure',
                    route  : '#/learn/guides/mcp/Introduction',
                    content: [
                        'Knowledge Base: Semantic codebase search.',
                        'Memory Core: Persistent agent context.',
                        'GitHub Workflow: Autonomous PR reviews.',
                        'Neural Link: The Bridge to the runtime.'
                    ]
                }, {
                    module : ContentBox,
                    header : 'Context Engineering',
                    route  : '#/learn/blog/context-engineering-done-right',
                    content: [
                        'Advanced Code Execution: Orchestrate tools as APIs.',
                        'Tool Composition: Chain complex workflows locally.',
                        'On-Demand Loading: Prevent context window overload.',
                        '181 tickets resolved in 15 days.'
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
