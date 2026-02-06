import Component from '../../../../src/component/Base.mjs';

/**
 * @class DevRank.view.cell.UserCell
 * @extends Neo.component.Base
 */
class UserCell extends Component {
    static config = {
        /**
         * @member {String} className='DevRank.view.cell.UserCell'
         * @protected
         */
        className: 'DevRank.view.cell.UserCell',
        /**
         * @member {String[]} cls=['user-cell']
         */
        cls: ['user-cell'],
        /**
         * @member {Object} record_=null
         */
        record_: null,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {cn: [
            {tag: 'img', cls: ['avatar']},
            {cls: ['user-info'], cn: [
                {tag: 'a', cls: ['username'], target: '_blank'},
                {tag: 'span', cls: ['name']}
            ]}
        ]}
    }

    /**
     * @param {Object} value
     * @param {Object} oldValue
     */
    afterSetRecord(value, oldValue) {
        let me = this;

        if (value) {
            let vdom         = me.vdom,
                [img, info]  = vdom.cn,
                [link, name] = info.cn;

            img.src   = value.avatar_url;
            link.href = `https://github.com/${value.login}`;
            link.text = value.login;
            name.text = value.name && value.name !== value.login ? value.name : '';

            me.update()
        }
    }
}

export default Neo.setupClass(UserCell);
