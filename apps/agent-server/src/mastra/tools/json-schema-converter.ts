import { z } from 'zod';

/**
 * 将 JSON Schema 转换为 Zod schema
 * 用于运行时输入校验。
 *
 * 支持: type, properties, required, enum, array, items,
 *       number min/max, string min/max/pattern, nullable, anyOf/oneOf
 */
export function jsonSchemaToZod(jsonSchema: Record<string, any>): z.ZodTypeAny {
  if (!jsonSchema || typeof jsonSchema !== 'object') {
    return z.any();
  }

  // 处理 $ref (简单内联引用 — 当前不支持, 降级为 any)
  if (jsonSchema.$ref) {
    return z.any();
  }

  const { type, enum: enumValues, anyOf, oneOf } = jsonSchema;

  // 枚举
  if (enumValues && Array.isArray(enumValues)) {
    return z.enum(enumValues as [string, ...string[]]);
  }

  // 联合类型
  if (anyOf || oneOf) {
    const schemas = (anyOf || oneOf).map((s: any) => jsonSchemaToZod(s));
    if (schemas.length >= 2) {
      return z.union(schemas as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
    }
    return schemas[0] ?? z.any();
  }

  switch (type) {
    case 'string':
      return buildStringSchema(jsonSchema);
    case 'number':
    case 'integer':
      return buildNumberSchema(jsonSchema);
    case 'boolean':
      return z.boolean();
    case 'array':
      return buildArraySchema(jsonSchema);
    case 'object':
      return buildObjectSchema(jsonSchema);
    case 'null':
      return z.null();
    default:
      return z.any();
  }
}

function buildStringSchema(schema: Record<string, any>): z.ZodTypeAny {
  let s = z.string();
  if (schema.minLength !== undefined) s = s.min(schema.minLength);
  if (schema.maxLength !== undefined) s = s.max(schema.maxLength);
  if (schema.pattern) {
    try { s = s.regex(new RegExp(schema.pattern)); } catch { /* 无效正则, 跳过 */ }
  }
  if (schema.description) s = s.describe(schema.description);
  // .default() 必须最后应用，因为它返回 ZodDefault<ZodString> 而非 ZodString
  if (schema.default !== undefined) {
    return s.default(schema.default);
  }
  return s;
}

function buildNumberSchema(schema: Record<string, any>): z.ZodTypeAny {
  let s = z.number();
  if (schema.minimum !== undefined) s = s.min(schema.minimum);
  if (schema.maximum !== undefined) s = s.max(schema.maximum);
  if (schema.description) s = s.describe(schema.description);
  // .default() 必须最后应用
  if (schema.default !== undefined) {
    return s.default(schema.default);
  }
  return s;
}

function buildArraySchema(schema: Record<string, any>): z.ZodTypeAny {
  const itemSchema = schema.items ? jsonSchemaToZod(schema.items) : z.any();
  let s = z.array(itemSchema);
  if (schema.minItems !== undefined) s = s.min(schema.minItems);
  if (schema.maxItems !== undefined) s = s.max(schema.maxItems);
  if (schema.description) s = s.describe(schema.description);
  return s;
}

function buildObjectSchema(schema: Record<string, any>): z.ZodTypeAny {
  const props = schema.properties || {};
  const required = new Set(schema.required || []);
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [key, subSchema] of Object.entries(props)) {
    const zodSchema = jsonSchemaToZod(subSchema as Record<string, any>);
    shape[key] = required.has(key) ? zodSchema : zodSchema.optional();
  }

  let s = z.object(shape);
  if (schema.description) s = s.describe(schema.description);
  // 允许额外属性 (宽松模式)
  return s.passthrough();
}
