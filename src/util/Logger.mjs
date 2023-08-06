import Base from '../core/Base.mjs';

/**
 * @class Neo.util.Logger
 * @extends Neo.core.Base
 * @singleton
 */
class Logger extends Base {
    static config = {
        /**
         * @member {String} className='Neo.util.Logger'
         * @protected
         */
        className: 'Neo.util.Logger',
        /**
         * Set this config to false to disable the logging in production
         * To change this on the fly use:
         *
         *     Neo.util.Logger.enableLogsInProduction = true;
         *
         * @member {Boolean} enableLogsInProduction=true
         */
        enableLogsInProduction: false,
        /**
         * Set this config to false to disable the component logging using Ctrl-Right Click
         * To turn it on, add:
         *
         *      Neo.util.Logger.enableComponentLogger = true;
         *
         * @member {Boolean} enableComponentLogger=true
         */
        enableComponentLogger: true,
        /**
         * Set the minimum level, which you want to output.
         * Change this at any time using a value of logLevels: ['info', 'log', 'warn', 'error']
         *
         *     Neo.util.Logger.level = 'error'
         *
         * @member {String} level='info'
         * @protected
         */
        level_: 'info',
        /**
         * @member {Boolean} enableLogs=true
         * @protected
         */
        singleton: true
    }

    /**
     * @member {Object} logChar
     */
    logChars  = {
        error: 'E',
        info : 'I',
        log  : 'L',
        warn : 'W'
    }
    /**
     * @member {Object} colors
     */
    logColors = {
        error: 'indianred',
        info : '#acacac',
        log  : '#448888',
        warn : '#6d6d00'
    }
    /**
     * LogLevels
     * @member {String[]} logLevels
     */
    logLevels = ['info', 'log', 'warn', 'error']

    /**
     * @param config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        // aliases
        Neo.applyFromNs(Neo, me, {
            error   : 'error',
            info    : 'info',
            log     : 'log',
            logError: 'logError',
            warn    : 'warn'
        }, true);

        setTimeout(() => {
            if (!me.enableLogsInProduction && Neo.config.environment === 'dist/production') {
                me.write = Neo.emptyFn
            }
        }, 50)
    }

    /**
     * Ctrl-Right Click will show the current component
     * @param {Neo.component.Base} view
     */
    addContextMenuListener(view) {
        view.addDomListeners({
            contextmenu: this.onContextMenu,
            scope      : this
        })
    }

    /**
     * Set level to number based on position in logLevels
     * @param {String} value
     * @param {String|Number} oldValue
     * @returns {Number}
     */
    beforeSetLevel(value, oldValue) {
        return this.logLevels.indexOf(value)
    }

    /**
     * @param {String} value
     */
    error(value) {
        throw new Error(value)
    }

    /**
     * internal helper to catch caller
     * no known native way in modern JS to know what file that triggered the current method
     * therefore we use Error, we can get the caller file from the stack trace string.
     * @protected
     * @returns {String}
     */
    getCaller() {
        let caller_path = undefined,
            err         = new Error(),
            stack_lines = err.stack.split('\n'),
            found_this  = false,
            i, line;

        for (i in stack_lines) {
            line = stack_lines[i];

            if (!found_this && /Logger\.mjs/.test(line)) {
                found_this = true
            } else if (found_this) {
                if (!/Logger\.mjs/.test(line)) {
                    // remove the closing )
                    line        = line.replace(')', '');
                    // get the part after the last /
                    caller_path = line.match(/([^\/]+)$/)[1].match(/([^ ]+)$/)[1];

                    break;
                }
            }
        }

        return caller_path
    }

    /**
     * @param args
     */
    info(...args) {
        args = this.resolveArgs(...args);
        this.write(args, 'info')
    }

    /**
     * @param args
     */
    log(...args) {
        args = this.resolveArgs(...args);
        this.write(args, 'log')
    }

    /**
     * @param args
     */
    logError(...args) {
        args = this.resolveArgs(...args);
        this.write(args, 'error')
    }

    /**
     * @param {Object} data
     */
    onContextMenu(data) {
        if (
            data.ctrlKey
            && this.enableComponentLogger
            && !(Neo.config.env === 'dist/production' && this.enableLogsInProduction)
        ) {
            let isGroupSet = false,
                component;

            data.path.forEach(item => {
                component = Neo.getComponent(item.id);

                if (component) {
                    if (!isGroupSet) {
                        isGroupSet = true;
                        console.group(item.id)
                    }

                    console.log(component)
                }
            });

            isGroupSet && console.groupEnd()
        }
    }

    /**
     * Internal helper for args
     * @param {Array} args
     * @returns {Object}
     * @protected
     */
    resolveArgs(...args) {
        const identifier = args[0];
        let argsObject   = {};

        if (args.length === 1) {
            if (Neo.isString(identifier)) {
                argsObject.msg = args[0]
            } else if (Neo.isObject(identifier)) {
                argsObject = identifier
            }
        } else if (args.length === 2) {
            argsObject.msg  = args[0];
            argsObject.data = args[1]
        }

        return argsObject
    }

    /**
     * @param args
     */
    warn(...args) {
        args = this.resolveArgs(...args);
        this.write(args, 'warn')
    }

    /**
     * Output method
     * @param {Object} args
     * @param {String} level
     * @protected
     */
    write(args, level) {
        let me = this;

        if (me.beforeSetLevel(level) < me.level) {
            return
        }

        let logColor = me.logColors[level],
            logChar  = me.logChars[level],
            bg       = `background-color:${logColor}; color: white; font-weight: 900;`,
            color    = `color:${logColor};`,
            msg      = `[${me.getCaller()}] ${args.msg}`;

        if (args.data) {
            console.groupCollapsed(`%c ${logChar} %c ${msg}`, bg, color)
            console.log(args.data);
            console.groupEnd()
        } else {
            console.log(`%c ${logChar} %c ${msg}`, bg, color)
        }
    }
}

let instance = Neo.applyClassConfig(Logger);

export default instance;
