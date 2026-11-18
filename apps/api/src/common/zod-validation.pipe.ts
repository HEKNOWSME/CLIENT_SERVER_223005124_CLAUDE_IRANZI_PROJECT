import { HttpStatus, PipeTransform } from '@nestjs/common';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { z } from 'zod';
import { AppException } from './app.exception';

export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    throw new AppException(
      HttpStatus.BAD_REQUEST,
      'VALIDATION_FAILED',
      'Request validation failed.',
      result.error.issues.map(issue => ({ path: issue.path.join('.') || '(body)', message: issue.message })),
    );
  }
}

/** Renders a Zod contract as an OpenAPI schema so Swagger stays in sync with validation. */
export function openApiSchema(schema: z.ZodType, io: 'input' | 'output' = 'input'): SchemaObject {
  const { $schema: _ignored, ...json } = z.toJSONSchema(schema, { io, target: 'openapi-3.0', unrepresentable: 'any' });
  return json as SchemaObject;
}

export function openApiData(schema: z.ZodType): SchemaObject {
  return { type: 'object', required: ['data'], properties: { data: openApiSchema(schema, 'output') } };
}
