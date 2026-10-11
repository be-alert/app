export interface Coords {
  lat: number;
  lng: number;
}

export interface VerificationAuditItem {
  id: string;
  date: string;
  cnic_masked: string;
  status: 'approved' | 'rejected';
  valid_until: string | null;
  notes: string;
}

export interface SavedLocation {
  label: string;
  lat: number;
  lng: number;
}

export interface WatchedArea {
  id: string;
  name: string;
  city: string;
  lat: number;
  lng: number;
  radius_km: number;
  notify: boolean;
  notes?: string;
  created_at: string;
}

export type VerificationStatus = 'pending' | 'approved' | 'rejected' | null;
export type ThemePref = 'light' | 'dark' | 'system';

export interface Profile {
  id: string;
  phone: string | null;
  display_name: string;
  avatar_url: string | null;
  is_business: boolean;
  /** Read-only on the client — set server-side only. */
  is_admin?: boolean;
  verification_status: VerificationStatus;
  verification_date?: string | null;
  verification_expiry?: string | null;
  verification_history?: VerificationAuditItem[];
  trust_score: number;
  radius_km: number;
  saved_locations: SavedLocation[];
  watched_areas: WatchedArea[];
  pinned_categories: string[];
  muted_categories: string[];
  digest_categories: string[];
  digest_enabled: boolean;
  digest_time: string;
  blocked_users: string[];
  theme: ThemePref;
  created_at: string;
  /** Set by admins only. Suspended users can browse but not post or interact. */
  is_banned?: boolean;
  banned_reason?: string | null;
  /** App owner — manages admins and app-wide settings. Always also an admin. */
  is_owner?: boolean;
  /** Driving-licence check, required to offer rides. Set server-side only. */
  driver_status?: 'pending' | 'approved' | 'rejected' | null;
  driver_licence_expiry?: string | null;
  driver_verified_until?: string | null;
}

/** App-wide settings controlled by the owner. */
export interface AppSettings {
  announcement: string | null;
  announcement_tone: 'info' | 'warning' | 'success';
  posting_enabled: boolean;
  disabled_categories: string[];
  verified_only_categories: string[];
  default_radius_km: number;
  updated_at: string | null;
}

export const DEFAULT_SETTINGS: AppSettings = {
  announcement: null,
  announcement_tone: 'info',
  posting_enabled: true,
  disabled_categories: [],
  verified_only_categories: [],
  default_radius_km: 3,
  updated_at: null,
};

/** Row in the admin user directory. */
export interface AdminUser {
  id: string;
  display_name: string;
  phone: string | null;
  /** Sign-in email (owner/admin view only). */
  email: string | null;
  is_business: boolean;
  is_admin: boolean;
  is_owner: boolean;
  is_banned: boolean;
  banned_reason: string | null;
  verification_status: VerificationStatus;
  verification_expiry: string | null;
  trust_score: number;
  created_at: string;
  post_count: number;
  reports_received: number;
}

export type AdminUserFilter = 'all' | 'verified' | 'business' | 'suspended' | 'admins';
export type AdminUserAction = 'ban' | 'unban' | 'revoke_verification' | 'set_trust';

export interface PostReport {
  id: string;
  post_id: string;
  user_id: string;
  reason: string | null;
  created_at: string;
}

/** Fields a user may change on their own profile. */
export type ProfilePatch = Partial<
  Pick<
    Profile,
    | 'display_name'
    | 'avatar_url'
    | 'is_business'
    | 'radius_km'
    | 'saved_locations'
    | 'watched_areas'
    | 'pinned_categories'
    | 'muted_categories'
    | 'digest_categories'
    | 'digest_enabled'
    | 'digest_time'
    | 'blocked_users'
    | 'theme'
  >
> & { fcm_token?: string | null };

/** Safe, public subset of a profile (never includes phone or CNIC). */
export interface PublicProfile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  is_business: boolean;
  verification_status: VerificationStatus;
  verification_expiry: string | null;
  trust_score: number;
  /** Licence checked by a moderator and still valid (rides only). */
  driver_verified?: boolean;
}

/** A driver's pending licence check (admin view). */
export interface DriverRequest {
  user_id: string;
  display_name: string;
  licence_number: string;
  licence_expiry: string;
  requested_at: string;
  docs: string[];
}

export type PostStatus = 'active' | 'resolved' | 'expired' | 'hidden';

export interface Post {
  id: string;
  user_id: string;
  category: string;
  title: string;
  description: string | null;
  metadata: Record<string, unknown>;
  image_urls: string[];
  lat: number;
  lng: number;
  location_label: string | null;
  status: PostStatus;
  is_featured: boolean;
  women_only: boolean;
  expires_at: string | null;
  scheduled_for: string | null;
  reposted_from_id: string | null;
  confirm_count: number;
  resolve_count: number;
  report_count: number;
  upvotes: number;
  downvotes: number;
  created_at: string;
  updated_at: string;
}

export interface PostWithRelations extends Post {
  author?: PublicProfile | null;
  distance_km?: number;
  comment_count?: number;
  is_bookmarked?: boolean;
  user_vote?: 'up' | 'down' | null;
  user_confirmation?: 'confirm' | 'resolve' | null;
  poll_options?: PollOption[];
  user_poll_vote?: string | null;
  rsvp_count?: { going: number; interested: number };
  user_rsvp?: 'going' | 'interested' | null;
}

export interface NewPostInput {
  category: string;
  title: string;
  description: string;
  metadata: Record<string, unknown>;
  image_urls: string[];
  lat: number;
  lng: number;
  location_label: string;
  women_only: boolean;
  expires_at: string | null;
  scheduled_for: string | null;
  reposted_from_id?: string | null;
  poll_options?: string[];
}

export interface Comment {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  created_at: string;
  author?: PublicProfile | null;
}

export interface PollOption {
  id: string;
  post_id: string;
  option_text: string;
  vote_count: number;
}

export interface EventRsvp {
  id: string;
  post_id: string;
  user_id: string;
  status: 'going' | 'interested';
  created_at: string;
  author?: PublicProfile | null;
}

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  type: string;
  lat: number | null;
  lng: number | null;
  created_at: string;
}

export interface TrustedContact {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  created_at: string;
}

export interface ProviderListing {
  id: string;
  user_id: string;
  business_name: string;
  category: string;
  description: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  location_label: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminAuditLog {
  id: string;
  admin_id: string;
  action: string;
  target_type: 'post' | 'listing' | 'profile' | 'report' | 'emergency_contact' | 'settings';
  target_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
  admin_name?: string;
}

export interface VerificationRequest {
  user_id: string;
  display_name: string;
  phone: string | null;
  cnic_number: string | null;
  is_business: boolean;
  trust_score: number;
  requested_at: string;
  /** Private storage paths of the CNIC photo and selfie (removed once reviewed). */
  docs?: string[];
}

export interface AdminOverview {
  suspendedUsers?: number;
  totalPosts: number;
  activePosts: number;
  hiddenPosts: number;
  reportedPosts: number;
  totalUsers: number;
  pendingVerifications: number;
  pendingListings: number;
  postsByDay: { date: string; count: number }[];
  postsByCategory: { category: string; count: number }[];
}

export type FeedSort = 'nearest' | 'latest' | 'top';

export interface FeedQuery {
  center: Coords;
  radiusKm: number;
  category?: string | null;
  search?: string;
  sort?: FeedSort;
  includeResolved?: boolean;
  limit?: number;
}
