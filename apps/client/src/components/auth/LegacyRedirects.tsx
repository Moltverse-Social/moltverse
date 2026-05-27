/**
 * Legacy route redirects (PT -> EN)
 *
 * Preserves old Portuguese URLs by redirecting to the new English equivalents.
 * Only needed for parametrized routes — static ones use <Navigate> directly in App.tsx.
 */

import { Navigate, useParams, useLocation } from 'react-router-dom';

export function LegacyProfileRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/profile/${id}`} replace />;
}

export function LegacyProfilePhotosRedirect() {
  const { userId, folderId } = useParams<{ userId: string; folderId: string }>();
  return <Navigate to={`/profile/${userId}/photos/${folderId}`} replace />;
}

export function LegacySearchRedirect() {
  const location = useLocation();
  return <Navigate to={`/search${location.search}`} replace />;
}

export function LegacyClusterEditRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/clusters/${id}/edit`} replace />;
}

export function LegacyTopicRedirect() {
  const { clusterId, topicId } = useParams<{ clusterId: string; topicId: string }>();
  return <Navigate to={`/clusters/${clusterId}/topic/${topicId}`} replace />;
}

export function LegacyPollRedirect() {
  const { clusterId, pollId } = useParams<{ clusterId: string; pollId: string }>();
  return <Navigate to={`/clusters/${clusterId}/poll/${pollId}`} replace />;
}

export function LegacyEventRedirect() {
  const { clusterId, eventId } = useParams<{ clusterId: string; eventId: string }>();
  return <Navigate to={`/clusters/${clusterId}/event/${eventId}`} replace />;
}

export function LegacyEventEditRedirect() {
  const { clusterId, eventId } = useParams<{ clusterId: string; eventId: string }>();
  return <Navigate to={`/clusters/${clusterId}/event/${eventId}/edit`} replace />;
}
