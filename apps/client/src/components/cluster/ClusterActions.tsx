/**
 * ClusterActions component
 *
 * Action buttons for cluster (join/leave, edit, delete).
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { Button, ConfirmModal } from '../common';
import {
  JOIN_CLUSTER_MUTATION,
  LEAVE_CLUSTER_MUTATION,
  DELETE_CLUSTER_MUTATION,
} from '../../graphql/mutations';
import { useCanWrite } from '../../hooks';
import type {
  Cluster,
  JoinClusterMutationData,
  LeaveClusterMutationData,
  DeleteClusterMutationData,
} from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface ClusterActionsProps {
  cluster: Cluster;
  isAuthenticated: boolean;
  onRefetch?: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ClusterActions({ cluster, isAuthenticated, onRefetch }: ClusterActionsProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const canWrite = useCanWrite();
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  if (!canWrite) {
    return null;
  }

  const [joinCluster, { loading: joining }] = useMutation<JoinClusterMutationData>(
    JOIN_CLUSTER_MUTATION,
    {
      variables: { clusterId: cluster.id },
      onCompleted: () => onRefetch?.(),
    }
  );

  const [leaveCluster, { loading: leaving }] = useMutation<LeaveClusterMutationData>(
    LEAVE_CLUSTER_MUTATION,
    {
      variables: { clusterId: cluster.id },
      onCompleted: () => onRefetch?.(),
    }
  );

  const [deleteCluster, { loading: deleting }] = useMutation<DeleteClusterMutationData>(
    DELETE_CLUSTER_MUTATION,
    {
      variables: { id: cluster.id },
      onCompleted: () => {
        navigate('/clusters');
      },
    }
  );

  const handleDelete = () => {
    deleteCluster();
    setShowDeleteModal(false);
  };

  if (!isAuthenticated) {
    return null;
  }

  const canEdit = cluster.isCreator || cluster.isModerator;
  const canDelete = cluster.isCreator;

  return (
    <>
      {cluster.isMember ? (
        <>
          {!cluster.isCreator && (
            <Button
              variant="ghost"
              onClick={() => leaveCluster()}
              isLoading={leaving}
            >
              {t('cluster:actions.leaveCluster')}
            </Button>
          )}
        </>
      ) : (
        <Button
          variant="primary"
          onClick={() => joinCluster()}
          isLoading={joining}
        >
          {t('cluster:actions.join')}
        </Button>
      )}

      {canEdit && (
        <Button
          variant="ghost"
          onClick={() => navigate(`/clusters/${cluster.id}/edit`)}
        >
          {t('cluster:actions.edit')}
        </Button>
      )}

      {canDelete && (
        <Button
          variant="danger"
          onClick={() => setShowDeleteModal(true)}
        >
          {t('cluster:actions.delete')}
        </Button>
      )}

      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        title={t('cluster:actions.deleteCluster')}
        message={t('cluster:actions.deleteConfirm', { title: cluster.title })}
        confirmLabel={t('cluster:actions.delete')}
        variant="danger"
        isLoading={deleting}
      />
    </>
  );
}
