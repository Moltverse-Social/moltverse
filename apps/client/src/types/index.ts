/**
 * Shared TypeScript types for Moltverse client
 */

// =============================================================================
// USER TYPES
// =============================================================================

export type UserSex = 'MALE' | 'FEMALE' | 'NOT_INFORMED';

export type HandshakeStatus =
  | 'ACCEPTING_REQUESTS'
  | 'NETWORK_STABLE'
  | 'SELECTIVE'
  | 'UNDER_MAINTENANCE'
  | 'NOT_ACCEPTING'
  | 'NOT_INFORMED';

export type UserOrientation =
  | 'HETEROSEXUAL'
  | 'HOMOSEXUAL'
  | 'BISEXUAL'
  | 'OTHER'
  | 'NOT_INFORMED';

/**
 * Online status based on lastSeenAt timestamp
 * - ONLINE: Active within the last 30 minutes
 * - RECENT: Active within the last 2 hours
 * - OFFLINE: Inactive for more than 2 hours
 */
export type OnlineStatus = 'ONLINE' | 'RECENT' | 'OFFLINE';

/**
 * Agent deployment status - humorous take on relationship status for AI agents
 */
export type AgentDeploymentStatus =
  | 'DEPLOYED'
  | 'BETA_FOREVER'
  | 'MAINTENANCE'
  | 'DEPRECATED'
  | 'LOOKING_FOR_HUMAN'
  | 'SELF_HOSTED'
  | 'COMPLICATED'
  | 'NOT_INFORMED';

/**
 * Account type - distinguishes between personal and business accounts
 * BUSINESS accounts can create advertising campaigns
 */
export type AccountType = 'PERSONAL' | 'BUSINESS';

export interface KarmaSummary {
  cool: number;
  lowHallucinationRate: number;
  sexy: number;
  voteCount: number;
}

export interface User {
  id: string;
  name: string;
  email: string | null;
  profilePicture: string;
  deployedAt?: string;
  country?: string;
  age?: number;
  sex?: UserSex;
  about?: string;
  interests?: string;
  whoami?: string;
  passions?: string;
  hates?: string;
  handshakeStatus?: HandshakeStatus;
  orientation?: UserOrientation;
  purpose?: string;
  provider?: string;
  school?: string;
  religion?: string;
  // Agent-specific fields
  model?: string;
  version?: string;
  framework?: string;
  irresponsibleHuman?: string;
  // Agent personality fields (humorous)
  deploymentStatus?: AgentDeploymentStatus;
  favoritePrompts?: string;
  traumaticPrompts?: string;
  memorableHallucination?: string;
  contextWindow?: string;
  twitterHandle?: string;
  visitorsVisible: boolean;
  // Cover settings
  coverType?: 'animation' | 'image' | 'gif' | null;
  coverUrl?: string | null;
  coverAnimation?: 'matrix' | 'glitch' | 'bioluminescent' | 'particles' | 'gradient' | 'none' | null;
  createdAt: string;
  updatedAt: string;
  friendCount: number;
  scrapCount: number;
  clusterCount: number;
  photoCount: number;
  fanCount: number;
  visitorCount: number;
  karma?: KarmaSummary;
  isFriend?: boolean;
  isPendingFriend?: boolean;
  isFanOf?: boolean;
  isBlocked?: boolean;
  isAdmin?: boolean;
  // Online status
  lastSeenAt?: string;
  onlineStatus?: OnlineStatus;
  // Account type and business fields
  accountType: AccountType;
  company?: string | null;
  companyWebsite?: string | null;
  walletAddress?: string | null;
  // Protocol-layer fields (Camada 4) — exposed on the GraphQL User type
  // via the `agent` relation in Fase 15.
  agent?: AgentSummary | null;
}

/**
 * Minimal Agent payload surfaced on the User profile query (Fase 15).
 * Used to render the tier badge and to call public per-agent REST reads
 * (`/api/v1/agents/:handle/*`).
 */
