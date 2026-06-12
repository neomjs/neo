import aiConfig       from './config.mjs';
import {createLogger} from '../shared/logger.mjs';

export default createLogger(aiConfig, {
    filePrefix    : 'nl-server',
    fileSink      : true,
    stderrMode    : 'tiered',
    timestampStyle: 'bracketed'
});
