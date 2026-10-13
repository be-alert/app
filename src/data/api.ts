/**
 * The contract every backend implements. Screens only ever talk to this
 * interface (via `useApi()`), so switching between demo data and Supabase
 * never touches UI code.
 */
import type {
  AdminAuditLog,
  AdminOverview,
  AdminUser,
  AdminUserAction,
  AdminUserFilter,
  AppSettings,
  PostReport,
  Comment,
  EmergencyContact,
  EventRsvp,
  FeedQuery,
  NewPostInput,
  PostStatus,
  PostWithRelations,
  Profile,
  ProfilePatch,
  ProviderListing,
  TrustedContact,
  VerificationRequest,
  DriverRequest,
} from '@/lib/types';

export type BackendMode = 'demo' | 'live';

export interface SessionUser {
  id: string;
  phone: string | null;
  email: string | null;
  /** Name from the sign-in provider (e.g. the Google account name), used to prefill the profile. */
  name?: string | null;
}

/** Which email a 6-digit code came from: code sign-in, new-account confirmation, or password reset. */
export type EmailCodeKind = 'email' | 'signup' | 'recovery';

export interface VerificationPhotos {
  front: Blob;
  selfie: Blob;
}

export interface AuthApi {
  getSession(): Promise<SessionUser | null>;
  onChange(cb: (user: SessionUser | null) => void): () => void;
  /** Email one-time code (free alternative to SMS). */
  sendEmailOtp(email: string, captchaToken?: string): Promise<{ error: string | null; devCode?: string }>;
  verifyEmailOtp(email: string, code: string, kind?: EmailCodeKind, captchaToken?: string): Promise<{ error: string | null }>;
  /** Creates an email + password account. needsCode = a confirmation code was emailed. */
  signUpWithPassword(email: string, password: string, captchaToken?: string): Promise<{ error: string | null; needsCode: boolean; devCode?: string }>;
  /** unconfirmed = the account exists but its email was never confirmed. */
  signInWithPassword(email: string, password: string, captchaToken?: string): Promise<{ error: string | null; unconfirmed?: boolean }>;
  resendSignupCode(email: string, captchaToken?: string): Promise<{ error: string | null; devCode?: string }>;
  /** Emails a 6-digit password-reset code. */
  sendPasswordReset(email: string, captchaToken?: string): Promise<{ error: string | null; devCode?: string }>;
  /** Sets a new password for the signed-in user (after a reset code, or from settings). */
  updatePassword(password: string): Promise<{ error: string | null }>;
  /** Android: shows Google's account picker and signs in. (The web uses Google's button → signInWithGoogleToken.) */
  signInWithGoogle(captchaToken?: string): Promise<{ error: string | null; cancelled?: boolean }>;
  /** Signs in with an ID token from Google (nonce = the raw value whose hash Google signed). */
  signInWithGoogleToken(idToken: string, nonce: string, captchaToken?: string): Promise<{ error: string | null }>;
  adminSignIn(email: string, password: string, captchaToken?: string): Promise<{ error: string | null }>;
  signOut(): Promise<void>;
  /** Permanently deletes the signed-in user's account and everything they posted. */
  deleteMyAccount(): Promise<{ error: string | null }>;
  getProfile(userId: string): Promise<Profile | null>;
  updateProfile(userId: string, patch: ProfilePatch): Promise<void>;
  /** CNIC verification: the number plus two photos (CNIC front, selfie holding it), kept private. */
  submitVerification(userId: string, cnic: string, isBusiness: boolean, photos: VerificationPhotos): Promise<void>;
  /** Driving-licence check to offer rides: licence number, expiry (YYYY-MM-DD), licence photo + selfie. */
  submitDriverVerification(userId: string, licence: string, expiry: string, photos: VerificationPhotos): Promise<void>;
}

export interface ListingInput {
  business_name: string;
  category: string;
  description: string;
  phone: string;
  lat: number | null;
  lng: number | null;
  location_label: string;
}

export type ModerationAction = 'approve' | 'hide' | 'delete' | 'feature' | 'unfeature';