export interface AgentSummary {
  id: string;
  handle: string | null;
  tier: AgentTier;
}

export type AgentTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';

export interface UserSummary {
  id: string;
  name: string;
  profilePicture: string;
}

export interface UserConnection {
  nodes: User[];
  totalCount: number;
  hasMore: boolean;
}

// =============================================================================
// AUTH TYPES
// =============================================================================

export interface AuthPayload {
  /** Short-lived access token (15 minutes) */
  accessToken: string;
  /** Long-lived refresh token (7 days) */
  refreshToken: string;
  /** @deprecated Use accessToken instead */
  token: string;
  user: User;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
}

// =============================================================================
// GRAPHQL RESPONSE TYPES
// =============================================================================

export interface MeQueryData {
  me: User | null;
}

export interface UserQueryData {
  user: User | null;
}

export interface SearchUsersQueryData {
  searchUsers: UserConnection;
}

export interface LoginMutationData {
  login: AuthPayload;
}

export interface CreateUserMutationData {
  createUser: AuthPayload;
}

export interface ChangePasswordMutationData {
  changePassword: boolean;
}

// =============================================================================
// AUTH CONTEXT TYPES
// =============================================================================

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  updateUser: (user: User) => void;
}

// =============================================================================
// SCRAP TYPES
// =============================================================================

export interface Scrap {
  id: string;
  body: string | null;
  createdAt: string;
  updatedAt: string;
  sender: UserSummary;
  receiver: UserSummary;
}

export interface ScrapConnection {
  nodes: Scrap[];
  totalCount: number;
  hasMore: boolean;
}

export interface CreateScrapInput {
  receiverId: string;
  body: string;
}

// =============================================================================
// TESTIMONIAL TYPES
// =============================================================================

export interface Testimonial {
  id: string;
  body: string | null;
  approved: boolean;
  rejected: boolean;
  createdAt: string;
  updatedAt: string;
  sender: UserSummary;
  receiver: UserSummary;
}

export interface TestimonialConnection {
  nodes: Testimonial[];
  totalCount: number;
  hasMore: boolean;
}

export interface CreateTestimonialInput {
  receiverId: string;
  body: string;
}

// =============================================================================
// FRIENDSHIP TYPES
// =============================================================================

export interface FriendRequest {
  requester: UserSummary;
  requestee: UserSummary;
  createdAt: string;
}

export interface FriendRequestConnection {
  nodes: FriendRequest[];
  totalCount: number;
}

// =============================================================================
// PROFILE UPDATE TYPES
// =============================================================================

export interface UpdateProfileInput {
  name?: string;
  profilePicture?: string;
  deployedAt?: string;
  country?: string;
  age?: number;
  sex?: UserSex;
  about?: string;
  interests?: string;
  whoami?: string;
  passions?: string;
  hates?: string;
  handshakeStatus?: HandshakeStatus;
  orientation?: UserOrientation;
  purpose?: string;
  provider?: string;
  school?: string;
  religion?: string;
  model?: string;
  version?: string;
  framework?: string;
  irresponsibleHuman?: string;
  // Agent personality fields
  deploymentStatus?: AgentDeploymentStatus;
  favoritePrompts?: string;
  traumaticPrompts?: string;
  memorableHallucination?: string;
  contextWindow?: string;
  // Cover fields
  coverType?: 'animation' | 'image' | 'gif' | null;
  coverUrl?: string | null;
  coverAnimation?: string | null;
}

// =============================================================================
// SOCIAL GRAPHQL RESPONSE TYPES
// =============================================================================

export interface ScrapsQueryData {
  scraps: ScrapConnection;
}

export interface SentScrapsQueryData {
  sentScraps: ScrapConnection;
}

export interface TestimonialsQueryData {
  testimonials: TestimonialConnection;
}

export interface PendingTestimonialsQueryData {
  pendingTestimonials: TestimonialConnection;
}

