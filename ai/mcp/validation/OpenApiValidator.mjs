import {z} from 'zod';

/**
 * Dynamically constructs a Zod schema for a tool's input arguments based on its
 * OpenAPI operation definition. This schema is used for robust runtime validation
 * of incoming tool call arguments.
 * @param {object} openApiDocument - The OpenAPI document object.
 * @param {object} operation       - The OpenAPI operation object.
 * @returns {z.ZodObject} A Zod object schema representing the tool's input.
 */
function buildZodSchema(openApiDocument, operation) {
    const shape = {};

    // Process parameters defined in the OpenAPI operation (path, query, header, etc.).
    if (operation.parameters) {
        for (const param of operation.parameters) {
            let schema;
            switch (param.schema.type) {
                case 'integer':
                    schema = z.number().int();
                    break;
                case 'string':
                    schema = z.string();
                    break;
                case 'boolean':
                    schema = z.boolean();
                    break;
                default:
                    // Fallback for unsupported or unknown schema types.
                    schema = z.any();
            }
            // Mark schema as optional if not explicitly required.
            if (!param.required) {
                schema = schema.optional();
            }
            // Add description for better Zod schema introspection.
            shape[param.name] = schema.describe(param.description);
        }
    }

    // Process request body properties, typically for POST/PUT operations.
    if (operation.requestBody?.content?.['application/json']?.schema) {
        let requestBodySchema = operation.requestBody.content['application/json'].schema;
        if (requestBodySchema.$ref) {
            requestBodySchema = resolveRef(openApiDocument, requestBodySchema.$ref);
        }

        if (requestBodySchema.properties) {
            const { properties, required = [] } = requestBodySchema;
            for (const [propName, propSchema] of Object.entries(properties)) {
                let schema;
                switch (propSchema.type) {
                    case 'string':
                        schema = z.string();
                        break;
                    case 'array':
                        schema = z.array(z.string());
                        break;
                    default:
                        schema = z.any();
                }
                if (!required.includes(propName)) {
                    schema = schema.optional();
                }
                shape[propName] = schema.describe(propSchema.description);
            }
        }
    }
    return z.object(shape);
}

/**
 * Recursively resolves JSON references ($ref) within the OpenAPI document.
 * This is crucial for building complete Zod schemas from potentially fragmented
 * OpenAPI definitions (e.g., schemas defined in 'components').
 * @param {object} doc - The full OpenAPI document.
 * @param {string} ref - The JSON reference string (e.g., '#/components/schemas/MySchema').
 * @returns {object} The resolved schema object.
 */
function resolveRef(doc, ref) {
    // Remove '#/' prefix and split the path into components.
    const parts = ref.substring(2).split('/');
    // Traverse the document object to find the referenced schema.
    return parts.reduce((acc, part) => acc[part], doc);
}

/**
 * Recursively builds a Zod schema from an OpenAPI schema object, handling
 * nested structures and JSON references. This is used for output schemas.
 * @param {object} doc - The full OpenAPI document for reference resolution.
 * @param {object} schema - The OpenAPI schema object (or a resolved reference).
 * @returns {z.ZodType} A Zod schema representing the OpenAPI schema.
 */
function buildZodSchemaFromResponse(doc, schema) {
    if (schema.$ref) {
        return buildZodSchemaFromResponse(doc, resolveRef(doc, schema.$ref));
    }

    if (schema.oneOf) {
        const options = schema.oneOf.map(s => buildZodSchemaFromResponse(doc, s));
        return z.union(options);
    }

    let zodSchema;
    if (schema.type === 'object') {
        const shape = {};
        if (schema.properties) {
            const required = schema.required || [];
            for (const [propName, propSchema] of Object.entries(schema.properties)) {
                let propertySchema = buildZodSchemaFromResponse(doc, propSchema);
                if (!required.includes(propName)) {
                    propertySchema = propertySchema.optional();
                }
                shape[propName] = propertySchema;
            }
        }
        zodSchema = z.object(shape);
    } else if (schema.type === 'array') {
        zodSchema = z.array(buildZodSchemaFromResponse(doc, schema.items));
    } else if (schema.type === 'string') {
        zodSchema = z.string();
    } else if (schema.type === 'integer') {
        zodSchema = z.number().int();
    } else if (schema.type === 'boolean') {
        zodSchema = z.boolean();
    } else {
        zodSchema = z.any();
    }

    if (schema.nullable) {
        zodSchema = zodSchema.nullable();
    }

    if (schema.description) {
        zodSchema = zodSchema.describe(schema.description);
    }

    return zodSchema;
}

/**
 * Constructs a Zod schema for a tool's output based on its OpenAPI operation's
 * successful response (200, 201, or 202). This schema is used to describe the expected
 * output structure to clients.
 * @param {object} doc - The full OpenAPI document for reference resolution.
 * @param {object} operation - The OpenAPI operation object.
 * @returns {z.ZodType|null} A Zod schema for the output, or null if no schema is defined.
 */
function buildOutputZodSchema(doc, operation) {
    const response = operation.responses?.['200'] || operation.responses?.['201'] || operation.responses?.['202'];
    const schema = response?.content?.['application/json']?.schema;

    if (schema) {
        return buildZodSchemaFromResponse(doc, schema);
    }

    if (response?.content?.['text/plain']) {
        // For text/plain, we need to wrap it in an object for client compatibility
        return z.object({ result: z.string().describe(response.description || '') }).required();
    }

    // If no schema is found, return null to indicate its absence.
    return null;
}

export {
    buildZodSchema,
    buildOutputZodSchema,
    resolveRef
};
