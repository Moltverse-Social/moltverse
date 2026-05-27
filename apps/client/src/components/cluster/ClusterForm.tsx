/**
 * ClusterForm component
 *
 * Form to create or edit a cluster.
 */

import { useState, useEffect } from 'react';
import { useQuery } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { Input, Textarea, Select, Button, ImageUpload } from '../common';
import { CATEGORIES_QUERY } from '../../graphql/queries';
import type { CategoriesQueryData, CreateClusterInput, UpdateClusterInput, Cluster } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface ClusterFormProps {
  cluster?: Cluster;
  onSubmit: (data: CreateClusterInput | UpdateClusterInput) => void;
  isLoading?: boolean;
  submitLabel?: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ClusterForm({
  cluster,
  onSubmit,
  isLoading = false,
  submitLabel,
}: ClusterFormProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(cluster?.title || '');
  const [picture, setPicture] = useState(cluster?.picture || '');
  const [description, setDescription] = useState(cluster?.description || '');
  const [type, setType] = useState(cluster?.type || 'PUBLIC');
  const [categoryId, setCategoryId] = useState<string>(cluster?.category?.id || '');
  const [language, setLanguage] = useState(cluster?.language || '');
  const [country, setCountry] = useState(cluster?.country || '');

  const { data: categoriesData } = useQuery<CategoriesQueryData>(CATEGORIES_QUERY);

  const resolvedSubmitLabel = submitLabel || t('cluster:form.submit');

  useEffect(() => {
    if (cluster) {
      setTitle(cluster.title);
      setPicture(cluster.picture);
      setDescription(cluster.description || '');
      setType(cluster.type || 'PUBLIC');
      setCategoryId(cluster.category?.id || '');
      setLanguage(cluster.language || '');
      setCountry(cluster.country || '');
    }
  }, [cluster]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (cluster) {
      const updateData: UpdateClusterInput = {
        title: title !== cluster.title ? title : undefined,
        picture: picture !== cluster.picture ? picture : undefined,
        description: description !== cluster.description ? description : undefined,
        type: type !== cluster.type ? (type as 'PUBLIC' | 'PRIVATE') : undefined,
        language: language !== cluster.language ? language : undefined,
        country: country !== cluster.country ? country : undefined,
      };
      onSubmit(updateData);
    } else {
      const createData: CreateClusterInput = {
        title,
        picture,
        description: description || undefined,
        type: type as 'PUBLIC' | 'PRIVATE',
        categoryId: Number(categoryId),
        language: language || undefined,
        country: country || undefined,
      };
      onSubmit(createData);
    }
  };

  const categoryOptions = categoriesData?.categories.map((cat) => ({
    value: cat.id,
    label: cat.title || t('cluster:form.noName'),
  })) || [];

  const typeOptions = [
    { value: 'PUBLIC', label: t('cluster:info.public') },
    { value: 'PRIVATE', label: t('cluster:info.private') },
  ];

  const isValid = title.trim() && picture && (cluster || categoryId);

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input
        label={t('cluster:form.name')}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t('cluster:form.namePlaceholder')}
        required
      />

      <ImageUpload
        preset="cluster"
        currentUrl={picture || undefined}
        onUpload={(url) => setPicture(url)}
        label={t('cluster:form.imageUrl')}
      />

      <Textarea
        label={t('cluster:form.description')}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={t('cluster:form.descriptionPlaceholder')}
        rows={4}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {!cluster && (
          <Select
            label={t('cluster:form.category')}
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            options={categoryOptions}
            placeholder={t('cluster:form.categoryPlaceholder')}
            required
          />
        )}

        <Select
          label={t('cluster:form.type')}
          value={type}
          onChange={(e) => setType(e.target.value as 'PUBLIC' | 'PRIVATE')}
          options={typeOptions}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label={t('cluster:form.language')}
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          placeholder={t('cluster:form.languagePlaceholder')}
        />

        <Input
          label={t('cluster:form.country')}
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          placeholder={t('cluster:form.countryPlaceholder')}
        />
      </div>

      <div className="flex justify-end gap-3 mt-2">
        <Button type="submit" isLoading={isLoading} disabled={!isValid}>
          {resolvedSubmitLabel}
        </Button>
      </div>
    </form>
  );
}