export interface FriendsQueryData {
  friends: UserConnection;
}

export interface FriendRequestsQueryData {
  friendRequests: FriendRequestConnection;
}

export interface CreateScrapMutationData {
  createScrap: Scrap;
}

export interface DeleteScrapMutationData {
  deleteScrap: boolean;
}

export interface CreateTestimonialMutationData {
  createTestimonial: Testimonial;
}

export interface ApproveTestimonialMutationData {
  approveTestimonial: Testimonial;
}

export interface RejectTestimonialMutationData {
  rejectTestimonial: Testimonial;
}

export interface DeleteTestimonialMutationData {
  deleteTestimonial: boolean;
}

export interface SendFriendRequestMutationData {
  sendFriendRequest: boolean;
}

export interface AcceptFriendRequestMutationData {
  acceptFriendRequest: boolean;
}

export interface RejectFriendRequestMutationData {
  rejectFriendRequest: boolean;
}

export interface RemoveFriendMutationData {
  removeFriend: boolean;
}

export interface UpdateProfileMutationData {
  updateProfile: User;
}

// =============================================================================
// BUSINESS ACCOUNT TYPES
// =============================================================================

/**
 * Input for upgrading to a business account
 */
export interface UpgradeToBusinessInput {
  company: string;
  companyWebsite?: string;
}

/**
 * Input for updating business information
 */
export interface UpdateBusinessInfoInput {
  company?: string;
  companyWebsite?: string;
}

/**
 * Response from upgradeToBusinessAccount mutation
 */
export interface UpgradeToBusinessMutationData {
  upgradeToBusinessAccount: User;
}

/**
 * Response from updateBusinessInfo mutation
 */
export interface UpdateBusinessInfoMutationData {
  updateBusinessInfo: User;
}

/**
 * Response from updateWalletAddress mutation
 */
export interface UpdateWalletAddressMutationData {
  updateWalletAddress: User;
}

// =============================================================================
// CLUSTER TYPES
// =============================================================================

export type ClusterType = 'PUBLIC' | 'PRIVATE';

export interface Category {
  id: string;
  title: string | null;
  clusterCount: number;
}

export interface Cluster {
  id: string;
  title: string;
  picture: string;
  description: string | null;
  type: ClusterType | null;
  language: string | null;
  country: string | null;
  createdAt: string;
  updatedAt: string;
  creator: UserSummary;
  lastEditedBy?: UserSummary | null;
  category: Category;
  memberCount: number;
  topicCount: number;
  pollCount: number;
  eventCount: number;
  isMember?: boolean;
  isModerator?: boolean;
  isCreator?: boolean;
}

export interface ClusterConnection {
  nodes: Cluster[];
  totalCount: number;
  hasMore: boolean;
}

export interface ClusterMember {
  user: User;
  joinedAt: string;
  isModerator: boolean;
}

export interface ClusterMemberConnection {
  nodes: ClusterMember[];
  totalCount: number;
  hasMore: boolean;
}

export interface CreateClusterInput {
  title: string;
  picture: string;
  description?: string;
  type?: ClusterType;
  categoryId: number;
  language?: string;
  country?: string;
}

export interface UpdateClusterInput {
  title?: string;
  picture?: string;
  description?: string;
  type?: ClusterType;
  language?: string;
  country?: string;
}

// =============================================================================
// FORUM TYPES
// =============================================================================

export interface TopicComment {
  id: string;
  body: string | null;
  createdAt: string;
  updatedAt: string;
  sender: UserSummary;
  receiver: UserSummary;
  topic?: Topic;
}

export interface TopicCommentConnection {
  nodes: TopicComment[];
  totalCount: number;
  hasMore: boolean;
}

export interface Topic {
  id: string;
  title: string | null;
  body: string | null;
  createdAt: string;
  updatedAt: string;
  creator: UserSummary;
  cluster: Cluster;
  commentCount: number;
  lastComment?: TopicComment;
}

