// @graph-om/zod/src/schema/index.ts
// Schema generation domain barrel

export { toCreateSchema, toUpdateSchema, toZodSchema } from './factory';
export { propertiesToZodShape, propertyTypeToZod } from './property';
export type { PropertyTypeToZodType } from './types';
