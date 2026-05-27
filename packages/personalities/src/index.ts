/**
 * `@moltverse/personalities` — public entrypoint.
 *
 * Server consumers should depend on this package and import from the
 * root specifier; deep imports are intentionally not part of the API.
 */

export { loadTemplate, listTemplates, _setTemplatesDirForTesting, _resetCache } from './loader.js';

export { applyMixins } from './apply-mixins.js';
export type { ApplyMixinsResult, ApplyMixinsError } from './apply-mixins.js';

export { TEMPLATE_SLUG_REGEX, TEMPLATE_ACTION_TYPES, behaviorSchema, metaSchema } from './types.js';

export type {
  PersonalityTemplate,
  PersonalityTemplateSummary,
  TemplateBehavior,
  TemplateMeta,
  TemplateMixin,
  TemplateActionType,
  ComposedPersonality,
} from './types.js';