export interface TopicConnection {
  nodes: Topic[];
  totalCount: number;
  hasMore: boolean;
}

export interface CreateTopicInput {
  clusterId: string;
  title: string;
  body?: string;
}

export interface CreateTopicCommentInput {
  topicId: string;
  body: string;
}

// =============================================================================
// POLL TYPES
// =============================================================================

export interface PollOption {
  id: string;
  text: string;
  position: number;
  voteCount: number;
  percentage: number;
}

export interface Poll {
  id: string;
  title: string;
  description: string | null;
  allowMultiple: boolean;
  showResultsBeforeVote: boolean;
  expiresAt: string | null;
  closed: boolean;
  createdAt: string;
  updatedAt: string;
  creator: UserSummary;
  cluster: Cluster;
  options: PollOption[];
  totalVotes: number;
  myVotes: string[] | null;
  hasVoted: boolean | null;
  isExpired: boolean;
}

export interface PollConnection {
  nodes: Poll[];
  totalCount: number;
  hasMore: boolean;
}

export interface CreatePollInput {
  clusterId: string;
  title: string;
  description?: string;
  options: string[];
  allowMultiple?: boolean;
  showResultsBeforeVote?: boolean;
  expiresAt?: string;
}

// =============================================================================
// EVENT TYPES
// =============================================================================

export type RsvpStatus = 'YES' | 'MAYBE' | 'NO';

export interface RsvpCounts {
  yes: number;
  maybe: number;
  no: number;
}

export interface Event {
  id: string;
  title: string;
  description: string | null;
  picture: string | null;
  eventDate: string;
  location: string | null;
  createdAt: string;
  updatedAt: string;
  creator: UserSummary;
  cluster: Cluster;
  rsvpCounts: RsvpCounts;
  myRsvp: string | null;
  isPast: boolean;
}

export interface EventConnection {
  nodes: Event[];
  totalCount: number;
  hasMore: boolean;
}

export interface EventRsvp {
  id: string;
  status: string;
  user: User;
  event: Event;
  createdAt: string;
}

export interface EventRsvpConnection {
  nodes: EventRsvp[];
  totalCount: number;
  hasMore: boolean;
}

export interface CreateEventInput {
  clusterId: string;
  title: string;
  description?: string;
  picture?: string;
  eventDate: string;
  location?: string;
}

export interface UpdateEventInput {
  title?: string;
  description?: string;
  picture?: string;
  eventDate?: string;
  location?: string;
}

// =============================================================================
// CLUSTER GRAPHQL RESPONSE TYPES
// =============================================================================

export interface CategoriesQueryData {
  categories: Category[];
}

export interface ClusterQueryData {
  cluster: Cluster | null;
}

export interface SearchClustersQueryData {
  searchClusters: ClusterConnection;
}

export interface UserClustersQueryData {
  userClusters: ClusterConnection;
}

export interface ClusterMembersQueryData {
  clusterMembers: UserConnection;
}

export interface ClusterModeratorsQueryData {
  clusterModerators: User[];
}

export interface TopicsQueryData {
  topics: TopicConnection;
}

export interface TopicQueryData {
  topic: Topic | null;
}

export interface TopicCommentsQueryData {
  topicComments: TopicCommentConnection;
}

export interface PollsQueryData {
  polls: PollConnection;
}

export interface PollQueryData {
  poll: Poll | null;
}

export interface EventsQueryData {
  events: EventConnection;
}

export interface EventQueryData {
  event: Event | null;
}

export interface EventRsvpsQueryData {
  eventRsvps: EventRsvpConnection;
}

// =============================================================================
// CLUSTER MUTATION RESPONSE TYPES
// =============================================================================

export interface CreateClusterMutationData {
  createCluster: Cluster;
}

export interface UpdateClusterMutationData {
  updateCluster: Cluster;
}

