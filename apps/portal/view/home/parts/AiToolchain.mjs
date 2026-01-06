import BaseContainer   from './BaseContainer.mjs';
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
            ntype: 'component',
            cls  : ['content-wrapper'],
            vdom : {
                cn: [{
                    tag : 'h1',
                    cls : ['neo-h1'],
                    text: 'Code at the Speed of Thought'
                }, {
                    tag : 'h3',
                    cls : ['neo-h3'],
                    text: 'AI agents can now "see" and "touch" your running Neo.mjs app in real-time via the Neural Link.'
                }, {
                    cls: ['card-container'],
                    cn : [{
                        cls: ['feature-card'],
                        cn : [{
                            tag : 'h4',
                            text: 'The Neural Link'
                        }, {
                            tag : 'p',
                            text: 'Enable live debugging, conversational UI changes, and zero-downtime hotfixes.'
                        }]
                    }, {
                        cls: ['feature-card'],
                        cn : [{
                            tag : 'h4',
                            text: 'MCP Servers'
                        }, {
                            tag : 'p',
                            text: 'Give your agent deep context with the Knowledge Base, Memory Core, and GitHub Workflow.'
                        }]
                    }, {
                        cls: ['feature-card'],
                        cn : [{
                            tag : 'h4',
                            text: 'Context Engineering'
                        }, {
                            tag : 'p',
                            text: '181 tickets resolved in 15 days using the very tools we were building.'
                        }]
                    }]
                }]
            }
        }, {
            module: FooterContainer,
            flex  : 'none'
        }]
    }
}

export default Neo.setupClass(AiToolchain);
