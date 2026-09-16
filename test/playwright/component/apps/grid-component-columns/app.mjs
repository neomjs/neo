import Component     from '../../../../../src/component/Base.mjs';
import GridContainer from '../../../../../src/grid/Container.mjs';
import Store         from '../../../../../src/data/Store.mjs';
import Viewport      from '../../../../../src/container/Viewport.mjs';

/**
 * @summary Fixture for the instance a component column builds its cells on: the component column types a profile
 * grid uses, configured the way such a grid configures them.
 *
 * Every one of these columns builds its cell in `cellRenderer()` through `this`: its `component` config, its
 * `applyRecordConfigs()`, and in most types the configs read there — `dataField`, `contentField`, `cellIconCls`,
 * `urlFormatter`, `labelFormatter`. A cell showing its own record's values is therefore the witness that the
 * column's renderer ran on the column. `followers` is the plain-column control: an arrow renderer, which no scope
 * can reach.
 */
const ProfileStore = Neo.setupClass(class extends Store {
    static config = {
        className  : 'Neo.test.playwright.GridComponentColumnsStore',
        keyProperty: 'id',

        model: {
            fields: [
                {name: 'id',          type: 'Integer'},
                {name: 'countryCode', type: 'String'},
                {name: 'followers',   type: 'Integer'},
                {name: 'isHireable',  type: 'Boolean'},
                {name: 'linkedinUrl', type: 'String'},
                {name: 'location',    type: 'String'},
                {name: 'login',       type: 'String'},
                {name: 'name',        type: 'String'},
                {name: 'organizations'},
                {name: 'topRepo'},
                {name: 'website',     type: 'String'}
            ]
        },

        data: [
            {id: 1, login: 'octo-one', name: 'Octo One', topRepo: ['octo-one/engine', 1200], countryCode: 'DE', location: 'Berlin', website: 'https://one.example', linkedinUrl: 'octo-one', isHireable: true, organizations: [{login: 'org-a', name: 'Org A'}], followers: 42},
            {id: 2, login: 'octo-two', name: 'Octo Two', topRepo: ['octo-two/lens', 7], countryCode: 'FR', location: 'Paris', website: 'https://two.example', linkedinUrl: 'https://www.linkedin.com/in/octo-two-profile/', isHireable: false, organizations: [{login: 'org-b', name: 'Org B'}], followers: 7}
        ]
    }
});

export const onStart = () => Neo.app({
    mainView: {
        module: Viewport,
        layout: {ntype: 'vbox', align: 'stretch'},

        items: [{
            module: GridContainer,
            id    : 'grid-component-columns',
            flex  : 1,
            store : ProfileStore,

            columns: [{
                type     : 'githubUser',
                dataField: 'login',
                text     : 'User',
                width    : 200
            }, {
                type     : 'component',
                dataField: 'name',
                text     : 'Impact',
                width    : 140,
                component: ({record}) => ({module: Component, text: `impact:${record.name}`})
            }, {
                type          : 'iconLink',
                dataField     : 'topRepo',
                cellIconCls   : 'fa-brands fa-github',
                labelFormatter: value => value?.[1] ? String(value[1]) : null,
                text          : 'Top Repo',
                urlFormatter  : value => value ? `https://github.com/${value[0]}` : null,
                width         : 120
            }, {
                type     : 'countryFlag',
                dataField: 'countryCode',
                text     : 'Location',
                width    : 140
            }, {
                type       : 'iconLink',
                dataField  : 'website',
                cellCls    : 'profile-column-website',
                cellIconCls: 'fa fa-home',
                text       : 'Website',
                width      : 80
            }, {
                type     : 'linkedin',
                dataField: 'linkedinUrl',
                text     : 'LI',
                width    : 60
            }, {
                type       : 'icon',
                dataField  : 'isHireable',
                cellIconCls: 'fas fa-circle-check',
                text       : 'Hireable',
                width      : 80
            }, {
                type     : 'githubOrgs',
                dataField: 'organizations',
                text     : 'Orgs',
                width    : 120
            }, {
                dataField: 'followers',
                text     : 'Followers',
                width    : 100,
                renderer : ({value}) => `${value} followers`
            }]
        }]
    }
});
