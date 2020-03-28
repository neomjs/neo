import {default as Component}   from '../../../src/component/Base.mjs';

/**
 * @class Covid.view.AttributionComponent
 * @extends Neo.component.Base
 */
class AttributionComponent extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='Covid.view.AttributionComponent'
         * @private
         */
        className: 'Covid.view.AttributionComponent',
        /**
         * @member {String[]} cls=[]
         * @private
         */
        cls: ['covid-attribution-component', 'neo-link-color'],
        /**
         * @member {Object} style
         */
        style: {
            margin: '30px'
        },
        /**
         * @member {Object} vdom
         */
        vdom: {
            tag  : 'div',
            style: {margin: '20px'},
            cn   : [{
                tag : 'h2',
                html: 'Attribution'
            },
            {
                tag: 'ul',
                cn: [
                    {tag: 'li', html: 'The logos were created by <a target="_blank" href="https://www.linkedin.com/in/sebastian-d-036aab6/">Sebastian Driefmeier</a>. Thank you!'},
                    {tag: 'li', html: ['The logos are based on the image from <a target="_blank" href="https://phil.cdc.gov/Details.aspx?pid=23312">CDC Public Health Image Library (PHIL)</a>,</br>',
                        'so credits to the content providers CDC/ Alissa Eckert, MS; Dan Higgins, MAMS.'].join('')}
                ]
            }]
        }
    }}
}

Neo.applyClassConfig(AttributionComponent);

export {AttributionComponent as default};