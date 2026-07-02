import { buildZodFieldConfig } from '@autoform/react';
import { z } from 'zod';
import type { FieldTypes } from './auto-form';

export const fieldConfig = buildZodFieldConfig<
  FieldTypes,
  {
    // Add types for `customData` here.
  }
>();

export function removeEmptyValues<T extends Record<string, any>>(values: T): Partial<T> {
  const result: Partial<T> = {};
  for (const key in values) {
    const value = values[key];
    if ([null, undefined, '', [], {}].includes(value)) {
      continue;
    }

    if (Array.isArray(value)) {
      const newArray = value.map((item: any) => {
        if (typeof item === 'object') {
          const cleanedItem = removeEmptyValues(item);
          if (Object.keys(cleanedItem).length > 0) {
            return cleanedItem;
          }
          return null;
        }
        return item;
      });
      const filteredArray = newArray.filter((item: any) => item !== null);
      if (filteredArray.length > 0) {
        result[key] = filteredArray;
      }
    } else if (typeof value === 'object') {
      const cleanedValue = removeEmptyValues(value);
      if (Object.keys(cleanedValue).length > 0) {
        result[key] = cleanedValue as any;
      }
    } else {
      result[key] = value;
    }
  }

  return result;
}

type JsonSchemaObject = Record<string, unknown>;

function isRecord(value: unknown): value is JsonSchemaObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asSchemaArray(value: unknown): JsonSchemaObject[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function literalSchema(value: unknown): z.ZodTypeAny {
  if (value === null) return z.null();
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return z.literal(value);
  }
  return z.any().refine(candidate => Object.is(candidate, value), 'Invalid literal value');
}

