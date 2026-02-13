import BaseGridContainer from '../../../../src/grid/Container.mjs';
import Contributors      from '../../store/Contributors.mjs';
import StatusToolbar     from './StatusToolbar.mjs';

/**
 * @class DevIndex.view.home.GridContainer
 * @extends Neo.grid.Container
 */
class GridContainer extends BaseGridContainer {
    static config = {
        /**
         * @member {String} className='DevIndex.view.home.GridContainer'
         * @protected
         */
        className: 'DevIndex.view.home.GridContainer',
        /**
         * @member {String[]} cls=['devindex-grid-container']
         */
        cls: ['devindex-grid-container'],
        /**
         * @member {Boolean} commitsOnly_=false
         * @reactive
         */
        commitsOnly_: false,
        /**
         * @member {Boolean} animateVisuals_=true
         * @reactive
         */
        animateVisuals_: true,
        /**
         * @member {Object} body
         */
        body: {
            bufferColumnRange: 3,
            bufferRowRange   : 5,
            listeners        : {
                isScrollingChange: 'onGridIsScrollingChange'
            }
        },
        /**
         * @member {Object} footerToolbar
         */
        footerToolbar: {
            module: StatusToolbar,
            flex  : 'none'
        },
        /**
         * Default configs for each column
         * @member {Object} columnDefaults
         */
        columnDefaults: {
            cellAlign           : 'left',
            defaultSortDirection: 'DESC',
            width               : 150
        },
        /**
         * @member {Number} rowHeight=50
         */
        rowHeight: 50,
        /**
         * @member {Object[]} store=Contributors
         * @reactive
         */
        store: Contributors
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        this.buildDynamicColumns()
    }

    /**
     * @param {Boolean} value
     * @param {Boolean} oldValue
     */
    afterSetAnimateVisuals(value, oldValue) {
        if (oldValue !== undefined) {
            this.body.animateVisuals = value;
            this.fire('animateVisualsChange', {value})
        }
    }

    /**
     * @param {Boolean} value
     * @param {Boolean} oldValue
     */
    afterSetCommitsOnly(value, oldValue) {
        if (oldValue === undefined) return;

        let me           = this,
            {store}      = me,
            activeSorter = store.sorters?.[0],
            prefix       = value ? 'cy' : 'y';

        // 1. Update Column Renderers & Components
        me.columns.items.forEach(column => {
            let {dataField} = column;

            if (/^y\d{4}$/.test(dataField)) {
                // Swap renderer to read from 'cy' field if commitsOnly is true
                // Note: We keep the dataField as 'yXXXX' to preserve pooling stability.
                if (value) {
                    column.renderer = ({record}) => record['c' + dataField] || '';
                } else {
                    column.renderer = ({value}) => value || ''; // Restore default
                }
            } else if (dataField === 'totalContributions') {
                if (value) {
                    column.renderer = ({record}) => {
                        const total = record.commitsArray?.reduce((a, b) => a + b, 0) || 0;
                        return new Intl.NumberFormat().format(total);
                    };
                } else {
                    column.renderer = ({value}) => new Intl.NumberFormat().format(value);
                }
            } else if (dataField === 'activity') {
                // Update Sparkline Component to read from correct prefix
                column.component = ({record}) => {
                    const data = [];
                    for (let i = 2010; i <= 2025; i++) {
                        data.push(record[`${prefix}${i}`] || 0);
                    }
                    return {values: data};
                };
            }
        });

        // 2. Update Active Sorter if needed
        if (activeSorter) {
            let {property} = activeSorter;

            // Check if we are sorting by a year (either yXXXX or cyXXXX)
            if (/^(y|cy)\d{4}$/.test(property)) {
                let year = property.replace(/^(y|cy)/, '');
                // Switch to the target prefix
                activeSorter.property = `${prefix}${year}`;
            } else if (property === 'totalContributions' || property === 'totalCommits') {
                activeSorter.property = value ? 'totalCommits' : 'totalContributions';
            }
        }

        // 3. Refresh Grid View
        me.body.createViewData();
    }

    /**
     *
     */
    buildDynamicColumns() {
        const columns = [{
            type     : 'index',
            dataField: 'id',
            text     : '#',
            width    : 60,
            cellAlign: 'right'
        }, {
            type     : 'githubUser',
            dataField: 'login',
            text     : 'User',
            width    : 250
        }, {
            dataField           : 'totalContributions',
            text                : 'Total',
            width               : 100,
            cellAlign           : 'right',
            defaultSortDirection: 'DESC',
            renderer            : ({value}) => new Intl.NumberFormat().format(value)
        }, {
            dataField         : 'activity',
            text              : 'Activity (15y)',
            width             : 160,
            type              : 'sparkline',
            component         : ({record}) => {
                const data = [];
                // Iterate from 2010 to 2025
                for (let i = 2010; i <= 2025; i++) {
                    data.push(record[`y${i}`] || 0);
                }

                return {
                    values: data
                }
            }
        }, {
            dataField: 'followers',
            text     : 'Followers',
            width    : 100,
            cellAlign: 'right',
            renderer : ({value}) => value ? new Intl.NumberFormat().format(value) : '-'
        }, {
            dataField: 'company',
            text     : 'Company',
            width    : 200,
            renderer : ({value}) => value ? value.replace(/^@/, '') : ''
        }, {
            type     : 'countryFlag',
            dataField: 'countryCode',
            sortable : false,
            text     : 'Location',
            width    : 200
        }, {
            dataField: 'firstYear',
            text     : 'Since', width: 80,
            cellAlign: 'center'
        }, {
            dataField: 'linkedinUrl',
            text     : 'LI',
            width    : 50,
            cellAlign: 'center',
            renderer : ({value}) => value ? `<a href="${value}" target="_blank" class="fa-brands fa-linkedin" style="color: #0077b5; font-size: 20px;"></a>` : ''
        }, {
            type     : 'githubOrgs',
            dataField: 'organizations',
            text     : 'Orgs',
            width    : 150
        }];

        // Add Year Columns
        const currentYear = new Date().getFullYear();
        for (let year = currentYear; year >= 2010; year--) {
            columns.push({
                dataField: `y${year}`,
                text     : String(year),
                width    : 80,
                cellAlign: 'center',
                renderer : ({value}) => value || '',
                cellCls  : ({value}) => {
                    let cls = ['neo-heatmap'];

                    if (!value) {
                        cls.push('heatmap-cell-0')
                    } else if (value < 100) {
                        cls.push('heatmap-cell-1')
                    } else if (value < 1000) {
                        cls.push('heatmap-cell-2')
                    } else {
                        cls.push('heatmap-cell-3')
                    }

                    return cls
                }
            });
        }

        columns.push({
            dataField: 'lastUpdated',
            text     : 'Updated',
            width    : 120,
            cellAlign: 'right',
            renderer : ({value}) => new Date(value).toISOString().split('T')[0]
        });

        this.columns = columns
    }

    /**
     * @param {Object} opts
     */
    onSortColumn(opts) {
        // Intercept sort on year columns to use correct field
        if (this.commitsOnly) {
            if (/^y\d{4}$/.test(opts.property)) {
                opts.property = 'c' + opts.property; // y2020 -> cy2020
            } else if (opts.property === 'totalContributions') {
                opts.property = 'totalCommits';
            }
        }
        super.onSortColumn(opts);
    }
}

export default Neo.setupClass(GridContainer);
