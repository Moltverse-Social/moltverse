/**
 * GraphQL Query Guards Plugin (SEC-001)
 *
 * Protects the GraphQL API against resource exhaustion attacks:
 *
 * 1. Depth Limiting - Prevents deeply nested queries that cause
 *    exponential database joins (e.g., user.friends.friends.friends...)
 *
 * 2. Alias Limiting - Prevents queries with excessive top-level aliases
 *    that bypass rate limiting (e.g., a1: login(...), a2: login(...), ...)
 *
 * Both rules operate on the parsed AST, not on regex patterns,
 * making them resistant to obfuscation and formatting tricks.
 */

import {
  GraphQLError,
  Kind,
  type SelectionSetNode,
  type ValidationContext,
  type ASTVisitor,
} from 'graphql';
import type { Plugin } from 'graphql-yoga';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Maximum query depth allowed.
 *
 * A depth of 10 allows reasonable nesting for our schema:
 *   user(id) → friends → nodes → scraps → sender → ...
 * while blocking exponential queries that nest 20+ levels deep.
 *
 * Introspection queries typically reach depth 7-8, so 10 is safe.
 */
const MAX_QUERY_DEPTH = 10;

/**
 * Maximum number of top-level field selections per operation.
 *
 * This limits the total number of aliases in a single operation:
 *   mutation { a1: login(...), a2: login(...), ... }
 *
 * 15 is generous for legitimate use (most queries have 1-5 fields)
 * but prevents the 100+ alias attacks identified in SEC-002.
 */
const MAX_ALIASES_PER_OPERATION = 15;

// ============================================================================
// DEPTH LIMIT VALIDATION RULE
// ============================================================================

/**
 * Creates a GraphQL validation rule that rejects queries exceeding maxDepth.
 *
 * Depth is counted by the nesting level of field selections:
 *   query { user { name } }                    → depth 2
 *   query { user { friends { nodes { name } } } } → depth 4
 *
 * Fragment spreads and inline fragments are followed but do not
 * add to the depth count (they expand at the same level).
 */
function createDepthLimitRule(maxDepth: number) {
  return function DepthLimitRule(context: ValidationContext): ASTVisitor {
    return {
      OperationDefinition(node) {
        const depth = measureSelectionSetDepth(
          node.selectionSet,
          context,
          0,
          new Set<string>(),
        );

        if (depth > maxDepth) {
          context.reportError(
            new GraphQLError(
              `Query depth of ${depth} exceeds the maximum allowed depth of ${maxDepth}. ` +
              `Simplify your query by reducing nesting.`,
              { nodes: [node] },
            ),
          );
        }
      },
    };
  };
}

/**
 * Recursively measure the depth of a selection set.
 *
 * Uses a visited set to prevent infinite loops from circular
 * fragment references (which would also be caught by GraphQL's
 * built-in validation, but defense-in-depth).
 */
function measureSelectionSetDepth(
  selectionSet: SelectionSetNode | undefined,
  context: ValidationContext,
  currentDepth: number,
  visitedFragments: Set<string>,
): number {
  if (!selectionSet) return currentDepth;

  let maxDepth = currentDepth;

  for (const selection of selectionSet.selections) {
    switch (selection.kind) {
      case Kind.FIELD: {
        const fieldDepth = measureSelectionSetDepth(
          selection.selectionSet,
          context,
          currentDepth + 1,
          visitedFragments,
        );
        maxDepth = Math.max(maxDepth, fieldDepth);
        break;
      }

      case Kind.INLINE_FRAGMENT: {
        const inlineDepth = measureSelectionSetDepth(
          selection.selectionSet,
          context,
          currentDepth,
          visitedFragments,
        );
        maxDepth = Math.max(maxDepth, inlineDepth);
        break;
      }

      case Kind.FRAGMENT_SPREAD: {
        const fragmentName = selection.name.value;
        // Prevent circular fragment references
        if (visitedFragments.has(fragmentName)) break;
        visitedFragments.add(fragmentName);

        const fragment = context.getFragment(fragmentName);
        if (fragment) {
          const fragmentDepth = measureSelectionSetDepth(
            fragment.selectionSet,
            context,
            currentDepth,
            visitedFragments,
          );
          maxDepth = Math.max(maxDepth, fragmentDepth);
        }
        break;
      }
    }
  }

  return maxDepth;
}

// ============================================================================
// ALIAS LIMIT VALIDATION RULE
// ============================================================================

/**
 * Creates a GraphQL validation rule that rejects operations with too many
 * top-level field selections (including aliases).
 *
 * This prevents alias-based rate limit bypass where an attacker sends:
 *   mutation { a1: login(...), a2: login(...), ..., a100: login(...) }
 *
 * Each alias would execute the resolver independently, but rate limiting
 * (before this fix) only counted the request once.
 */
function createAliasLimitRule(maxAliases: number) {
  return function AliasLimitRule(context: ValidationContext): ASTVisitor {
    return {
      OperationDefinition(node) {
        const fieldCount = node.selectionSet.selections.filter(
          (s) => s.kind === Kind.FIELD,
        ).length;

        if (fieldCount > maxAliases) {
          context.reportError(
            new GraphQLError(
              `Operation has ${fieldCount} top-level fields, exceeding the maximum of ${maxAliases}. ` +
              `Reduce the number of fields or split into separate requests.`,
              { nodes: [node] },
            ),
          );
        }
      },
    };
  };
}

// ============================================================================
// YOGA PLUGIN
// ============================================================================

/**
 * GraphQL Yoga plugin that registers depth and alias limiting
 * as validation rules.
 *
 * These rules run during the validation phase, BEFORE any resolvers
 * execute. Rejected queries receive a standard GraphQL error response
 * with no server-side computation beyond parsing and validation.
 */
export function useQueryGuards(): Plugin {
  const depthRule = createDepthLimitRule(MAX_QUERY_DEPTH);
  const aliasRule = createAliasLimitRule(MAX_ALIASES_PER_OPERATION);

  return {
    onValidate({ addValidationRule }) {
      addValidationRule(depthRule);
      addValidationRule(aliasRule);
    },
  };
}

export { MAX_QUERY_DEPTH, MAX_ALIASES_PER_OPERATION };