function unionSchemas(schemas: z.ZodTypeAny[]): z.ZodTypeAny {
  const uniqueSchemas = schemas.length > 0 ? schemas : [z.any()];
  if (uniqueSchemas.length === 1) {
    return uniqueSchemas[0];
  }

  return z.union(uniqueSchemas as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
}

function intersectSchemas(schemas: z.ZodTypeAny[]): z.ZodTypeAny {
  if (schemas.length === 0) {
    return z.any();
  }

  return schemas.slice(1).reduce((current, nextSchema) => current.and(nextSchema), schemas[0]);
}

function applyNumberBounds(schema: z.ZodNumber, jsonSchema: JsonSchemaObject): z.ZodNumber {
  let current = schema;
  if (typeof jsonSchema.minimum === 'number') current = current.min(jsonSchema.minimum);
  if (typeof jsonSchema.maximum === 'number') current = current.max(jsonSchema.maximum);
  if (typeof jsonSchema.exclusiveMinimum === 'number') current = current.gt(jsonSchema.exclusiveMinimum);
  if (typeof jsonSchema.exclusiveMaximum === 'number') current = current.lt(jsonSchema.exclusiveMaximum);
  return current;
}

function applyStringBounds(schema: z.ZodString, jsonSchema: JsonSchemaObject): z.ZodString {
  let current = schema;
  if (typeof jsonSchema.minLength === 'number') current = current.min(jsonSchema.minLength);
  if (typeof jsonSchema.maxLength === 'number') current = current.max(jsonSchema.maxLength);
  if (typeof jsonSchema.pattern === 'string') {
    current = current.regex(new RegExp(jsonSchema.pattern));
  }
  if (jsonSchema.format === 'email') current = current.email();
  if (jsonSchema.format === 'uri' || jsonSchema.format === 'url') current = current.url();
  if (jsonSchema.format === 'date-time') current = current.datetime();
  return current;
}

function applyArrayBounds(schema: z.ZodArray<z.ZodTypeAny>, jsonSchema: JsonSchemaObject): z.ZodArray<z.ZodTypeAny> {
  let current = schema;
  if (typeof jsonSchema.minItems === 'number') current = current.min(jsonSchema.minItems);
  if (typeof jsonSchema.maxItems === 'number') current = current.max(jsonSchema.maxItems);
  return current;
}

function applyMetadata(schema: z.ZodTypeAny, jsonSchema: JsonSchemaObject): z.ZodTypeAny {
  let current = schema;
  if (typeof jsonSchema.description === 'string') {
    current = current.describe(jsonSchema.description);
  }
  if (jsonSchema.default !== undefined) {
    current = current.default(jsonSchema.default);
  }
  return current;
}

function buildObjectSchema(jsonSchema: JsonSchemaObject, seen: WeakSet<object>): z.ZodTypeAny {
  const properties = isRecord(jsonSchema.properties) ? jsonSchema.properties : {};
  const required = new Set(Array.isArray(jsonSchema.required) ? jsonSchema.required.filter((key): key is string => typeof key === 'string') : []);
  const shape: z.ZodRawShape = {};

  for (const [key, propertySchema] of Object.entries(properties)) {
    const parsedProperty = buildJsonSchema(propertySchema, seen);
    shape[key] = required.has(key) ? parsedProperty : parsedProperty.optional();
  }

  let objectSchema: z.ZodObject<z.ZodRawShape> = z.object(shape);
  if (jsonSchema.additionalProperties === false) {
    objectSchema = objectSchema.strict();
  }

  if (isRecord(jsonSchema.additionalProperties)) {
    return objectSchema.catchall(buildJsonSchema(jsonSchema.additionalProperties, seen));
  }

  return objectSchema;
}

function buildArraySchema(jsonSchema: JsonSchemaObject, seen: WeakSet<object>): z.ZodTypeAny {
  const items = Array.isArray(jsonSchema.items) ? jsonSchema.items[0] : jsonSchema.items;
  return applyArrayBounds(z.array(buildJsonSchema(items, seen)), jsonSchema);
}

function buildSchemaForType(typeName: string, jsonSchema: JsonSchemaObject, seen: WeakSet<object>): z.ZodTypeAny {
  switch (typeName) {
    case 'string':
      return applyStringBounds(z.string(), jsonSchema);
    case 'number':
      return applyNumberBounds(z.number(), jsonSchema);
    case 'integer':
      return applyNumberBounds(z.number().int(), jsonSchema);
    case 'boolean':
      return z.boolean();
    case 'null':
      return z.null();
    case 'array':
      return buildArraySchema(jsonSchema, seen);
    case 'object':
      return buildObjectSchema(jsonSchema, seen);
    default:
      return z.any();
  }
}

function buildJsonSchema(schema: unknown, seen: WeakSet<object>): z.ZodTypeAny {
  if (!isRecord(schema)) {
    return z.any();
  }

  if (seen.has(schema)) {
    return z.any();
  }

  seen.add(schema);

  let result: z.ZodTypeAny;
  if (Array.isArray(schema.enum)) {
    result = unionSchemas(schema.enum.map(literalSchema));
  } else if (schema.const !== undefined) {
    result = literalSchema(schema.const);
  } else if (Array.isArray(schema.anyOf)) {
    result = unionSchemas(asSchemaArray(schema.anyOf).map(item => buildJsonSchema(item, seen)));
  } else if (Array.isArray(schema.oneOf)) {
    result = unionSchemas(asSchemaArray(schema.oneOf).map(item => buildJsonSchema(item, seen)));
  } else if (Array.isArray(schema.allOf)) {
    result = intersectSchemas(asSchemaArray(schema.allOf).map(item => buildJsonSchema(item, seen)));
  } else if (Array.isArray(schema.type)) {
    result = unionSchemas(schema.type.map(typeName => buildSchemaForType(String(typeName), schema, seen)));
  } else if (typeof schema.type === 'string') {
    result = buildSchemaForType(schema.type, schema, seen);
  } else if (schema.properties || schema.additionalProperties) {
    result = buildObjectSchema(schema, seen);
  } else if (schema.items) {
    result = buildArraySchema(schema, seen);
  } else {
    result = z.any();
  }

  seen.delete(schema);
  return applyMetadata(result, schema);
}

export function jsonSchemaToZodSchema(jsonSchema: unknown): z.ZodTypeAny {
  return buildJsonSchema(jsonSchema, new WeakSet<object>());
}

export function resolveSerializedZodOutput(_obj: unknown): z.ZodTypeAny {
  throw new Error('String-based Zod schema evaluation is disabled. Use jsonSchemaToZodSchema with a JSON Schema object.');
}
