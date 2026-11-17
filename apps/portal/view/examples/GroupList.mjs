import ExampleGroup from '../../model/ExampleGroup.mjs';
import List         from './List.mjs';

/**
 * @summary Cards for example groups: each group's cover, title, count and sentence, as a link to its page.
 *
 * The cards keep the example cards' frame (`Portal.view.examples.List`): the cover fills the 16:9 card and the caption
 * stands on its scrim. The whole card is one link, so a group card holds no second action.
 * @class Portal.view.examples.GroupList
 * @extends Portal.view.examples.List
 */
class GroupList extends List {
    static config = {
        /**
         * @member {String} className='Portal.view.examples.GroupList'
         * @protected
         */
        className: 'Portal.view.examples.GroupList',
        /**
         * @member {String[]} baseCls=['portal-examples-group-list','portal-examples-list','neo-list']
         */
        baseCls: ['portal-examples-group-list', 'portal-examples-list', 'neo-list'],
        /**
         * A card navigates, it is never selected.
         * @member {Boolean} disableSelection=true
         * @reactive
         */
        disableSelection: true,
        /**
         * The cards take their natural height inside a scrolling overview.
         * @member {Boolean} useWrapperNode=false
         * @reactive
         */
        useWrapperNode: false
    }

    /**
     * @summary Renders a group's cover as the card, with its title, count and sentence on the scrim.
     * @param {Portal.model.ExampleGroup} group
     * @param {Number} index
     * @returns {Object[]}
     */
    createItemContent(group, index) {
        const key   = group.family,
              label = `${group.title}, ${ExampleGroup.countLabel(group)}`;

        return [{tag: 'a', cls: ['content', 'neo-relative'], data: {recordId: key}, href: '#' + group.route,
            'aria-label': group.sentence ? `${label}: ${group.sentence}` : label, cn: [
            {cls: ['neo-full-size', 'preview-image'], flag: `image-${key}`, style: index < 4 ? this.getBackgroundImageStyle(group) : null},
            {cls: ['neo-absolute', 'neo-item-bottom-position'], cn: [
                {tag: 'span', cls: ['neo-title'], cn: [
                    {tag: 'span', text: group.title},
                    {tag: 'span', cls: ['portal-examples-group-list-count'], text: ExampleGroup.countLabel(group)}
                ]},
                {tag: 'span', cls: ['portal-example-feature'], removeDom: !group.sentence, text: group.sentence}
            ]}
        ]}]
    }
}

export default Neo.setupClass(GroupList);
