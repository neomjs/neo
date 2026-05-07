/**
 * @summary Shared utilities for environment variable parsing and configuration mapping.
 */

export function parsePort(rawValue, envVarName, warn = console.warn) {
    const num = Number(rawValue);
    if (!Number.isInteger(num) || num <= 0 || num > 65535) {
        warn(`[Config] Invalid ${envVarName} value: "${rawValue}" (must be integer in 1..65535); falling back.`);
        return undefined;
    }
    return num;
}

export function parseUrl(rawValue, envVarName, warn = console.warn) {
    try {
        const url = new URL(rawValue);
        return url.href.endsWith('/') ? url.href.slice(0, -1) : url.href;
    } catch (e) {
        warn(`[Config] Invalid ${envVarName} value: "${rawValue}" (must be a valid URL); falling back.`);
        return undefined;
    }
}

export function parseBool(rawValue, envVarName, warn = console.warn) {
    if (rawValue === 'true') return true;
    if (rawValue === 'false') return false;
    warn(`[Config] Invalid ${envVarName} value: "${rawValue}" (must be "true" or "false"); falling back.`);
    return undefined;
}

export function parseString(rawValue) {
    return rawValue;
}

export function parseNumber(rawValue, envVarName, warn = console.warn) {
    const num = Number(rawValue);
    if (!Number.isFinite(num)) {
        warn(`[Config] Invalid ${envVarName} value: "${rawValue}" (must be a number); falling back.`);
        return undefined;
    }
    return num;
}

export function setDeep(obj, path, value) {
    const keys = path.split('.');
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
            console.warn(`[Config] Prototype pollution attempt blocked for path "${path}"`);
            return;
        }
        if (typeof current[key] !== 'object' || current[key] === null) {
            console.warn(`[Config] Cannot set path "${path}" because intermediate key "${key}" is not an object.`);
            return;
        }
        current = current[key];
    }
    const finalKey = keys[keys.length - 1];
    if (finalKey === '__proto__' || finalKey === 'constructor' || finalKey === 'prototype') {
        console.warn(`[Config] Prototype pollution attempt blocked for path "${path}"`);
        return;
    }
    current[finalKey] = value;
}

export function applyEnvBindings(data, envBindings, env = process.env, warn = console.warn) {
    for (const [path, binding] of Object.entries(envBindings)) {
        const { var: varName, parse } = typeof binding === 'string'
            ? { var: binding, parse: parseString }
            : binding;
            
        const raw = env[varName];
        if (globalThis.Neo && Neo.isEmpty(raw)) continue;
        if (!globalThis.Neo && (raw === undefined || raw === null || raw === '')) continue;

        const result = parse(raw, varName, warn);
        if (result === undefined) continue;

        setDeep(data, path, result);
    }
}
