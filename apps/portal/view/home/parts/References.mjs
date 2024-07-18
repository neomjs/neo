import BaseContainer from './BaseContainer.mjs';
import Carousel      from "../../../../../src/component/Carousel.mjs";

/**
 * @class Portal.view.home.parts.References
 * @extends Portal.view.home.parts.BaseContainer
 */
class References extends BaseContainer {
    static config = {
        /**
         * @member {String} className='Portal.view.home.parts.References'
         * @protected
         */
        className: 'Portal.view.home.parts.References',
        /**
         * @member {String} cls='portal-references'
         */
        cls: 'portal-references',
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch',pack:'center'}
         */
        layout: {ntype: 'vbox', align: 'stretch', pack: 'center'},
        /**
         * @member {Object[]} items
         */
        items: [{
            ntype: 'container',
            flex : '1 1 100%'
        }, {
            cls : 'neo-h1',
            flex: 'none',
            html: 'References',
            vdom: {tag: 'h1'}
        }, {
            cls : 'neo-h2',
            flex: 'none',
            html: 'What people think about Neo',
            vdom: {tag: 'h2'}
        }, {
            module: Carousel,
            // will automatically change to the next extry every 5500 ms
            // if not set or 0, this will show arrows to navigate
            autoRun: 5500,
            store  : {
                model: {
                    fields: [
                        // @formatter:off
                        {name: 'quote',      type: 'String'},
                        {name: 'publisher',  type: 'String'},
                        {name: 'date',       type: 'String'}
                        // @formatter:on
                    ]
                },
                data : [{
                    quote    : 'Neo has inspired me to try out new ways and pursue more modern approaches.',
                    publisher: 'Torsten Dinkheller',
                    date     : 'Mai 2024'
                }, {
                    quote    : 'With Neo, I no longer lose sight of important customers. I can finally use 2 monitors for my work.',
                    publisher: 'Pat Wemerson',
                    date     : 'June 2024'
                }, {
                    quote    : 'Up-to-dateness is everything in my job, so Neo\'s data processing speed is just right for me.',
                    publisher: 'Texas Ranger',
                    date     : 'Juli 2024'
                }, {
                    quote    : 'Starting a project with Neo has brought me back up to speed. Always one step ahead of the browser.',
                    publisher: 'Future Developer',
                    date     : 'April 2024'
                }]
            },
            // custom item cls
            itemCls: 'example-carousel-item',
            // each item will be created like the itemTpl structure
            itemTpl: data => [{
                cls : 'neo-quote',
                html: data.quote
            }, {
                cls : 'neo-details',
                html: `${data.publisher} - ${data.date}`
            }]
        }]
    }
}

Neo.setupClass(References);

export default References;
