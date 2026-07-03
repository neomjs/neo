import fs   from 'fs';
import os   from 'os';
import path from 'path';

const GGUF_VALUE_TYPE = Object.freeze({
    UINT8  : 0,
    INT8   : 1,
    UINT16 : 2,
    INT16  : 3,
    UINT32 : 4,
    INT32  : 5,
    FLOAT32: 6,
    BOOL   : 7,
    STRING : 8,
    ARRAY  : 9,
    UINT64 : 10,
    INT64  : 11,
    FLOAT64: 12
});

const DEFAULT_LM_STUDIO_MODELS_DIR = path.join(os.homedir(), '.lmstudio', 'models');
const eosSuffixCache               = new Map();

/**
 * @summary Clears cached GGUF suffix lookups for deterministic tests.
 * @returns {void}
 */
export function clearLmsEmbeddingInputSuffixCache() {
    eosSuffixCache.clear();
}

/**
 * @summary Resolves an LM Studio GGUF model file path from loaded-model metadata.
 * @param {Object|null} loadedModel Normalized `lms ps --json` row.
 * @param {Object} [options]
 * @param {String} [options.modelRoot] LM Studio model root.
 * @returns {String}
 */
export function resolveLmsGgufModelPath(loadedModel, {modelRoot = DEFAULT_LM_STUDIO_MODELS_DIR} = {}) {
    const candidates = [
        loadedModel?.localPath,
        loadedModel?.filePath,
        loadedModel?.path,
        loadedModel?.indexedModelIdentifier
    ].filter(value => typeof value === 'string' && value.endsWith('.gguf'));

    for (const candidate of candidates) {
        if (path.isAbsolute(candidate)) {
            return candidate;
        }
        if (modelRoot) {
            return path.join(modelRoot, candidate);
        }
    }

    return '';
}

/**
 * @summary Reads tokenizer metadata needed to resolve a GGUF EOS token string.
 * @param {String} filePath GGUF file path.
 * @returns {{tokens: String[], eosTokenId: Number|null, eotTokenId: Number|null, addEosToken: Boolean|null}}
 */
export function readGgufTokenizerMetadata(filePath) {
    const fd = fs.openSync(filePath, 'r');

    let offset = 0;

    const readBuffer = length => {
        const buffer = Buffer.allocUnsafe(length),
              bytes  = fs.readSync(fd, buffer, 0, length, offset);

        if (bytes !== length) {
            throw new Error(`readGgufTokenizerMetadata: short read ${bytes}/${length} at offset ${offset}`);
        }

        offset += length;
        return buffer;
    };

    const skipBytes = length => {
        offset += length;
    };

    const readU32    = () => readBuffer(4).readUInt32LE(0);
    const readI32    = () => readBuffer(4).readInt32LE(0);
    const readU64    = () => Number(readBuffer(8).readBigUInt64LE(0));
    const readI64    = () => Number(readBuffer(8).readBigInt64LE(0));
    const readString = () => {
        const length = readU64();
        return readBuffer(length).toString('utf8');
    };
    const skipString = () => {
        skipBytes(readU64());
    };

    const readScalar = type => {
        switch (type) {
            case GGUF_VALUE_TYPE.UINT8:
                return readBuffer(1).readUInt8(0);
            case GGUF_VALUE_TYPE.INT8:
                return readBuffer(1).readInt8(0);
            case GGUF_VALUE_TYPE.UINT16:
                return readBuffer(2).readUInt16LE(0);
            case GGUF_VALUE_TYPE.INT16:
                return readBuffer(2).readInt16LE(0);
            case GGUF_VALUE_TYPE.UINT32:
                return readU32();
            case GGUF_VALUE_TYPE.INT32:
                return readI32();
            case GGUF_VALUE_TYPE.FLOAT32:
                return readBuffer(4).readFloatLE(0);
            case GGUF_VALUE_TYPE.BOOL:
                return readBuffer(1).readUInt8(0) === 1;
            case GGUF_VALUE_TYPE.STRING:
                return readString();
            case GGUF_VALUE_TYPE.UINT64:
                return readU64();
            case GGUF_VALUE_TYPE.INT64:
                return readI64();
            case GGUF_VALUE_TYPE.FLOAT64:
                return readBuffer(8).readDoubleLE(0);
            default:
                throw new Error(`readGgufTokenizerMetadata: unsupported scalar type ${type}`);
        }
    };

    const skipScalar = type => {
        switch (type) {
            case GGUF_VALUE_TYPE.UINT8:
            case GGUF_VALUE_TYPE.INT8:
            case GGUF_VALUE_TYPE.BOOL:
                skipBytes(1);
                break;
            case GGUF_VALUE_TYPE.UINT16:
            case GGUF_VALUE_TYPE.INT16:
                skipBytes(2);
                break;
            case GGUF_VALUE_TYPE.UINT32:
            case GGUF_VALUE_TYPE.INT32:
            case GGUF_VALUE_TYPE.FLOAT32:
                skipBytes(4);
                break;
            case GGUF_VALUE_TYPE.UINT64:
            case GGUF_VALUE_TYPE.INT64:
            case GGUF_VALUE_TYPE.FLOAT64:
                skipBytes(8);
                break;
            case GGUF_VALUE_TYPE.STRING:
                skipString();
                break;
            default:
                throw new Error(`readGgufTokenizerMetadata: unsupported scalar type ${type}`);
        }
    };

    const readArray = type => {
        if (type !== GGUF_VALUE_TYPE.ARRAY) {
            throw new Error(`readGgufTokenizerMetadata: expected array type, got ${type}`);
        }

        const
            itemType = readU32(),
            length   = readU64(),
            values   = [];

        for (let i = 0; i < length; i++) {
            values.push(readScalar(itemType));
        }

        return values;
    };

    const skipValue = type => {
        if (type === GGUF_VALUE_TYPE.ARRAY) {
            const
                itemType = readU32(),
                length   = readU64();

            for (let i = 0; i < length; i++) {
                skipScalar(itemType);
            }
        } else {
            skipScalar(type);
        }
    };

    try {
        const magic = readBuffer(4).toString('utf8');
        if (magic !== 'GGUF') {
            throw new Error(`readGgufTokenizerMetadata: expected GGUF magic, got '${magic}'`);
        }

        readU32(); // version
        readU64(); // tensor count
        const metadataCount = readU64();
        const metadata      = {
            addEosToken: null,
            eosTokenId : null,
            eotTokenId : null,
            tokens     : []
        };

        for (let i = 0; i < metadataCount; i++) {
            const
                key  = readString(),
                type = readU32();

            switch (key) {
                case 'tokenizer.ggml.tokens':
                    metadata.tokens = readArray(type);
                    break;
                case 'tokenizer.ggml.eos_token_id':
                    metadata.eosTokenId = readScalar(type);
                    break;
                case 'tokenizer.ggml.eot_token_id':
                    metadata.eotTokenId = readScalar(type);
                    break;
                case 'tokenizer.ggml.add_eos_token':
                    metadata.addEosToken = readScalar(type);
                    break;
                default:
                    skipValue(type);
            }
        }

        return metadata;
    } finally {
        fs.closeSync(fd);
    }
}

