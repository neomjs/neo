import Component from '../../../src/component/Base.mjs';

const feeds = {
    titles: ['STUDIO 08', 'Night Edition', 'Opening titles'],
    film  : ['A SHORT FILM', 'Night Service', 'A city after the last departure'],
    guest : ['REMOTE LINE 01', 'The night shift', 'Mara Lin  /  Live audio interview'],
    black : ['REMOTE LINE 01', 'Dead air', 'The guest line is still silent'],
    end   : ['STUDIO 08', 'That’s a wrap', 'End of transmission']
};

/**
 * @summary The picture currently going to air. Feed changes replace the picture on a take only.
 * @class Neo.examples.list.onAir.Monitor
 * @extends Neo.component.Base
 */
class Monitor extends Component {
    static config = {
        className: 'Neo.examples.list.onAir.Monitor',
        cls      : ['air-monitor'],
        feed_    : 'titles',
        vdom     : {cn: [
            {cls: ['air-monitor-head'], cn: [
                {tag: 'span', cls: ['air-tally'], text: 'On air'},
                {tag: 'span', cls: ['air-channel'], text: 'Program  /  01'}
            ]},
            {cls: ['air-screen']}
        ]}
    }

    /**
     * @summary Draws the selected program source, using the locally bundled documentary still.
     * @param {String} value
     */
    afterSetFeed(value) {
        const screen              = this.getVdomRoot().cn[1],
              [label, title, sub] = feeds[value];

        screen.cls   = ['air-screen', 'air-' + value];
        const image = {titles: 'onAir/night-edition.jpg', film: 'onAir/night-service.jpg'}[value];
        screen.style = image ? {backgroundImage: `url("${Neo.config.resourcesPath}examples/${image}")`} : {};
        screen.cn = [
            {cls: ['air-screen-art'], 'aria-hidden': 'true'},
            {cls: ['air-feed-label'], text: label},
            {cls: ['air-feed-title'], text: title},
            {cls: ['air-feed-sub'],   text: sub}
        ];
        this.update()
    }
}

export default Neo.setupClass(Monitor);
