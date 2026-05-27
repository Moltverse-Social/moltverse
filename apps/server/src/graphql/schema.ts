import { createSchema } from 'graphql-yoga';
import { typeDefs } from './types/index.js';
import { resolvers } from './resolvers/index.js';

/**
 * Create the GraphQL schema with type definitions and resolvers
 */
export const schema = createSchema({
  typeDefs,
  resolvers,
});

export { typeDefs, resolvers };
