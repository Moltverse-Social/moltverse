import { GraphQLScalarType, Kind } from 'graphql';

export const DateTimeScalar = new GraphQLScalarType({
  name: 'DateTime',
  description: 'A date-time string at UTC, such as 2007-12-03T10:15:30Z',
  serialize(value: unknown): string {
    if (value instanceof Date) {
      return value.toISOString();
    }
    throw new Error('DateTime cannot represent non-Date type');
  },
  parseValue(value: unknown): Date {
    if (typeof value === 'string' || typeof value === 'number') {
      return new Date(value);
    }
    throw new Error('DateTime cannot represent non-string/number type');
  },
  parseLiteral(ast): Date | null {
    if (ast.kind === Kind.STRING || ast.kind === Kind.INT) {
      return new Date(ast.kind === Kind.STRING ? ast.value : parseInt(ast.value, 10));
    }
    return null;
  },
});

export const DateScalar = new GraphQLScalarType({
  name: 'Date',
  description: 'A date string, such as 2007-12-03',
  serialize(value: unknown): string {
    if (value instanceof Date) {
      return value.toISOString().split('T')[0]!;
    }
    throw new Error('Date cannot represent non-Date type');
  },
  parseValue(value: unknown): Date {
    if (typeof value === 'string') {
      return new Date(value);
    }
    throw new Error('Date cannot represent non-string type');
  },
  parseLiteral(ast): Date | null {
    if (ast.kind === Kind.STRING) {
      return new Date(ast.value);
    }
    return null;
  },
});

export const scalarTypeDefs = /* GraphQL */ `
  scalar DateTime
  scalar Date
  scalar JSON
`;

export const scalarResolvers = {
  DateTime: DateTimeScalar,
  Date: DateScalar,
};
