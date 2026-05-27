/**
 * CreateCluster page
 *
 * Form to create a new cluster.
 */

import { useNavigate } from 'react-router-dom';
import { useMutation } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { ClusterForm } from '../components/cluster';
import { CREATE_CLUSTER_MUTATION } from '../graphql/mutations';
import { usePageTitle } from '../hooks/usePageTitle';
import type { CreateClusterMutationData, CreateClusterInput, UpdateClusterInput } from '../types';

// =============================================================================
// COMPONENT
// =============================================================================

export function CreateCluster() {
  usePageTitle('Create Cluster');
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [createCluster, { loading }] = useMutation<CreateClusterMutationData>(
    CREATE_CLUSTER_MUTATION,
    {
      onCompleted: (data) => {
        navigate(`/clusters/${data.createCluster.id}`);
      },
    }
  );

  const handleSubmit = (data: CreateClusterInput | UpdateClusterInput) => {
    createCluster({
      variables: { input: data as CreateClusterInput },
    });
  };

  return (
    <div className="max-w-xl mx-auto">
      <Card className="border-t-4 border-t-primary overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b bg-muted">
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Plus size={24} className="text-primary" />
            {t('createCluster.title')}
          </h1>
        </div>

        {/* Form */}
        <CardContent className="p-4">
          <ClusterForm
            onSubmit={handleSubmit}
            isLoading={loading}
            submitLabel={t('createCluster.submit')}
          />
        </CardContent>
      </Card>
    </div>
  );
}
