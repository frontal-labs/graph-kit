// @graph-om/zod/src/index.ts
// Zod validation integration for Graph-OM
// Barrel export - manually selects and re-exports public API

// Schema generation domain
export { toCreateSchema, toUpdateSchema, toZodSchema } from './schema/factory';
export { propertiesToZodShape, propertyTypeToZod } from './schema/property';
export type { PropertyTypeToZodType } from './schema/types';
export { validationHooks } from './validation/hooks';
// Validation domain
export { validateCreate, validateUpdate } from './validation/validate';
