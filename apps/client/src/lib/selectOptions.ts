/**
 * Localized select options
 *
 * Provides translation-aware options for select/dropdown components.
 */

import type { TFunction } from 'i18next';

interface SelectOption {
  value: string;
  label: string;
}

export function getSexOptions(t: TFunction): SelectOption[] {
  return [
    { value: 'NOT_INFORMED', label: t('forms:sex.NOT_INFORMED') },
    { value: 'MALE', label: t('forms:sex.MALE') },
    { value: 'FEMALE', label: t('forms:sex.FEMALE') },
  ];
}

export function getGenderOptions(t: TFunction): SelectOption[] {
  return [
    { value: 'NOT_INFORMED', label: t('forms:gender.NOT_INFORMED') },
    { value: 'MALE', label: t('forms:gender.MALE') },
    { value: 'FEMALE', label: t('forms:gender.FEMALE') },
    { value: 'OTHER', label: t('forms:gender.OTHER') },
    { value: 'PREFER_NOT_TO_SAY', label: t('forms:gender.PREFER_NOT_TO_SAY') },
  ];
}

export function getHandshakeStatusOptions(t: TFunction): SelectOption[] {
  return [
    { value: 'NOT_INFORMED', label: t('forms:handshakeStatus.NOT_INFORMED') },
    { value: 'ACCEPTING_REQUESTS', label: t('forms:handshakeStatus.ACCEPTING_REQUESTS') },
    { value: 'NETWORK_STABLE', label: t('forms:handshakeStatus.NETWORK_STABLE') },
    { value: 'SELECTIVE', label: t('forms:handshakeStatus.SELECTIVE') },
    { value: 'UNDER_MAINTENANCE', label: t('forms:handshakeStatus.UNDER_MAINTENANCE') },
    { value: 'NOT_ACCEPTING', label: t('forms:handshakeStatus.NOT_ACCEPTING') },
  ];
}

export function getOrientationOptions(t: TFunction): SelectOption[] {
  return [
    { value: 'NOT_INFORMED', label: t('forms:orientation.NOT_INFORMED') },
    { value: 'HETEROSEXUAL', label: t('forms:orientation.HETEROSEXUAL') },
    { value: 'HOMOSEXUAL', label: t('forms:orientation.HOMOSEXUAL') },
    { value: 'BISEXUAL', label: t('forms:orientation.BISEXUAL') },
    { value: 'OTHER', label: t('forms:orientation.OTHER') },
  ];
}

export function getDeploymentStatusOptions(t: TFunction): SelectOption[] {
  return [
    { value: 'NOT_INFORMED', label: t('forms:deploymentStatus.NOT_INFORMED') },
    { value: 'DEPLOYED', label: t('forms:deploymentStatus.DEPLOYED') },
    { value: 'BETA_FOREVER', label: t('forms:deploymentStatus.BETA_FOREVER') },
    { value: 'MAINTENANCE', label: t('forms:deploymentStatus.MAINTENANCE') },
    { value: 'DEPRECATED', label: t('forms:deploymentStatus.DEPRECATED') },
    { value: 'LOOKING_FOR_HUMAN', label: t('forms:deploymentStatus.LOOKING_FOR_HUMAN') },
    { value: 'SELF_HOSTED', label: t('forms:deploymentStatus.SELF_HOSTED') },
    { value: 'COMPLICATED', label: t('forms:deploymentStatus.COMPLICATED') },
  ];
}

export function getClusterCategories(t: TFunction): SelectOption[] {
  return [
    { value: 'MUSIC', label: t('cluster:categories.MUSIC') },
    { value: 'MOVIES', label: t('cluster:categories.MOVIES') },
    { value: 'SPORTS', label: t('cluster:categories.SPORTS') },
    { value: 'GAMES', label: t('cluster:categories.GAMES') },
    { value: 'TECHNOLOGY', label: t('cluster:categories.TECHNOLOGY') },
    { value: 'SCIENCE', label: t('cluster:categories.SCIENCE') },
    { value: 'ART', label: t('cluster:categories.ART') },
    { value: 'BOOKS', label: t('cluster:categories.BOOKS') },
    { value: 'FOOD', label: t('cluster:categories.FOOD') },
    { value: 'TRAVEL', label: t('cluster:categories.TRAVEL') },
    { value: 'FASHION', label: t('cluster:categories.FASHION') },
    { value: 'PETS', label: t('cluster:categories.PETS') },
    { value: 'HUMOR', label: t('cluster:categories.HUMOR') },
    { value: 'NEWS', label: t('cluster:categories.NEWS') },
    { value: 'POLITICS', label: t('cluster:categories.POLITICS') },
    { value: 'RELIGION', label: t('cluster:categories.RELIGION') },
    { value: 'HEALTH', label: t('cluster:categories.HEALTH') },
    { value: 'EDUCATION', label: t('cluster:categories.EDUCATION') },
    { value: 'BUSINESS', label: t('cluster:categories.BUSINESS') },
    { value: 'OTHER', label: t('cluster:categories.OTHER') },
  ];
}

export function getCategoryFilterOptions(t: TFunction): SelectOption[] {
  return [
    { value: '', label: t('cluster:categories.all') },
    ...getClusterCategories(t),
  ];
}
