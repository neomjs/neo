import Component from '../../../src/component/Base.mjs';

/**
 * @class SharedCovid.view.AttributionComponent
 * @extends Neo.component.Base
 */
class AttributionComponent extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='SharedCovid.view.AttributionComponent'
         * @protected
         */
        className: 'SharedCovid.view.AttributionComponent',
        /**
         * @member {String[]} cls=['covid-attribution-component']
         * @protected
         */
        cls: ['covid-attribution-component'],
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
                    {tag: 'li', html: 'The logos were created by <a target="_blank" href="https://www.driefmeier.com/">Sebastian Driefmeier</a>. Thank you!'},
                    {tag: 'li', html: ['The logos are based on the image from <a target="_blank" href="https://phil.cdc.gov/Details.aspx?pid=23312">CDC Public Health Image Library (PHIL)</a>,</br>',
                        'so credits to the content providers CDC/ Alissa Eckert, MS; Dan Higgins, MAMS.'].join('')},
                    {tag: 'li', html: 'Data provided by: <a target="_blank" href="https://github.com/NovelCOVID/API">NovelCOVID / API</a>.'},
                    {tag: 'li', html: 'Country Flag Icons made by <a target="_blank" href="https://www.flaticon.com/authors/freepik" title="Freepik">Freepik</a> from <a target="_blank" href="https://www.flaticon.com/" title="Flaticon"> www.flaticon.com</a>.'},
                    {tag: 'li', html: 'Charts got created with <a target="_blank" href="https://www.amcharts.com/docs/v4/">amCharts 4</a>.'},
                    {tag: 'li', html: 'The App is created with the webworkers driven UI framework <a target="_blank" href="https://github.com/neomjs/neo">neo.mjs</a>.'},
                    {tag: 'li', html: 'The Mapbox GL Map is based on <a target="_blank" href="https://docs.mapbox.com/mapbox-gl-js/api/">Mapbox GL JS</a>.'},
                    {tag: 'li', html: 'The Map & Heatmap styles are strongly inspired by <a target="_blank" href="https://blog.mapbox.com/visualizing-the-progression-of-the-2019-ncov-outbreak-66763eb59e79">Visualizing the progression of the 2019-nCoV outbreak</a>.'}
                ]
            }]
        }
    }}
}

Neo.applyClassConfig(AttributionComponent);

export {AttributionComponent as default};