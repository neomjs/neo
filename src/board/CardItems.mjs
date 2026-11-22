import DateUtil from '../util/Date.mjs';

/**
 * @summary The renderers of a card's body: one function per item type, each turning a record into one vdom node.
 * @description `Neo.board.Card` maps the board's `cardItems` config through {@link renderCardItem}. A renderer
 * returns `null` when the record holds nothing for it, and the card drops the node. Every renderer reads the field
 * the item names (`item.field`), falling back to the type's own default field.
 *
 * A consumer adds a type with {@link registerCardItem}; a type the registry does not know renders nothing and
 * warns once.
 * @module Neo.board.CardItems
 */

const warned = new Set();

/**
 * @summary Parses a `Date` or date string into `{iso, wallDate}` without timezone rollover, or returns `null`
 * @param {*} value
 * @returns {{iso: String, wallDate: Date}|null}
 */
const parseDueDate = value => {
    if (value == null || value === '') {
        return null
    }

    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) {
            return null
        }

        return {
            iso     : DateUtil.convertToyyyymmdd(value),
            wallDate: new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()))
        }
    }

    const raw = String(value).trim();

    if (!raw) {
        return null
    }

    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/);

    if (match) {
        const
            y        = Number(match[1]),
            m        = Number(match[2]),
            d        = Number(match[3]),
            wallDate = new Date(Date.UTC(y, m - 1, d));

        if (wallDate.getUTCFullYear() !== y || wallDate.getUTCMonth() !== m - 1 || wallDate.getUTCDate() !== d) {
            return null
        }

        return {iso: `${match[1]}-${match[2]}-${match[3]}`, wallDate}
    }

    return parseDueDate(new Date(raw))
};

/**
 * @summary The first letters of a name, two at most
 * @param {String} name
 * @returns {String}
 */
const initials = name => String(name).trim().split(/\s+/).map(part => part[0] || '').join('').slice(0, 2).toUpperCase();

/**
 * @summary A field value as a list: arrays stay, one value becomes one entry, nothing becomes none
 * @param {*} value
 * @returns {Array}
 */
const asList = value => Array.isArray(value) ? value : value == null || value === '' ? [] : [value];

/**
 * @summary The registry of card item renderers, keyed by `item.type`
 * @type {Object<String, Function>}
 */
export const cardItems = {
    /**
     * The card's title line
     * @param {Object} record
     * @param {Object} item
     * @param {String} [item.field='title']
     * @returns {Object|null}
     */
    title(record, item) {
        const text = record[item.field || 'title'];

        return text ? {cls: ['neo-board-card-title'], text: String(text)} : null
    },

    /**
     * Any text field of the record
     * @param {Object} record
     * @param {Object} item
     * @param {String} item.field
     * @returns {Object|null}
     */
    text(record, item) {
        const text = item.field && record[item.field];

        return text ? {cls: ['neo-board-card-text'], text: String(text)} : null
    },

    /**
     * A row of tag chips
     * @param {Object} record
     * @param {Object} item
     * @param {String} [item.field='tags']
     * @returns {Object|null}
     */
    tags(record, item) {
        const tags = asList(record[item.field || 'tags']);

        return tags.length ? {
            cls: ['neo-board-card-tags'],
            cn : tags.map(tag => ({tag: 'span', cls: ['neo-board-card-tag'], text: String(tag)}))
        } : null
    },

    /**
     * A progress bar over a 0–100 field. No progress — missing, zero or not a number — draws no bar: an empty
     * track under every card of a backlog is noise, and the column already says the work has not started.
     * @param {Object} record
     * @param {Object} item
     * @param {String} [item.field='progress']
     * @returns {Object|null}
     */
    progress(record, item) {
        const value = Number(record[item.field || 'progress']);

        if (!(value > 0)) {
            return null
        }

        const percent = Math.min(100, value);

        return {
            cls            : ['neo-board-card-progress'],
            role           : 'progressbar',
            'aria-valuemin': 0,
            'aria-valuemax': 100,
            'aria-valuenow': percent,
            cn             : [{cls: ['neo-board-card-progress-bar'], style: {width: `${percent}%`}}]
        }
    },

    /**
     * @summary A due date badge rendered as a semantic `<time>` node
     * @param {Object} record
     * @param {Object} item
     * @param {String} [item.field='dueDate']
     * @param {Object} [item.formatOptions]
     * @param {Function} [item.formatter]
     * @param {String} [item.locale='en-US']
     * @param {String|Boolean} [item.prefix='Due']
     * @returns {Object|null}
     */
    dueDate(record, item) {
        const
            raw    = record?.[item?.field || 'dueDate'],
            parsed = parseDueDate(raw);

        if (!parsed) {
            return null
        }

        const
            options   = item?.formatOptions || {month: 'short', day: 'numeric'},
            formatted = DateUtil.formatWall(item?.locale || 'en-US', options, parsed.wallDate),
            prefix    = item?.prefix === undefined ? 'Due' : item.prefix,
            text      = typeof item?.formatter === 'function'
                ? item.formatter(raw, record)
                : prefix ? `${prefix} ${formatted}` : formatted;

        return text == null || text === '' ? null : {
            tag     : 'time',
            cls     : ['neo-board-card-due-date'],
            datetime: parsed.iso,
            title   : parsed.iso,
            text    : String(text)
        }
    },

    /**
     * The assignees as initials, one circle each
     * @param {Object} record
     * @param {Object} item
     * @param {String} [item.field='assignees']
     * @returns {Object|null}
     */
    avatars(record, item) {
        const people = asList(record[item.field || 'assignees']);

        return people.length ? {
            cls: ['neo-board-card-avatars'],
            cn : people.map(person => {
                const name = typeof person === 'string' ? person : person?.name ?? '';

                return {tag: 'span', cls: ['neo-board-card-avatar'], title: name, text: initials(name)}
            })
        } : null
    }
};

/**
 * @summary Resolves the field name used by a card-item list's `title` item
 * @param {Object[]|null} [items]
 * @returns {String}
 */
export function getTitleField(items) {
    return items?.find?.(item => item?.type === 'title')?.field || 'title'
}

/**
 * @summary Adds or replaces a card item type
 * @param {String} type
 * @param {Function} renderer `(record, item, card) → vdom node | null`
 */
export function registerCardItem(type, renderer) {
    cardItems[type] = renderer
}

/**
 * @summary Renders one card item for a record
 * @param {Object} record
 * @param {Object} item The item config: `{type, field, ...}`
 * @param {Neo.board.Card} [card]
 * @returns {Object|null} A vdom node, or null when the record holds nothing for the item
 */
export function renderCardItem(record, item, card) {
    const renderer = cardItems[item?.type];

    if (!renderer) {
        if (!warned.has(item?.type)) {
            warned.add(item?.type);
            console.warn(`Neo.board.CardItems: unknown card item type "${item?.type}"`)
        }

        return null
    }

    return renderer(record, item, card)
}