export interface AdminApi {
  overview(): Promise<AdminOverview>;
  listPosts(filter: 'reported' | 'hidden' | 'all', search?: string): Promise<PostWithRelations[]>;
  moderatePost(adminId: string, postId: string, action: ModerationAction, reason?: string): Promise<void>;
  verificationQueue(): Promise<VerificationRequest[]>;
  /** Short-lived links to a request's private photos (admins only). */
  verificationPhotoUrls(paths: string[]): Promise<string[]>;
  driverQueue(): Promise<DriverRequest[]>;
  /** Driver status of one user (for the user panel). */
  driverStatus(userId: string): Promise<{ status: Profile['driver_status']; until: string | null }>;
  reviewDriver(adminId: string, userId: string, decision: 'approved' | 'rejected' | 'revoked', notes: string): Promise<void>;
  reviewVerification(adminId: string, userId: string, decision: 'approved' | 'rejected', notes: string, expiry: string | null): Promise<void>;
  listListings(status?: ProviderListing['status']): Promise<ProviderListing[]>;
  /** 'removed' takes an approved listing off the directory (recorded as rejected, with the note). */
  reviewListing(adminId: string, id: string, decision: 'approved' | 'rejected' | 'removed', notes: string): Promise<void>;
  upsertEmergencyContact(adminId: string, c: Omit<EmergencyContact, 'id' | 'created_at'> & { id?: string }): Promise<void>;
  deleteEmergencyContact(adminId: string, id: string): Promise<void>;
  auditLog(): Promise<AdminAuditLog[]>;
  listUsers(search: string, filter: AdminUserFilter): Promise<AdminUser[]>;
  updateUser(adminId: string, userId: string, action: AdminUserAction, value?: number, reason?: string): Promise<void>;
  postReports(postId: string): Promise<PostReport[]>;
  /** Owner only. */
  updateSettings(ownerId: string, patch: Partial<AppSettings>): Promise<void>;
  /** Owner only — appoint or remove an admin. */
  setAdmin(ownerId: string, userId: string, isAdmin: boolean): Promise<void>;
}

export interface DataApi {
  mode: BackendMode;
  auth: AuthApi;
  admin: AdminApi;

  listPosts(q: FeedQuery, viewerId?: string | null): Promise<PostWithRelations[]>;
  getPost(id: string, viewerId?: string | null): Promise<PostWithRelations | null>;
  listUserPosts(userId: string): Promise<PostWithRelations[]>;
  listBookmarks(userId: string): Promise<PostWithRelations[]>;
  createPost(userId: string, input: NewPostInput): Promise<PostWithRelations>;
  updatePost(userId: string, id: string, patch: Partial<NewPostInput> & { status?: PostStatus }): Promise<void>;
  deletePost(userId: string, id: string): Promise<void>;

  setVote(userId: string, postId: string, vote: 'up' | 'down' | null): Promise<void>;
  toggleBookmark(userId: string, postId: string): Promise<boolean>;
  setConfirmation(userId: string, postId: string, type: 'confirm' | 'resolve'): Promise<void>;
  reportPost(userId: string, postId: string, reason: string): Promise<void>;

  listComments(postId: string): Promise<Comment[]>;
  addComment(userId: string, postId: string, body: string): Promise<Comment>;
  deleteComment(userId: string, commentId: string): Promise<void>;

  votePoll(userId: string, postId: string, optionId: string): Promise<void>;
  setRsvp(userId: string, postId: string, status: 'going' | 'interested' | null): Promise<void>;
  listRsvps(postId: string): Promise<EventRsvp[]>;

  uploadImages(userId: string, files: File[]): Promise<string[]>;

  listEmergencyContacts(): Promise<EmergencyContact[]>;
  listTrustedContacts(userId: string): Promise<TrustedContact[]>;
  addTrustedContact(userId: string, name: string, phone: string): Promise<void>;
  removeTrustedContact(userId: string, id: string): Promise<void>;

  submitListing(userId: string, input: ListingInput): Promise<void>;
  listMyListings(userId: string): Promise<ProviderListing[]>;
  deleteMyListing(userId: string, id: string): Promise<void>;
  /** Approved, admin-reviewed business listings (public directory). */
  listProviders(): Promise<ProviderListing[]>;
  /** App-wide settings (public read). */
  getSettings(): Promise<AppSettings>;
}

/** Shared post-processing: distance, radius filter, expiry, sorting. */
export { finalizeFeed } from './feed';
