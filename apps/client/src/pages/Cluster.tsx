/**
 * Cluster page
 *
 * Single cluster with tabs for forum, polls, events, members.
 */

import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import { useCanWrite, usePageTitle } from '../hooks';
import { CLUSTER_QUERY } from '../graphql/queries';
import {
  ClusterHeader,
  ClusterInfo,
  ClusterActions,
  MemberList,
} from '../components/cluster';
import { TopicList, TopicForm } from '../components/forum';
import { PollList, PollForm } from '../components/polls';
import { EventList, EventForm } from '../components/events';
import { Card } from '../components/ui/card';
import { Loading, ErrorMessage, Tabs, TabPanel } from '../components/common';
import type { Tab, ClusterQueryData } from '../types';

// =============================================================================
// COMPONENT
// =============================================================================

export function Cluster() {
  const { t } = useTranslation('cluster');
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated } = useAuth();
  const canWrite = useCanWrite();
  const [activeTab, setActiveTab] = useState('forum');

  const { data, loading, error, refetch } = useQuery<ClusterQueryData>(CLUSTER_QUERY, {
    variables: { id },
    skip: !id,
  });

  usePageTitle(data?.cluster?.title || 'Cluster');

  if (loading) {
    return <Loading text={t('loading')} />;
  }

  if (error) {
    return (
      <ErrorMessage title={t('error.load')}>
        {error.message}
      </ErrorMessage>
    );
  }

  if (!data?.cluster) {
    return (
      <ErrorMessage title={t('error.notFound')}>
        {t('error.notFoundDescription')}
      </ErrorMessage>
    );
  }

  const cluster = data.cluster;
  const isMember = cluster.isMember || false;

  const tabs: Tab[] = [
    { id: 'forum', label: t('tabs.forum'), count: cluster.topicCount },
    { id: 'polls', label: t('tabs.polls'), count: cluster.pollCount },
    { id: 'events', label: t('tabs.events'), count: cluster.eventCount },
    { id: 'members', label: t('tabs.members'), count: cluster.memberCount },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Cluster Header */}
      <ClusterHeader cluster={cluster}>
        {/* Only show cluster actions for Users (not Observers) */}
        {canWrite && (
          <ClusterActions
            cluster={cluster}
            isAuthenticated={isAuthenticated}
            onRefetch={refetch}
          />
        )}
      </ClusterHeader>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-4">
        {/* Left Column - Tabs */}
        <div className="flex flex-col gap-4 order-2 xl:order-1 min-w-0">
          <Card className="overflow-hidden">
            <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

            {/* Forum Tab */}
            <TabPanel tabId="forum" activeTab={activeTab}>
              {/* Only show TopicForm for Users (not Observers) */}
              {canWrite && isMember && (
                <div className="p-4 border-b">
                  <TopicForm clusterId={cluster.id} />
                </div>
              )}
              <TopicList clusterId={cluster.id} />
            </TabPanel>

            {/* Polls Tab */}
            <TabPanel tabId="polls" activeTab={activeTab}>
              {/* Only show PollForm for Users (not Observers) */}
              {canWrite && isMember && (
                <div className="p-4 border-b">
                  <PollForm clusterId={cluster.id} />
                </div>
              )}
              <PollList clusterId={cluster.id} isMember={canWrite && isMember} />
            </TabPanel>

            {/* Events Tab */}
            <TabPanel tabId="events" activeTab={activeTab}>
              {/* Only show EventForm for Users (not Observers) */}
              {canWrite && isMember && (
                <div className="p-4 border-b">
                  <EventForm clusterId={cluster.id} />
                </div>
              )}
              <EventList clusterId={cluster.id} isMember={canWrite && isMember} />
            </TabPanel>

            {/* Members Tab */}
            <TabPanel tabId="members" activeTab={activeTab}>
              <MemberList clusterId={cluster.id} creatorId={cluster.creator.id} />
            </TabPanel>
          </Card>
        </div>

        {/* Right Column - Info */}
        <div className="flex flex-col gap-4 order-1 xl:order-2">
          <ClusterInfo cluster={cluster} />
        </div>
      </div>
    </div>
  );
}
