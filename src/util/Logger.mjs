import Base from '../core/Base.mjs';

/**
 * @class Neo.util.Logger
 * @extends Neo.core.Base
 * @singleton
 */
class Logger extends Base {
    /**
     * Colors
     * @property {Object} colors
     */
    logColors = {
        error: 'indianred',
        info : '#acacac',
        log  : '#448888',
        warn : '#6d6d00'
    }
    /**
     * Character
     * @property {Object} logChar
     */
    logChars = {
        error: 'E',
        info : 'I',
        log  : 'L',
        warn : 'W'
    }
    /**
     * LogLevels
     * @property {String[]} logLevels
     */
    logLevels = ['info', 'log', 'warn', 'error']

    /**
     * Timeout
     * @property {Number} timeToStart in ms
     */
    timeToStartComponentLogger = 1500

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
         * @member {boolean} enableLogsInProduction=true
         */
        enableLogsInProduction: false,
        /**
         * Set this config to false to disable the component logging using Ctrl-Right Click
         * To turn it on, add:
         *
         *      Neo.util.Logger.enableComponentLogger = true;
         *
         * @member {boolean} enableComponentLogger_=true
         */
        enableComponentLogger_: true,
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
         * @member {boolean} enableLogs=true
         * @protected
         */
        singleton: true
    }

    /**
     * @param config
     */
    construct(config) {
        super.construct(config);

        const me = this;

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
                me.write = Neo.emptyFn;
            }
        }, 50);
    }

    /**
     * Ctrl-Right Click will show the current component
     * @param {Boolean} value
     * @param {Boolean} oldValue
     */
    afterSetEnableComponentLogger(value, oldValue) {
        setTimeout(() => {
            if (value) {
                if (Neo.workerId !== 'app' || Neo.config.environment === 'dist/production') return;

                const viewport = Neo.getComponent('neo-viewport-1') || Neo.getComponent('neo-configuration-viewport-1');
                if (!viewport) {
                    console.warn('[LOGGER] could not find viewport.');
                    return;
                }

                viewport.addDomListeners({
                    contextmenu: (data) => {
                        if (data.ctrlKey) {
                            let isGroupSet = false;

                            data.path.forEach((item) => {
                                const component = Neo.getComponent(item.id);

                                if (component) {
                                    if (!isGroupSet) {
                                        isGroupSet = true;
                                        console.group(item.id);
                                    }
                                    console.log(component);
                                }
                            });

                            if (isGroupSet) {
                                console.groupEnd();
                            }
                        }
                    }
                });
            }
        }, this.timeToStartComponentLogger);
    }

    /**
     * Set level to number based on position in logLevels
     * @param {String} value
     * @param {String|Number} oldValue
     * @returns {number}
     */
    beforeSetLevel(value, oldValue) {
        return this.logLevels.indexOf(value);
    }

    /**
     * @param value
     */
    error(value) {
        throw new Error(value);
    }

    /**
     * @param args
     */
    info(...args) {
        args = this.resolveArgs(...args);
        this.write(args, 'info');
    }

    /**
     * @param args
     */
    log(...args) {
        args = this.resolveArgs(...args);
        this.write(args, 'log');
    }

    /**
     * @param args
     */
    logError(...args) {
        args = this.resolveArgs(...args);
        this.write(args, 'error');
    }

    /**
     * @param args
     */
    warn(...args) {
        args = this.resolveArgs(...args);
        this.write(args, 'warn');
    }

    /**
     * Output method
     * @param args
     * @param {String} level
     * @protected
     */
    write(args, level) {
        const me = this;
        if (me.beforeSetLevel(level) < me.level) return;

        const logColor = me.logColors[level],
              logChar  = me.logChars[level],
              bg       = `background-color:${logColor}; color: white; font-weight: 900;`,
              color    = `color:${logColor};`,
              msg      = `[${me.getCaller()}] ${args.msg}`;

        if (args.data) {
            console.groupCollapsed(`%c ${logChar} %c ${msg}`, bg, color)
            console.log(args.data);
            console.groupEnd();
        } else {
            console.log(`%c ${logChar} %c ${msg}`, bg, color)
        }
    }

    /**
     * HELPER TO CATCH CALLER
     * no known native way in modern JS to know what file that triggered the current method
     * therefore we use Error, we can get the caller file from the stack trace string.
     */
    getCaller() {
        let caller_path = undefined;

        try {
            throw Error();

        } catch (err) {
            const stack_lines = err.stack.split('\n');
            let found_this = false;

            for (let i in stack_lines) {
                let line = stack_lines[i];

                if (!found_this && /Logger\.mjs/.test(line)) {
                    found_this = true

                } else if (found_this) {
                    if (!/Logger\.mjs/.test(line)) {
                        // remove the closing )
                        line = line.replace(')', '');
                        // get the part after the last /
                        caller_path = line.match(/([^\/]+)$/)[1].match(/([^ ]+)$/)[1];

                        break;
                    }
                }

            }

            return caller_path
        }
    }

    /**
     * HELPER FOR ARGS
     * @param {Array} args
     * @return {Object}
     */
    resolveArgs(...args) {
        const identifier = args[0];
        let argsObject = {};

        if (args.length === 1) {
            if (Neo.isString(identifier)) {
                argsObject.msg = args[0];
            } else if (Neo.isObject(identifier)) {
                argsObject = identifier;
            }
        } else if (args.length === 2) {
            argsObject.msg = args[0];
            argsObject.data = args[1];
        }

        return argsObject
    }
}

let instance = Neo.applyClassConfig(Logger);

export default instance;
