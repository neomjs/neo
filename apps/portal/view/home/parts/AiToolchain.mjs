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
                    route  : '#/learn/agentos/MemoryCore',
                    content: [
                        'Memory Core stores agent sessions.',
                        'Knowledge Base searches the codebase.',
                        'Native Edge Graph preserves topology.',
                        'Golden Path fuses semantic and structural signals.'
                    ]
                }, {
                    module : ContentBox,
                    header : 'Dream Pipeline',
                    route  : '#/learn/agentos/DreamPipeline',
                    content: [
                        'DreamService digests session memory.',
                        'Golden Path ranks next work.',
                        'Friction becomes tickets and skills.',
                        'The system evolves by predicting its own evolution.'
                    ]
                }]
            }, {
                ntype: 'component',
                cls  : ['agent-os-faq'],
                flex : 'none',
                vdom : {tag: 'section', cn: [{
                    tag : 'h2',
                    text: 'Agent OS FAQ'
                }, {
                    tag: 'div',
                    cls: ['faq-list'],
                    cn : [{
                        tag: 'article',
                        cn : [{
                            tag : 'h3',
                            text: 'What is the Neural Link?'
                        }, {
                            tag : 'p',
                            text: 'The Neural Link is a bi-directional bridge that connects AI agents directly to the Neo.mjs runtime. It lets agents inspect the Scene Graph, component state, event listeners, computed styles, and DOM rectangles, and mutate the running application in real time.'
                        }]
                    }, {
                        tag: 'article',
                        cn : [{
                            tag : 'h3',
                            text: 'Why is Neo.mjs called an Application Engine instead of a framework?'
                        }, {
                            tag : 'p',
                            text: 'Neo.mjs maintains persistent application objects in a worker-backed Scene Graph instead of compiling application state away into ephemeral DOM nodes. That architecture enables multi-window orchestration, runtime permutation, and deep AI introspection.'
                        }]
                    }, {
                        tag: 'article',
                        cn : [{
                            tag : 'h3',
                            text: 'What is Context Engineering?'
                        }, {
                            tag : 'p',
                            text: 'Context Engineering shapes the information and tool environment around AI agents. Neo.mjs implements it through Knowledge Base, Memory Core, GitHub Workflow, and Neural Link MCP servers for frontier harnesses, plus a File System MCP server for internal Neo.ai.Agent local loops.'
                        }]
                    }, {
                        tag: 'article',
                        cn : [{
                            tag : 'h3',
                            text: 'What is the Neo.mjs Agent OS?'
                        }, {
                            tag : 'p',
                            text: 'The Neo.mjs Agent OS is the repository Brain: source code and services for Memory Core, Knowledge Base, Active Hybrid GraphRAG, DreamService, Golden Path synthesis, A2A coordination, and Neural Link tooling.'
                        }]
                    }]
                }]}
            }]
        }, {
            module: FooterContainer,
            flex  : 'none'
        }]
    }
}

export default Neo.setupClass(AiToolchain);
