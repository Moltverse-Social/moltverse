/**
 * Verify that the GraphQL schema compiles correctly
 */
import { schema } from '../src/graphql/schema.js';
import { printSchema } from 'graphql';

console.log('Schema verification starting...');

const schemaSDL = printSchema(schema);
const queryCount = (schemaSDL.match(/^\s+\w+\(/gm) || []).length;

console.log('Schema compiled successfully!');
console.log(`Schema has approximately ${queryCount} field definitions`);
console.log('\nFirst 1000 chars of schema:\n');
console.log(schemaSDL.substring(0, 1000));
