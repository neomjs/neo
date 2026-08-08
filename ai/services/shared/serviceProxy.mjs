import fs               from 'fs';
import * as yaml        from 'js-yaml';
import {buildZodSchema} from '../../mcp/validation/openApiValidator.mjs';

/**
 * @module ai/services/shared/serviceProxy
 * @summary The validating-Proxy machinery both SDK barrels share: OpenAPI spec loading, the
 * method-name-to-`operationId` join, and the Zod facade that wraps a service.
 *
 * ## Why this is its own module rather than living in `ai/services.mjs`
 *
 * The barrel is being split so a host-plane entrypoint cannot reach a durable store by import alone
 * A host barrel needs this machinery — and if it imported it from `ai/services.mjs` it
 * would pull that module's entire transitive graph, including the cloud-plane store clients, which
 * is the exact reachability the split exists to remove. Sharing the machinery therefore requires it
 * to sit below both barrels rather than inside either.
 *
 * Sibling of `boundedRetryGate.mjs` and `storeWriteGuard.mjs`: a plain module with named exports and
 * no Neo coupling, so specs import it directly without standing a barrel up.
 *
 * **Relocated, with one observable change.** The contracts are unchanged from its previous home —
 * including `safeLoadYaml`'s fail-open behaviour and `makeSafe`'s null-spec passthrough — so a
 * reviewer diffing the split sees relocation, not a rewrite wearing a move's clothes. The exception,
 * named rather than glossed: log lines now carry the `[serviceProxy]` prefix instead of
 * `[services.mjs]`, which is the accurate label for the new home but is not "verbatim". Anything
 * grepping those logs by the old prefix needs updating.
 */

// --- Runtime Type Safety Logic ---

function camelToSnake(str) {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

function findOperation(spec, operationId) {
    for (const pathItem of Object.values(spec.paths)) {
        for (const operation of Object.values(pathItem)) {
            if (operation.operationId === operationId) {
                return operation;
            }
        }
    }
    return null;
}

/**
 * Wraps a service object to enforce Zod validation on its methods based on OpenAPI specs.
 * @param {Object} service - The raw service object.
 * @param {Object} spec - The parsed OpenAPI document.
 * @returns {Object} - The service object with wrapped methods (mutates original or returns proxy).
 */
function makeSafe(service, spec) {
    if (!spec) {
        console.warn(`[serviceProxy] Warning: OpenAPI spec is null or invalid. Running ${service?.constructor?.name || 'Service'} in degraded mode (NO Zod validation).`);
        return service;
    }

    const wrappedMethods = new Map();
    const proto          = Object.getPrototypeOf(service);
    const keys           = new Set([...Object.getOwnPropertyNames(service), ...Object.getOwnPropertyNames(proto)]);

    for (const key of keys) {
        if (key === 'constructor') continue;

        if (typeof service[key] === 'function') {
            const operationId = camelToSnake(key);
            const operation   = findOperation(spec, operationId);

            if (operation) {
                const zodSchema = buildZodSchema(spec, operation);

                wrappedMethods.set(key, async (args) => {
                    const currentMethod = service[key];
                    if (args !== undefined && (typeof args !== 'object' || args === null || Array.isArray(args))) {
                        return currentMethod.call(service, args);
                    }
                    const parsedArgs = zodSchema.parse(args || {});

                    if (operation['x-pass-as-object']) {
                        return currentMethod.call(service, parsedArgs);
                    } else {
                        const paramNames = (operation.parameters || []).map(p => p.name);
                        if (operation.requestBody?.content?.['application/json']?.schema) {
                            const argValues = paramNames.map(name => parsedArgs[name]);
                            return currentMethod.call(service, ...argValues);
                        }
                        const argValues = paramNames.map(name => parsedArgs[name]);
                        return currentMethod.call(service, ...argValues);
                    }
                });
            }
        }
    }

    return new Proxy(service, {
        get(target, prop) {
            if (wrappedMethods.has(prop)) {
                return wrappedMethods.get(prop);
            }
            const value = Reflect.get(target, prop, target);
            if (typeof value === 'function') {
                return value.bind(target);
            }
            return value;
        }
    });
}


// --- Load Specs ---
/**
 * Safely loads a YAML OpenAPI specification.
 *
 * Degraded Mode Semantics (Fail-Open):
 * If a specification file is missing or contains syntax errors, this function catches the error
 * and returns `null` rather than crashing the process. This prevents a single malformed MCP
 * spec from causing a systemic boot cascade failure across all daemon services.
 * Downstream consumers (e.g., `makeSafe`) must handle `null` by skipping validation.
 */
function safeLoadYaml(filePath) {
    try {
        return yaml.load(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
        console.error(`[serviceProxy] Failed to load or parse YAML at ${filePath}:`, err.message);
        return null;
    }
}

export {camelToSnake, findOperation, makeSafe, safeLoadYaml};