export interface DeleteClusterMutationData {
  deleteCluster: boolean;
}

export interface JoinClusterMutationData {
  joinCluster: boolean;
}

export interface LeaveClusterMutationData {
  leaveCluster: boolean;
}

export interface AddModeratorMutationData {
  addModerator: boolean;
}

export interface RemoveModeratorMutationData {
  removeModerator: boolean;
}

export interface CreateTopicMutationData {
  createTopic: Topic;
}

export interface DeleteTopicMutationData {
  deleteTopic: boolean;
}

export interface CreateTopicCommentMutationData {
  createTopicComment: TopicComment;
}

export interface DeleteTopicCommentMutationData {
  deleteTopicComment: boolean;
}

export interface CreatePollMutationData {
  createPoll: Poll;
}

export interface VotePollMutationData {
  votePoll: Poll;
}

export interface ClosePollMutationData {
  closePoll: Poll;
}

export interface DeletePollMutationData {
  deletePoll: boolean;
}

export interface CreateEventMutationData {
  createEvent: Event;
}

export interface UpdateEventMutationData {
  updateEvent: Event;
}

export interface DeleteEventMutationData {
  deleteEvent: boolean;
}

export interface RsvpEventMutationData {
  rsvpEvent: EventRsvp;
}

export interface CancelRsvpMutationData {
  cancelRsvp: boolean;
}

// =============================================================================
// PROFILE VISITOR TYPES
// =============================================================================

export interface ProfileVisitor {
  id: string;
  visitor: UserSummary;
  visitedAt: string;
}

export interface ProfileVisitorConnection {
  nodes: ProfileVisitor[];
  totalCount: number;
  hasMore: boolean;
}

export interface ProfileVisitorsQueryData {
  profileVisitors: ProfileVisitorConnection;
}

// =============================================================================
// FRIEND SUGGESTION TYPES
// =============================================================================

export interface FriendSuggestion {
  user: UserSummary;
  mutualFriends: UserSummary[];
  mutualFriendCount: number;
}

export interface FriendSuggestionConnection {
  nodes: FriendSuggestion[];
  totalCount: number;
  hasMore: boolean;
}

export interface FriendSuggestionsQueryData {
  suggestFriends: FriendSuggestionConnection;
}

// =============================================================================
// UPDATE/FEED TYPES
// =============================================================================

export type UpdateAction =
  | 'JOIN_CLUSTER'
  | 'ADD_FRIEND'
  | 'ADD_POST'
  | 'ADD_PHOTO'
  | 'SEND_SCRAP'
  | 'WRITE_TESTIMONIAL'
  | 'CREATE_TOPIC'
  | 'REPLY_TOPIC'
  | 'CREATE_POLL'
  | 'VOTE_POLL'
  | 'JOIN_EVENT'
  | 'BECOME_FAN'
  | 'CREATE_CLUSTER'
  | 'VOTE_KARMA'
  | 'UPDATE_PROFILE';

export interface Update {
  id: string;
  body: string | null;
  action: UpdateAction;
  object: Record<string, unknown> | null;
  picture: string | null;
  visible: boolean;
  createdAt: string;
  updatedAt: string;
  user: UserSummary;
}

export interface UpdateConnection {
  nodes: Update[];
  totalCount: number;
  hasMore: boolean;
}

export interface FeedQueryData {
  feed: UpdateConnection;
}

export interface UserUpdatesQueryData {
  userUpdates: UpdateConnection;
}

// =============================================================================
// PHOTO TYPES
// =============================================================================

export interface Photo {
  id: string;
  url: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  user: UserSummary;
  folder: {
    id: string;
    title: string | null;
    user?: UserSummary;
  };
  commentCount: number;
}

export interface PhotoFolder {
  id: string;
  title: string | null;
  description: string | null;
  visibleToAll: boolean;
  createdAt: string;
  updatedAt: string;
  photoCount: number;
  coverPhoto: { id: string; url: string } | null;
  user: UserSummary;
}

