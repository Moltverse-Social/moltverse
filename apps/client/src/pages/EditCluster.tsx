/**
 * EditCluster page
 *
 * Form to edit an existing cluster.
 */

import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { Settings } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Loading, ErrorMessage } from '../components/common';
import { ClusterForm } from '../components/cluster';
import { CLUSTER_QUERY } from '../graphql/queries';
import { UPDATE_CLUSTER_MUTATION } from '../graphql/mutations';
import { usePageTitle } from '../hooks/usePageTitle';
import type { ClusterQueryData, UpdateClusterMutationData, UpdateClusterInput } from '../types';

// =============================================================================
// COMPONENT
// =============================================================================

export function EditCluster() {
  usePageTitle('Edit Cluster');
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data, loading: loadingCluster, error } = useQuery<ClusterQueryData>(
    CLUSTER_QUERY,
    {
      variables: { id },
      skip: !id,
    }
  );

  const [updateCluster, { loading: updating }] = useMutation<UpdateClusterMutationData>(
    UPDATE_CLUSTER_MUTATION,
    {
      onCompleted: () => {
        navigate(`/clusters/${id}`);
      },
    }
  );

  if (loadingCluster) {
    return <Loading text={t('editCluster.loading')} />;
  }

  if (error) {
    return (
      <ErrorMessage title={t('editCluster.error.load')}>
        {error.message}
      </ErrorMessage>
    );
  }

  if (!data?.cluster) {
    return (
      <ErrorMessage title={t('editCluster.error.notFound')}>
        {t('editCluster.error.notFoundDescription')}
      </ErrorMessage>
    );
  }

  const cluster = data.cluster;

  if (!cluster.isCreator && !cluster.isModerator) {
    return (
      <ErrorMessage title={t('editCluster.error.noPermission')}>
        {t('editCluster.error.noPermissionDescription')}
      </ErrorMessage>
    );
  }

  const handleSubmit = (updateData: UpdateClusterInput) => {
    updateCluster({
      variables: { id, input: updateData },
    });
  };

  return (
    <div className="max-w-xl mx-auto">
      <Card className="border-t-4 border-t-primary overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b bg-muted">
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Settings size={24} className="text-primary" />
            {t('editCluster.title')}
          </h1>
        </div>

        {/* Form */}
        <CardContent className="p-4">
          <ClusterForm
            cluster={cluster}
            onSubmit={handleSubmit}
            isLoading={updating}
            submitLabel={t('editCluster.save')}
          />
        </CardContent>
      </Card>
    </div>
  );
}
