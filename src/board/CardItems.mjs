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

const
    DAY_MS                = 86_400_000,
    DEFAULT_DONE_STATUSES = ['done', 'completed', 'closed', 'shipped', 'published'],
    warned                = new Set();

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
 * @summary Checks whether a record sits in a completed state so past deadlines are not marked overdue
 * @param {Object} record
 * @param {Object} [item]
 * @param {Neo.board.Card|null} [card=null]
 * @returns {Boolean}
 */
const isDoneRecord = (record, item, card=null) => {
    if (record?.done === true) {
        return true
    }

    const
        statusField = item?.statusField || card?.board?.statusField || 'status',
        statusVal   = record?.[statusField],
        doneList    = item?.doneStatuses || DEFAULT_DONE_STATUSES;

    return statusVal != null && doneList.some(entry => String(entry).toLowerCase() === String(statusVal).toLowerCase())
};

/**
 * @summary Evaluates whether a record's due date is strictly before `referenceDate` (default today) and not completed
 * @param {Object} record
 * @param {Object} [item={}]
 * @param {Neo.board.Card|null} [card=null]
 * @returns {Boolean}
 */
export function isCardOverdue(record, item={}, card=null) {
    if (item?.overdue === false) {
        return false
    }

    const
        parsed = parseDueDate(record?.[item?.field || 'dueDate']),
        today  = parsed && parseDueDate(item?.referenceDate ?? new Date());

    if (!parsed || !today) {
        return false
    }

    const dayDiff = Math.round((parsed.wallDate.getTime() - today.wallDate.getTime()) / DAY_MS);

    if (typeof item?.overdue === 'function') {
        return Boolean(item.overdue(record, {card, dayDiff, iso: parsed.iso, todayIso: today.iso}))
    }

    return !isDoneRecord(record, item, card) && dayDiff < 0
}

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
     * @summary A due date badge rendered as a semantic `<time>` node with non-color-alone overdue and optional relative phrasing
     * @param {Object} record
     * @param {Object} item
     * @param {String[]} [item.doneStatuses] Status values treated as completed (never overdue)
     * @param {String} [item.field='dueDate']
     * @param {Object} [item.formatOptions]
     * @param {Function} [item.formatter]
     * @param {String} [item.locale='en-US']
     * @param {Boolean|Function} [item.overdue=true] `false` disables overdue detection; a function `(record, ctx) => Boolean` overrides it
     * @param {String|Boolean} [item.overduePrefix='Overdue']
     * @param {String|Boolean} [item.prefix='Due']
     * @param {Date|String} [item.referenceDate] Anchor date for overdue/relative calculation (defaults to today)
     * @param {Boolean} [item.relative=false] True to lead active dates within ±7 days with relative day phrasing
     * @param {String} [item.statusField]
     * @param {Neo.board.Card|null} [card=null]
     * @returns {Object|null}
     */
    dueDate(record, item, card=null) {
        const
            raw    = record?.[item?.field || 'dueDate'],
            parsed = parseDueDate(raw);

        if (!parsed) {
            return null
        }

        const
            options       = item?.formatOptions || {month: 'short', day: 'numeric'},
            formatted     = DateUtil.formatWall(item?.locale || 'en-US', options, parsed.wallDate),
            today         = parseDueDate(item?.referenceDate ?? new Date()),
            dayDiff       = today ? Math.round((parsed.wallDate.getTime() - today.wallDate.getTime()) / DAY_MS) : 0,
            isDone        = isDoneRecord(record, item, card),
            isOverdue     = isCardOverdue(record, item, card),
            dueToday      = Boolean(!isOverdue && !isDone && item?.overdue !== false && today && dayDiff === 0),
            prefix        = item?.prefix === undefined ? 'Due' : item.prefix,
            overduePrefix = item?.overduePrefix === undefined ? 'Overdue' : item.overduePrefix;

        let defaultText;

        if (isOverdue) {
            if (item?.relative && today) {
                const daysLate = Math.abs(dayDiff);
                defaultText = overduePrefix ? `${overduePrefix} ${daysLate}d · ${formatted}` : `${daysLate}d late · ${formatted}`
            } else {
                defaultText = overduePrefix ? `${overduePrefix} · ${formatted}` : formatted
            }
        } else if (item?.relative && !isDone && today && dayDiff >= 0 && dayDiff <= 7) {
            defaultText = dayDiff === 0
                ? `Today · ${formatted}`
                : dayDiff === 1
                    ? `Tomorrow · ${formatted}`
                    : `In ${dayDiff}d · ${formatted}`
        } else {
            defaultText = prefix ? `${prefix} ${formatted}` : formatted
        }

        const text = typeof item?.formatter === 'function'
            ? item.formatter(raw, record, {dayDiff, dueToday, formatted, isOverdue, iso: parsed.iso, todayIso: today?.iso || null})
            : defaultText;

        if (text == null || text === '') {
            return null
        }

        const cls = ['neo-board-card-due-date'];

        if (isOverdue) {
            cls.push('neo-board-card-due-date-overdue')
        } else if (dueToday) {
            cls.push('neo-board-card-due-date-today')
        }

        return {
            tag     : 'time',
            cls,
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
