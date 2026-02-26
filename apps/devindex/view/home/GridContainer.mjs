import BaseGridContainer from '../../../../src/grid/Container.mjs';
import Heuristics        from './component/Heuristics.mjs';

const regexYearColumn = /^(c|p|pu)?y\d{4}$/;

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
         * @member {Boolean} animateVisuals_=true
         * @reactive
         */
        animateVisuals_: true,
        /**
         * @member {String[]} cls=['devindex-grid-container']
         */
        cls: ['devindex-grid-container'],
        /**
         * @member {String} dataMode_='total'
         * @reactive
         */
        dataMode_: 'total',
        /**
         * @member {Object} body
         */
        body: {
            bufferColumnRange: 1,
            bufferRowRange   : 1,
            listeners        : {
                isScrollingChange: 'onGridIsScrollingChange'
            }
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
        rowHeight: 50
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        this.buildDynamicColumns()
    }

    /**
     * @param {String} value
     * @param {String} oldValue
     */
    afterSetDataMode(value, oldValue) {
        if (oldValue === undefined) return;

        let me              = this,
            {footerToolbar} = me,
            {store}         = me,
            activeSorter    = store.sorters?.[0];

        if (footerToolbar) {
            footerToolbar.dataMode = value
        }

        // 1. Update Column DataFields & Components
        me.columns.items.forEach(column => {
            let {dataField} = column,
                newDataField;

            if (regexYearColumn.test(dataField)) {
                // Switch between 'y2020', 'cy2020', 'py2020', 'puy2020'
                let year   = dataField.slice(-4),
                    prefix = '';

                if (value === 'commits') {
                    prefix = 'c'
                } else if (value === 'private') {
                    prefix = 'p'
                } else if (value === 'public') {
                    prefix = 'pu'
                }

                newDataField = prefix + 'y' + year
            } else if (['totalContributions', 'totalCommits', 'totalPrivateContributions', 'totalPublicContributions'].includes(dataField)) {
                switch (value) {
                    case 'commits':
                        newDataField = 'totalCommits';
                        break;
                    case 'private':
                        newDataField = 'totalPrivateContributions';
                        break;
                    case 'public':
                        newDataField = 'totalPublicContributions';
                        break;
                    default:
                        newDataField = 'totalContributions';
                        break
                }
            } else if (dataField === 'activity') {
                // Update Sparkline Component to read from correct prefix
                column.component = ({record}) => {
                    const
                        data    = [],
                        endYear = new Date().getFullYear();

                    for (let i = 2010; i <= endYear; i++) {
                        let yearVal = 0;

                        if (value === 'commits') {
                            yearVal = record[`cy${i}`] || 0
                        } else if (value === 'private') {
                            yearVal = record[`py${i}`] || 0
                        } else if (value === 'public') {
                            yearVal = record[`puy${i}`] || 0
                        } else {
                            yearVal = record[`y${i}`] || 0
                        }

                        data.push(yearVal)
                    }
                    return {values: data}
                }
            }

            if (newDataField && newDataField !== dataField) {
                // Update Column
                column.dataField = newDataField
            }
        });

        // 2. Update Active Sorter if needed
        if (activeSorter) {
            let {property} = activeSorter;

            if (regexYearColumn.test(property)) {
                let year   = property.slice(-4),
                    prefix = '';

                if (value === 'commits') {
                    prefix = 'c'
                } else if (value === 'private') {
                    prefix = 'p'
                } else if (value === 'public') {
                    prefix = 'pu'
                }
                activeSorter.property = prefix + 'y' + year
            } else if (['totalContributions', 'totalCommits', 'totalPrivateContributions', 'totalPublicContributions'].includes(property)) {
                switch (value) {
                    case 'commits':
                        activeSorter.property = 'totalCommits';
                        break;
                    case 'private':
                        activeSorter.property = 'totalPrivateContributions';
                        break;
                    case 'public':
                        activeSorter.property = 'totalPublicContributions';
                        break;
                    default:
                        activeSorter.property = 'totalContributions';
                        break
                }
            }
        }

        // 3. Refresh Grid View
        me.body.createViewData(false, true)
    }

    /**
     *
     */
    buildDynamicColumns() {
        const
            currentYear      = new Date().getFullYear(),
            endYear          = currentYear,
            activityDuration = endYear - 2010 + 1,
            columns          = [{
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
                dataField           : 'commitRatio',
                text                : 'Commits %',
                width               : 90,
                cellAlign           : 'right',
                defaultSortDirection: 'DESC',
                renderer            : ({value}) => (value || 0).toFixed(2)
            }, {
                dataField           : 'privateContributionsRatio',
                text                : 'Private %',
                width               : 90,
                cellAlign           : 'right',
                defaultSortDirection: 'DESC',
                renderer            : ({value}) => value ? value.toFixed(2) : ''
            }, {
                type     : 'component',
                dataField: 'heuristics',
                text     : 'Impact',
                width    : 100,
                component: ({record}) => ({
                    module     : Heuristics,
                    heuristics : record.heuristics || record.hm
                })
            }, {
                dataField  : 'activity',
                text       : `Activity (${activityDuration}y)`,
                width      : 160,
                type       : 'sparkline',
                useBindings: true,
                component  : ({record}) => {
                    const data = [];
                    // Iterate from 2010 to endYear
                    for (let i = 2010; i <= endYear; i++) {
                        data.push(record[`y${i}`] || 0)
                    }

                    return {
                        bind  : {usePulse: data => data.animateGridVisuals},
                        values: data
                    }
                }
            }, {
                type          : 'iconLink',
                dataField     : 'topRepo',
                cellIconCls   : 'fa-brands fa-github',
                labelFormatter: val => val?.[1] ? new Intl.NumberFormat().format(val[1]) : null,
                text          : 'Top Repo',
                urlFormatter  : val => val ? `https://github.com/${val[0]}` : null,
                width         : 100
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
                type       : 'iconLink',
                cellAlign  : 'center',
                dataField  : 'website',
                cellCls    : 'devindex-column-website',
                cellIconCls: 'fa fa-home',
                text       : 'Website',
                width      : 65
            }, {
                type     : 'linkedin',
                cellAlign: 'center',
                dataField: 'linkedinUrl',
                cellCls  : 'devindex-column-linkedin',
                text     : 'LI',
                width    : 40
            }, {
                type       : 'icon',
                cellAlign  : 'center',
                dataField  : 'isHireable',
                cellCls    : 'devindex-column-hireable',
                cellIconCls: 'fas fa-circle-check',
                text       : 'Hireable',
                width      : 65
            }, {
                type       : 'iconLink',
                cellAlign  : 'center',
                dataField  : 'twitter',
                cellCls    : 'devindex-column-twitter',
                cellIconCls: 'fa-brands fa-x-twitter',
                text       : 'X',
                urlFormatter: val => val ? (String(val).startsWith('http') ? val : `https://x.com/${val}`) : null,
                width      : 40
            }, {
                type     : 'githubOrgs',
                dataField: 'organizations',
                text     : 'Orgs',
                width    : 150
            }, {
                dataField: 'followers',
                text     : 'Followers',
                width    : 100,
                cellAlign: 'right',
                renderer : ({value}) => value ? new Intl.NumberFormat().format(value) : '-'
            }, {
                type          : 'iconLink',
                cellAlign     : 'center',
                cellCls       : 'devindex-column-sponsors',
                dataField     : 'hasSponsors',
                cellIconCls   : 'fa-regular fa-heart',
                labelFormatter: val => val != null ? String(val) : null,
                text          : 'Sponsors',
                urlFormatter  : (val, record) => val != null ? `https://github.com/sponsors/${record.login}` : null,
                width         : 80
            }, {
                dataField: 'firstYear',
                text     : 'Since', width: 80,
                cellAlign: 'center'
            }];

        // Add Year Columns
        for (let year = endYear; year >= 2010; year--) {
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
        let me         = this,
            {dataMode} = me,
            sortOpts   = {...opts};

        if (sortOpts.property === 'topRepo') {
            sortOpts.property = 'topRepoCount';
        }

        // Intercept sort on year columns to use correct field
        if (dataMode !== 'total') {
            if (regexYearColumn.test(sortOpts.property)) {
                let year   = sortOpts.property.slice(-4),
                    prefix = '';

                if (dataMode === 'commits') {
                    prefix = 'c'
                } else if (dataMode === 'private') {
                    prefix = 'p'
                } else if (dataMode === 'public') {
                    prefix = 'pu'
                }

                if (prefix) {
                    sortOpts.property = prefix + 'y' + year
                }
            } else if (sortOpts.property === 'totalContributions') {
                switch (dataMode) {
                    case 'commits':
                        sortOpts.property = 'totalCommits';
                        break;
                    case 'private':
                        sortOpts.property = 'totalPrivateContributions';
                        break;
                    case 'public':
                        sortOpts.property = 'totalPublicContributions';
                        break;
                }
            }
        }
        
        me.store.sort(sortOpts);
        me.removeSortingCss(opts.property)
    }
}

export default Neo.setupClass(GridContainer);