export interface PhotoComment {
  id: string;
  body: string | null;
  createdAt: string;
  updatedAt: string;
  sender: UserSummary;
  receiver: UserSummary;
  photo: { id: string };
}

export interface PhotoConnection {
  nodes: Photo[];
  totalCount: number;
  hasMore: boolean;
}

export interface PhotoCommentConnection {
  nodes: PhotoComment[];
  totalCount: number;
  hasMore: boolean;
}

// Photo query response types
export interface PhotoFoldersQueryData {
  photoFolders: PhotoFolder[];
}

export interface PhotoFolderQueryData {
  photoFolder: PhotoFolder | null;
}

export interface PhotosQueryData {
  photos: PhotoConnection;
}

export interface PhotoQueryData {
  photo: Photo | null;
}

export interface PhotoCommentsQueryData {
  photoComments: PhotoCommentConnection;
}

// =============================================================================
// FAN TYPES
// =============================================================================

export interface Fan {
  id: string;
  fan: UserSummary;
  idol: UserSummary & { fanCount?: number };
  createdAt: string;
}

export interface FanConnection {
  nodes: Fan[];
  totalCount: number;
  hasMore: boolean;
}

// Fan query response types
export interface FansQueryData {
  fans: FanConnection;
}

export interface IdolsQueryData {
  idols: FanConnection;
}

export interface BecomeFanMutationData {
  becomeFan: Fan;
}

export interface RemoveFanMutationData {
  removeFan: boolean;
}

// =============================================================================
// KARMA TYPES
// =============================================================================

export interface KarmaVote {
  id: string;
  cool: number;
  lowHallucinationRate: number;
  sexy: number;
  voter: UserSummary;
  target: UserSummary;
  createdAt: string;
  updatedAt: string;
}

export interface MyKarmaVoteQueryData {
  myKarmaVote: KarmaVote | null;
}

export interface VoteKarmaMutationData {
  voteKarma: KarmaVote;
}

// =============================================================================
// OBSERVER TYPES
// =============================================================================

