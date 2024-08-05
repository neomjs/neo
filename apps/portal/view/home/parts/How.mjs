import BaseContainer from './BaseContainer.mjs';

/**
 * @class Portal.view.home.parts.How
 * @extends Portal.view.home.parts.BaseContainer
 */
class How extends BaseContainer {
    static config = {
        /**
         * @member {String} className='Portal.view.home.parts.How'
         * @protected
         */
        className: 'Portal.view.home.parts.How',
        /**
         * @member {String[]} cls=['portal-home-parts-how']
         */
        cls: ['portal-home-parts-how'],
        /**
         * @member {Object} layout={ntype:'hbox',align:'stretch',pack:'center'}
         */
        layout: {ntype: 'hbox', align: 'stretch', pack: 'center'},
        /**
         * @member {Object[]} items
         */
        items: [{
            ntype : 'container',
            cls   : ['portal-content-text'],
            flex  : '1',
            style : {padding: '2rem'},
            layout: {ntype: 'vbox', align: 'center', pack: 'center'},
            items : [{
                cls : ['neo-h1'],
                flex: 'none',
                html: 'How?',
                tag : 'h1'
            }, {
                cls : ['neo-h2'],
                flex: 'none',
                html: 'How Does Neo.mjs Do It?',
                tag : 'h2'
            }, {
                cls : ['neo-h3'],
                flex: 'none',
                tag : 'p',

                html: [
                    'When a Neo.mjs app launches three webworkers are spawned: one that holds app logic, one for tracking delta DOM updates, ',
                    'and one for backend calls. Each webworker runs in its own thread, and thus, in its own processor core. ',
                    'This means these processes run in parallel: your app logic isn\'t affected by DOM changes or ',
                    'by Ajax or socket calls. If you have processor-intensive tasks you can easily run them in their own threads.'
                ].join('')
            }]
        }, {
            ntype : 'container',
            cls   : 'portal-content-wrapper',
            flex  : '2',
            layout: 'fit',
            items : [{
                ntype : 'container',
                cls   : 'portal-content-container',
                layout: 'fit',
                items : [{
                    cls : 'neo-worker-setup',
                    tag : 'element-loader',
                    vdom: {src: '../../resources/images/workers-focus.svg'}
                }]
            }]
        }]
    }
}

Neo.setupClass(How);

export default How;