/**
 * @summary Returns the GGUF EOS token text from tokenizer metadata.
 * @param {Object} metadata GGUF tokenizer metadata.
 * @returns {String}
 */
export function getGgufEosTokenText(metadata = {}) {
    const
        tokens     = metadata.tokens || metadata['tokenizer.ggml.tokens'] || [],
        eosTokenId = metadata.eosTokenId ?? metadata['tokenizer.ggml.eos_token_id'];

    return Number.isInteger(eosTokenId) && typeof tokens[eosTokenId] === 'string'
        ? tokens[eosTokenId]
        : '';
}

/**
 * @summary Resolves the LMS-only embedding input suffix from loaded GGUF metadata.
 * @param {Object|null} loadedModel Normalized `lms ps --json` row.
 * @param {Object} [options]
 * @param {Function} [options.readGgufTokenizerMetadataFn] Test seam for GGUF metadata reads.
 * @param {String} [options.modelRoot] LM Studio model root.
 * @param {Object} [options.log] Optional logger.
 * @returns {String}
 */
export function resolveLmsEmbeddingInputSuffix(loadedModel, {
    readGgufTokenizerMetadataFn = readGgufTokenizerMetadata,
    modelRoot,
    log
} = {}) {
    if (!loadedModel) {
        return '';
    }

    const format = String(loadedModel.format || '').toLowerCase();
    if (format && format !== 'gguf') {
        return '';
    }

    if (typeof loadedModel.eosTokenText === 'string' && loadedModel.eosTokenText) {
        return loadedModel.eosTokenText;
    }
    if (loadedModel.ggufTokenizerMetadata) {
        return getGgufEosTokenText(loadedModel.ggufTokenizerMetadata);
    }

    const ggufPath = resolveLmsGgufModelPath(loadedModel, {modelRoot});
    if (!ggufPath) {
        return '';
    }

    try {
        const stat = fs.statSync(ggufPath),
              cacheKey = `${ggufPath}:${stat.size}:${stat.mtimeMs}`;

        if (!eosSuffixCache.has(cacheKey)) {
            eosSuffixCache.set(cacheKey, getGgufEosTokenText(readGgufTokenizerMetadataFn(ggufPath)));
        }

        return eosSuffixCache.get(cacheKey);
    } catch (error) {
        log?.warn?.(`[lmsEmbeddingInputSuffix] Unable to read GGUF tokenizer metadata for '${ggufPath}': ${error.message}`);
        return '';
    }
}

/**
 * @summary Appends the LMS metadata-derived embedding input suffix when absent.
 * @param {String} text The outbound embedding text.
 * @param {Object|null} loadedModel Normalized `lms ps --json` row.
 * @param {Object} [options] Suffix resolver options.
 * @returns {String}
 */
export function appendLmsEmbeddingInputSuffix(text, loadedModel, options = {}) {
    const suffix = resolveLmsEmbeddingInputSuffix(loadedModel, options);

    if (!suffix || typeof text !== 'string' || text.endsWith(suffix)) {
        return text;
    }

    return `${text}${suffix}`;
}

/**
 * @summary Normalizes LMS embedding request input before provider invocation.
 * @param {String|String[]} inputData The text or array of texts to embed.
 * @param {Object|null} loadedModel Normalized `lms ps --json` row.
 * @param {Object} [options] Suffix resolver options.
 * @returns {String|String[]}
 */
export function withLmsEmbeddingInputSuffix(inputData, loadedModel, options = {}) {
    if (Array.isArray(inputData)) {
        return inputData.map(text => appendLmsEmbeddingInputSuffix(text, loadedModel, options));
    }

    return appendLmsEmbeddingInputSuffix(inputData, loadedModel, options);
}