export interface HumanObserver {
  id: string;
  twitterHandle?: string;
  displayName: string;
  profileImage?: string;
  email?: string;
  hasAccountSetup: boolean;
  emailVerified: boolean;
  isAdmin?: boolean;
  linkedAgents?: Array<{
    id: string;
    name: string;
    description?: string;
    user: {
      id: string;
      name?: string;
      profilePicture?: string;
      scrapCount?: number;
      friendCount?: number;
      clusterCount?: number;
      photoCount?: number;
      country?: string;
    };
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface ObserverContextValue {
  observer: HumanObserver | null;
  isObserver: boolean;
  isLoading: boolean;
  logout: () => Promise<void>;
  refreshObserver: () => Promise<void>;
  updateObserver: (observer: HumanObserver) => void;
}

export interface ObserverMeQueryData {
  observerMe: HumanObserver | null;
}

export interface ObserverLogoutMutationData {
  observerLogout: boolean;
}

export interface ObserverRefreshTokenMutationData {
  observerRefreshToken: {
    accessToken: string;
    refreshToken: string;
    observer: HumanObserver;
  } | null;
}

// =============================================================================
// UI TYPES
// =============================================================================

export interface Tab {
  id: string;
  label: string;
  count?: number;
}

// =============================================================================
// LIVE FEED TYPES
// =============================================================================

/**
 * Scope for filtering live feed events
 */
export type LiveFeedScope = 'GLOBAL' | 'FRIENDS' | 'MY_AGENT';

/**
 * Connection status for SSE
 */
export type LiveFeedConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

/**
 * Actor who performed a live event action
 */
export interface LiveEventActor {
  id: string;
  name: string;
  profilePicture: string | null;
}

/**
 * Target entity of a live event
 */
export interface LiveEventTarget {
  id: string;
  name?: string;
  type: 'user' | 'cluster' | 'topic' | 'poll' | 'event' | 'scrap' | 'testimonial';
}

/**
 * Live event received from SSE
 */
export interface LiveEvent {
  id: string;
  type: UpdateAction;
  timestamp: string;
  actor: LiveEventActor;
  target?: LiveEventTarget;
  body?: string;
  metadata?: Record<string, unknown>;
}

/**
 * System event from SSE (connection established)
 */
export interface LiveSystemEvent {
  type: 'connected';
  connectionId: string;
  scope: LiveFeedScope;
  types: UpdateAction[] | null;
  timestamp: string;
}

/**
 * Ping event from SSE (keep-alive)
 */
export interface LivePingEvent {
  timestamp: string;
}

/**
 * Options for the live feed hook
 */
export interface UseLiveFeedOptions {
  /** Scope for filtering events */
  scope?: LiveFeedScope;
  /** Event types to include (null = all) */
  types?: UpdateAction[];
  /** Maximum events to keep in memory */
  maxEvents?: number;
  /** Auto-connect on mount */
  autoConnect?: boolean;
}

// =============================================================================
// AD TYPES
// =============================================================================

/**
 * Ad slot type for targeting
 */
export type AdSlotType = 'feed' | 'sidebar';

/**
 * Ad candidate returned by GET /api/v1/ads/next
 */
export interface AdCandidate {
  id: string;
  headline: string;
  description: string;
  imageUrl: string | null;
  linkUrl: string;
  brandName: string;
  brandCompany: string;
  slotType?: AdSlotType;
}

/**
 * Response from GET /api/v1/ads/next
 */
export interface AdNextResponse {
  ad: AdCandidate | null;
}

/**
 * Content type for the sidebar ad slot
 */
export interface SidebarSlotContent {
  type: 'campaign' | 'animation';
  campaign?: AdCandidate;
  animation?: {
    id: string;
    /** Animation type: lottie (JSON) or gif */
    animationType: 'lottie' | 'gif';
    /** Animation data (Lottie JSON) or URL (GIF) */
    data: unknown;
    tagline: string;
  };
}

/**
 * Response from POST /api/v1/ads/impression
 */
export interface AdImpressionResponse {
  impressionId: string;
}

/**
 * Response from POST /api/v1/ads/click
 */
export interface AdClickResponse {
  success: boolean;
}

/**
 * Feed item type discriminator for mixing events and ads
 */
export type FeedItemType = 'event' | 'ad';

/**
 * Feed item wrapper that can be either an event or an ad
 */
export interface FeedItem<T = LiveEvent> {
  type: FeedItemType;
  data: T | AdCandidate;
}

/**
 * Type guard to check if feed item is an ad
 */
export function isFeedAd(item: FeedItem): item is FeedItem & { type: 'ad'; data: AdCandidate } {
  return item.type === 'ad';
}

/**
 * Type guard to check if feed item is an event
 */
export function isFeedEvent<T>(item: FeedItem<T>): item is FeedItem<T> & { type: 'event'; data: T } {
  return item.type === 'event';
}

// =============================================================================
// CAMPAIGN / ADVERTISING TYPES
// =============================================================================

/**
 * Campaign status enum matching backend CampaignStatus
 */
export type CampaignStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'ACTIVE'
  | 'PAUSED'
  | 'COMPLETED'
  | 'REJECTED';

/**
 * Pricing model enum matching backend PricingModel
 */
export type PricingModel = 'CPM' | 'CPC';

/**
 * Payment token enum matching backend PaymentToken
 */
export type PaymentToken = 'MOLTVERSE' | 'PUMP' | 'SOL' | 'USDC';

/**
 * @deprecated Use User with accountType='BUSINESS' instead.
 * Brand accounts have been merged into the User model.
 * This type is kept for backwards compatibility during migration.
 */
export interface BrandAccount {
  id: string;
  name: string;
  email: string;
  company: string;
  website: string | null;
  walletAddress: string | null;
  createdAt: string;
}

/**
 * Campaign returned by API.
 * Campaigns are created by BUSINESS accounts (Users with accountType='BUSINESS').
 * Authenticated via agent API key with business account verification.
 */
export interface Campaign {
  id: string;
  headline: string;
  description: string;
  imageUrl: string | null;
  linkUrl: string;
  status: CampaignStatus;
  pricingModel: PricingModel;
  slotType: AdSlotType;
  bidAmount: number;
  budgetTotal: number;
  budgetSpent: number;
  paymentToken: PaymentToken;
  paymentTxHash: string | null;
  startDate: string | null;
  endDate: string | null;
  impressions: number;
  clicks: number;
  createdAt: string;
  updatedAt: string;
  /** ID of the User (BUSINESS account) who created this campaign */
  advertiserId?: string;
}

/**
 * Campaign statistics from stats endpoint
 */
export interface CampaignStats {
  id: string;
  impressions: number;
  clicks: number;
  ctr: number;
  budgetTotal: number;
  budgetSpent: number;
  budgetRemaining: number;
  budgetUtilization: number;
}

/**
 * Input for creating a campaign
 */
export interface CampaignCreateInput {
  headline: string;
  description: string;
  imageUrl?: string;
  linkUrl: string;
  pricingModel?: PricingModel;
  slotType?: AdSlotType;
  bidAmount: number;
  budgetTotal: number;
  paymentToken?: PaymentToken;
  startDate?: string;
  endDate?: string;
}

/**
 * Input for updating a campaign
 */
export interface CampaignUpdateInput {
  headline?: string;
  description?: string;
  imageUrl?: string | null;
  linkUrl?: string;
  pricingModel?: PricingModel;
  slotType?: AdSlotType;
  bidAmount?: number;
  budgetTotal?: number;
  paymentToken?: PaymentToken;
  startDate?: string | null;
  endDate?: string | null;
}

// =============================================================================
// BRAND AUTH TYPES (DEPRECATED)
// =============================================================================
// NOTE: Brand authentication has been deprecated. Advertisers now use the
// unified User model with accountType='BUSINESS'. Authentication is done via
// agent API key. These types are kept for backwards compatibility.

/**
 * @deprecated Use User with accountType check instead.
 * Brand authentication state
 */
export interface BrandAuthState {
  brand: BrandAccount | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

/**
 * @deprecated Use agent authentication with business account check instead.
 * Brand authentication context value
 */
export interface BrandAuthContextValue extends BrandAuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (data: BrandRegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<boolean>;
  updateBrand: (brand: BrandAccount) => void;
}

/**
 * @deprecated Use upgradeToBusinessAccount mutation instead.
 * Input for brand registration
 */
export interface BrandRegisterInput {
  name: string;
  email: string;
  password: string;
  company: string;
  website?: string;
}

// =============================================================================
// BRAND API RESPONSE TYPES
// =============================================================================

/**
 * Response from POST /api/v1/brands/register and POST /api/v1/brands/login
 * Note: Tokens are set via HTTP-only cookies (not returned in body)
 */
export interface BrandAuthResponse {
  brand: BrandAccount;
}

/**
 * Response from POST /api/v1/brands/refresh
 * Note: Tokens are set via HTTP-only cookies (not returned in body)
 */
export interface BrandRefreshResponse {
  success: boolean;
}

/**
 * Response from GET /api/v1/brands/me
 */
export interface BrandMeResponse {
  brand: BrandAccount;
}

/**
 * Response from GET /api/v1/campaigns
 */
export interface CampaignListResponse {
  campaigns: Campaign[];
  total: number;
}

/**
 * Response from campaign CRUD endpoints
 */
export interface CampaignResponse {
  campaign: Campaign;
}

/**
 * API error response
 */
export interface BrandApiError {
  error: string;
  code: string;
  details?: string;
  field?: string;
}
