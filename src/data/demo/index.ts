/**
 * Demo backend — a complete, in-browser implementation of DataApi backed by
 * localStorage. Used when Supabase is not configured or not reachable.
 */
import type { AdminApi, AuthApi, DataApi, SessionUser } from '../api';
import { finalizeFeed } from '../feed';
import { emitChange } from '../events';
import { blobToDataUrl, compressImage } from '../images';
import {
  buildSeed,
  DEMO_ADMIN_EMAIL,
  DEMO_ADMIN_PASSWORD,
  DEMO_OWNER_EMAIL,
  DEMO_OWNER_ID,
  DEMO_OWNER_PASSWORD,
  ownerUser,
  type DemoSeed,
  type DemoUser,
} from './seed';
import { DEFAULT_COORDS, haversineKm } from '@/lib/location';
import { getCategory } from '@/lib/categories';
import { maskCnic, uid } from '@/lib/format';
import {
  DEFAULT_SETTINGS,
  type AdminAuditLog,
  type AppSettings,
  type Comment,
  type Coords,
  type PostWithRelations,
  type Profile,
  type PublicProfile,
  type TrustedContact,
} from '@/lib/types';

// Bump when the seed shape changes so browsers re-seed.
const DB_KEY = 'sr_demo_db_v2';
const SESSION_KEY = 'sr_demo_session_v1';
export const DEMO_OTP = '123456';

interface Row { post_id: string; user_id: string; created_at: string }
interface DemoDB extends DemoSeed {
  version: 1;
  anchor: Coords;
  seededAt: number;
  profiles: Record<string, Profile>;
  votes: (Row & { vote_type: 'up' | 'down' })[];
  bookmarks: Row[];
  confirmations: (Row & { type: 'confirm' | 'resolve' })[];
  pollVotes: (Row & { option_id: string })[];
  trusted: TrustedContact[];
  settings?: AppSettings;
}

let db: DemoDB | null = null;

function load(): DemoDB | null {
  if (db) return db;
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) db = JSON.parse(raw) as DemoDB;
  } catch {
    db = null;
  }
  return db;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(db));
    } catch (e) {
      console.warn('[Be Alert demo] Could not persist demo data (storage full?)', e);
    }
  }, 50);
}

function ensure(center?: Coords): DemoDB {
  const existing = load();
  if (!existing) {
    const c = center ?? DEFAULT_COORDS;
    db = {
      version: 1,
      anchor: c,
      seededAt: Date.now(),
      profiles: {},
      votes: [],
      bookmarks: [],
      confirmations: [],
      pollVotes: [],
      trusted: [],
      settings: { ...DEFAULT_SETTINGS },
      ...buildSeed(c),
    };
    save();
    return db;
  }
  upgrade(existing);
  refreshClock(existing);
  if (center) reanchor(existing, center);
  return existing;
}

/** Add things introduced after a browser's demo data was first seeded. */
function upgrade(d: DemoDB) {
  let changed = false;
  if (!d.settings) {
    d.settings = { ...DEFAULT_SETTINGS };
    changed = true;
  }
  if (!d.users.some((u) => u.id === DEMO_OWNER_ID)) {
    d.users.push(ownerUser());
    changed = true;
  }
  if (changed) save();
}

function settingsOf(d: DemoDB): AppSettings {
  return d.settings ?? DEFAULT_SETTINGS;
}

/** Mirrors the `can_post_category()` check used by the live posts INSERT policy. */
function assertCanPost(d: DemoDB, userId: string, category: string) {
  const u = d.users.find((x) => x.id === userId);
  if (u?.is_admin || u?.is_owner) return;
  const s = settingsOf(d);
  if (!s.posting_enabled) throw new Error('New posts are paused by the app owner right now. Please try again later.');
  if (s.disabled_categories.includes(category)) throw new Error(`Posting in “${getCategory(category).label}” is currently turned off.`);
  if (s.verified_only_categories.includes(category)) {
    const ok = u?.verification_status === 'approved' && (!u.verification_expiry || new Date(u.verification_expiry) > new Date());
    if (!ok) throw new Error(`Only CNIC-verified members can post in “${getCategory(category).label}”. Verify in Profile → Verification.`);
  }
}

/** Keep seeded content "fresh": shift seed timestamps forward to now. */
function refreshClock(d: DemoDB) {
  const delta = Date.now() - d.seededAt;
  if (delta < 30 * 60_000) return;
  const shift = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + delta).toISOString() : iso);
  const seedIds = new Set(d.posts.filter((p) => p._seed).map((p) => p.id));
  for (const p of d.posts) {
    if (!p._seed) continue;
    p.created_at = shift(p.created_at)!;
    p.updated_at = shift(p.updated_at)!;
    p.expires_at = shift(p.expires_at);
    if (p.category === 'local_event' && typeof p.metadata.event_date === 'string') {
      p.metadata.event_date = new Date(new Date(p.metadata.event_date).getTime() + delta).toISOString().slice(0, 10);
    }
    if (p.category === 'local_deals' && typeof p.metadata.valid_until === 'string') {
      p.metadata.valid_until = new Date(new Date(p.metadata.valid_until).getTime() + delta).toISOString().slice(0, 10);
    }
  }
  for (const c of d.comments) if (seedIds.has(c.post_id) && c.id.startsWith('c-')) c.created_at = shift(c.created_at)!;
  for (const r of d.rsvps) if (r.id.startsWith('r-')) r.created_at = shift(r.created_at)!;
  for (const u of d.users) if (u.requested_at) u.requested_at = shift(u.requested_at)!;
  d.seededAt = Date.now();
  save();
}

/** If the viewer is far from the demo content, move the seeded content to them. */
function reanchor(d: DemoDB, center: Coords) {
  if (haversineKm(d.anchor, center) < 15) return;
  const dLat = center.lat - d.anchor.lat;
  const dLng = center.lng - d.anchor.lng;
  for (const p of d.posts) {
    if (!p._seed) continue;
    p.lat += dLat;
    p.lng += dLng;
  }
  d.anchor = center;
  save();
}

// ── helpers ─────────────────────────────────────────────────────────────────

function toPublic(u: DemoUser | undefined): PublicProfile | null {
  if (!u) return null;
  return {
    id: u.id,
    display_name: u.display_name,
    avatar_url: u.avatar_url,
    is_business: u.is_business,
    verification_status: u.verification_status,
    verification_expiry: u.verification_expiry,
    trust_score: u.trust_score,
  };
}

function author(d: DemoDB, id: string) {
  return toPublic(d.users.find((u) => u.id === id));
}

function hydrate(d: DemoDB, p: DemoDB['posts'][number], viewer?: string | null): PostWithRelations {
  const { _seed, ...post } = p;
  void _seed;
  const rs = d.rsvps.filter((r) => r.post_id === p.id);
  const opts = d.pollOptions.filter((o) => o.post_id === p.id);
  return {
    ...post,
    author: author(d, p.user_id),
    comment_count: d.comments.filter((c) => c.post_id === p.id).length,
    is_bookmarked: viewer ? d.bookmarks.some((b) => b.post_id === p.id && b.user_id === viewer) : false,
    user_vote: viewer ? d.votes.find((v) => v.post_id === p.id && v.user_id === viewer)?.vote_type ?? null : null,
    user_confirmation: viewer ? d.confirmations.find((v) => v.post_id === p.id && v.user_id === viewer)?.type ?? null : null,
    poll_options: opts.length ? opts : undefined,
    user_poll_vote: viewer ? d.pollVotes.find((v) => v.post_id === p.id && v.user_id === viewer)?.option_id ?? null : null,
    rsvp_count: p.category === 'local_event'
      ? { going: rs.filter((r) => r.status === 'going').length, interested: rs.filter((r) => r.status === 'interested').length }
      : undefined,
    user_rsvp: viewer ? rs.find((r) => r.user_id === viewer)?.status ?? null : null,
  };
}

function defaultProfile(u: DemoUser): Profile {
  return {
    id: u.id,
    phone: u.phone,
    display_name: u.display_name,
    avatar_url: u.avatar_url,
    is_business: u.is_business,
    is_admin: u.is_admin,
    verification_status: u.verification_status,
    verification_date: null,
    verification_expiry: u.verification_expiry,
    verification_history: [],
    trust_score: u.trust_score,
    radius_km: 3,
    saved_locations: [],
    watched_areas: [],
    pinned_categories: ['urgent_blood', 'local_event', 'home_services', 'second_hand'],
    muted_categories: [],
    digest_categories: ['local_deals', 'local_event', 'jobs_internships'],
    digest_enabled: true,
    digest_time: '20:00',
    blocked_users: [],
    theme: 'system',
    created_at: u.created_at,
  };
}

/** Mirrors the `NOT auth_is_banned()` RLS checks in live mode. */
function assertActive(d: DemoDB, userId: string) {
  if (d.users.find((u) => u.id === userId)?.is_banned) {
    throw new Error('Your account is suspended. You can browse, but posting and interactions are disabled.');
  }
}

const isBanned = (d: DemoDB, userId: string) => Boolean(d.users.find((u) => u.id === userId)?.is_banned);

function audit(d: DemoDB, entry: Omit<AdminAuditLog, 'id' | 'created_at'>) {
  d.audit.unshift({ ...entry, id: uid('a'), created_at: new Date().toISOString() });
}

function need<T>(v: T | undefined | null, msg = 'Not found'): T {
  if (v === undefined || v === null) throw new Error(msg);
  return v;
}

// ── auth ────────────────────────────────────────────────────────────────────

const authListeners = new Set<(u: SessionUser | null) => void>();
function setSession(u: SessionUser | null) {
  try {
    if (u) localStorage.setItem(SESSION_KEY, JSON.stringify(u));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
  authListeners.forEach((l) => l(u));
}

const pendingOtp = new Map<string, number>();
const demoPhotos = new Map<string, string[]>(); // demo CNIC/licence photos, in memory only
const demoDrivers = new Map<string, { licence: string; expiry: string; requested_at: string }>();
// Demo-only password accounts (kept in memory; demo data never leaves this browser).
const demoPasswords = new Map<string, string>();
const pendingSignup = new Map<string, string>();

const auth: AuthApi = {
  async getSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? (JSON.parse(raw) as SessionUser) : null;
    } catch {
      return null;
    }
  },
  onChange(cb) {
    authListeners.add(cb);
    return () => authListeners.delete(cb);
  },
  async sendEmailOtp(email) {
    const e = email.trim().toLowerCase();
    const count = pendingOtp.get(e) ?? 0;
    if (count >= 5) return { error: 'Too many code requests for this email. Please try again in an hour.' };
    pendingOtp.set(e, count + 1);
    return { error: null, devCode: DEMO_OTP };
  },
  async verifyEmailOtp(email, code, kind = 'email') {
    if (code !== DEMO_OTP) return { error: 'That code is incorrect. In demo mode the code is 123456.' };
    const e = email.trim().toLowerCase();
    const d = ensure();
    let u = d.users.find((x) => x.email?.toLowerCase() === e);
    if (!u) {
      u = {
        id: `u-mail-${e.replace(/[^a-z0-9]/g, '')}`,
        display_name: '',
        avatar_url: null,
        is_business: false,
        verification_status: null,
        verification_expiry: null,
        trust_score: 50,
        phone: null,
        email: e,
        cnic_number: null,
        is_admin: false,
        created_at: new Date().toISOString(),
      };
      d.users.push(u);
    }
    if (!d.profiles[u.id]) d.profiles[u.id] = defaultProfile(u);
    save();
    if (kind === 'signup' && pendingSignup.has(e)) {
      demoPasswords.set(e, pendingSignup.get(e)!);
      pendingSignup.delete(e);
    }
    setSession({ id: u.id, phone: null, email: e });
    return { error: null };
  },
  async signUpWithPassword(email, password) {
    const e = email.trim().toLowerCase();
    if (demoPasswords.has(e)) return { error: 'ACCOUNT_EXISTS', needsCode: false };
    pendingSignup.set(e, password);
    return { error: null, needsCode: true, devCode: DEMO_OTP };
  },
  async signInWithPassword(email, password) {
    const e = email.trim().toLowerCase();
    if (pendingSignup.has(e)) return { error: 'Email not confirmed', unconfirmed: true };
    if (demoPasswords.get(e) !== password) return { error: 'Invalid login credentials' };
    return auth.verifyEmailOtp(e, DEMO_OTP);
  },
  async resendSignupCode() {
    return { error: null, devCode: DEMO_OTP };
  },
  async sendPasswordReset() {
    return { error: null, devCode: DEMO_OTP };
  },
  async updatePassword(password) {
    const me = await auth.getSession();
    if (!me?.email) return { error: 'Please sign in again.' };
    demoPasswords.set(me.email.toLowerCase(), password);
    return { error: null };
  },
  async signInWithGoogle() {
    return { error: 'Google sign-in works in the live app only.' };
  },
  async adminSignIn(email, password) {
    const e = email.trim().toLowerCase();
    const accounts: Record<string, string> = { [DEMO_ADMIN_EMAIL]: DEMO_ADMIN_PASSWORD, [DEMO_OWNER_EMAIL]: DEMO_OWNER_PASSWORD };
    if (accounts[e] !== password) return { error: 'Invalid email or password.' };
    const d = ensure();
    const u = need(d.users.find((x) => x.email?.toLowerCase() === e || (e === DEMO_ADMIN_EMAIL && x.id === 'u-admin')));
    if (!d.profiles[u.id]) d.profiles[u.id] = defaultProfile(u);
    save();
    setSession({ id: u.id, phone: null, email: e });
    return { error: null };
  },
  async signOut() {
    setSession(null);
  },
  async deleteMyAccount() {
    const d = ensure();
    const me = await auth.getSession();
    if (!me) return { error: 'Please sign in again.' };
    const u = d.users.find((x) => x.id === me.id);
    if (u?.is_owner) return { error: 'The owner account cannot be deleted from the app' };
    d.users = d.users.filter((x) => x.id !== me.id);
    const gone = new Set(d.posts.filter((p) => p.user_id === me.id).map((p) => p.id));
    d.posts = d.posts.filter((p) => !gone.has(p.id));
    d.comments = d.comments.filter((c) => c.user_id !== me.id && !gone.has(c.post_id));
    d.votes = d.votes.filter((v) => v.user_id !== me.id);
    d.bookmarks = d.bookmarks.filter((b) => b.user_id !== me.id);
    save();
    setSession(null);
    return { error: null };
  },
  async getProfile(userId) {
    const d = ensure();
    const u = d.users.find((x) => x.id === userId);
    if (!u) return null;
    if (!d.profiles[userId]) {
      d.profiles[userId] = defaultProfile(u);
      save();
    }
    const p = d.profiles[userId];
    // server-controlled fields always come from the user record
    return {
      ...p,
      is_admin: u.is_admin || Boolean(u.is_owner),
      is_owner: Boolean(u.is_owner),
      verification_status: u.verification_status,
      verification_expiry: u.verification_expiry,
      trust_score: u.trust_score,
      is_banned: Boolean(u.is_banned),
      banned_reason: u.banned_reason ?? null,
    };
  },
  async updateProfile(userId, patch) {
    const d = ensure();
    const p = need(d.profiles[userId], 'Profile not found');
    Object.assign(p, patch);
    const u = d.users.find((x) => x.id === userId);
    if (u) {
      if (patch.display_name !== undefined) u.display_name = patch.display_name;
      if (patch.avatar_url !== undefined) u.avatar_url = patch.avatar_url;
      if (patch.is_business !== undefined) u.is_business = patch.is_business;
    }
    save();
    emitChange('profile');
  },
  async submitDriverVerification(userId, licence, expiry, photos) {
    const d = ensure();
    const p = d.profiles[userId];
    if (!p) throw new Error('Please sign in again.');
    if (new Date(expiry) <= new Date()) throw new Error('Your driving licence has expired — renew it first');
    demoPhotos.set(`driver:${userId}`, await Promise.all([blobToDataUrl(photos.front), blobToDataUrl(photos.selfie)]));
    demoDrivers.set(userId, { licence: licence.replace(/[^A-Za-z0-9]/g, '').toUpperCase(), expiry, requested_at: new Date().toISOString() });
    p.driver_status = 'pending';
    p.driver_licence_expiry = expiry;
    save();
    emitChange('profile');
  },
  async submitVerification(userId, cnic, isBusiness, photos) {
    const d = ensure();
    const u = need(d.users.find((x) => x.id === userId));
    // Demo only: photos stay in this browser's memory (never stored or sent anywhere).
    demoPhotos.set(userId, await Promise.all([blobToDataUrl(photos.front), blobToDataUrl(photos.selfie)]));
    u.cnic_number = cnic.replace(/\D/g, '');
    u.verification_status = 'pending';
    u.is_business = isBusiness;
    u.requested_at = new Date().toISOString();
    if (d.profiles[userId]) d.profiles[userId].is_business = isBusiness;
    save();
    emitChange('profile');
  },
};

// ── admin ───────────────────────────────────────────────────────────────────

const admin: AdminApi = {
  async overview() {
    const d = ensure();
    const days = [...Array(14)].map((_, i) => {
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - (13 - i));
      return day;
    });
    const byDay = days.map((day) => {
      const next = day.getTime() + 86_400_000;
      const real = d.posts.filter((p) => {
        const t = new Date(p.created_at).getTime();
        return t >= day.getTime() && t < next;
      }).length;
      // Give the chart some history so it isn't empty in a fresh demo.
      const synthetic = Math.round(6 + 5 * Math.sin(day.getDate() * 1.7) + (day.getDay() === 0 || day.getDay() === 6 ? 4 : 0));
      return { date: day.toISOString().slice(0, 10), count: real + synthetic };
    });
    const counts = new Map<string, number>();
    d.posts.forEach((p) => counts.set(p.category, (counts.get(p.category) ?? 0) + 1));
    return {
      totalPosts: d.posts.length,
      activePosts: d.posts.filter((p) => p.status === 'active').length,
      hiddenPosts: d.posts.filter((p) => p.status === 'hidden').length,
      reportedPosts: d.posts.filter((p) => p.report_count > 0 && p.status !== 'hidden').length,
      totalUsers: d.users.length + 1200,
      pendingVerifications: d.users.filter((u) => u.verification_status === 'pending').length,
      pendingListings: d.listings.filter((l) => l.status === 'pending').length,
      suspendedUsers: d.users.filter((u) => u.is_banned).length,
      postsByDay: byDay,
      postsByCategory: [...counts.entries()].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count),
    };
  },
  async listPosts(filter, search) {
    const d = ensure();
    let list = d.posts.slice();
    if (filter === 'reported') list = list.filter((p) => p.report_count > 0 && p.status !== 'hidden');
    if (filter === 'hidden') list = list.filter((p) => p.status === 'hidden');
    if (search?.trim()) {
      const s = search.toLowerCase();
      list = list.filter((p) => p.title.toLowerCase().includes(s) || (p.description ?? '').toLowerCase().includes(s));
    }
    list.sort((a, b) => b.report_count - a.report_count || +new Date(b.created_at) - +new Date(a.created_at));
    return list.map((p) => hydrate(d, p));
  },
  async moderatePost(adminId, postId, action, reason) {
    const d = ensure();
    const p = need(d.posts.find((x) => x.id === postId));
    if (action === 'delete') d.posts = d.posts.filter((x) => x.id !== postId);
    if (action === 'hide') p.status = 'hidden';
    if (action === 'approve') {
      p.status = 'active';
      p.report_count = 0;
      d.reports = d.reports.filter((r) => r.post_id !== postId);
    }
    if (action === 'feature') p.is_featured = true;
    if (action === 'unfeature') p.is_featured = false;
    audit(d, { admin_id: adminId, action: `${action}_post`, target_type: 'post', target_id: postId, details: { title: p.title, reason: reason ?? null } });
    save();
    emitChange('posts');
  },
  async verificationQueue() {
    const d = ensure();
    return d.users
      .filter((u) => u.verification_status === 'pending')
      .map((u) => ({
        user_id: u.id,
        display_name: u.display_name || 'Unnamed user',
        phone: u.phone,
        cnic_number: u.cnic_number,
        is_business: u.is_business,
        trust_score: u.trust_score,
        requested_at: u.requested_at ?? u.created_at,
        docs: demoPhotos.has(u.id) ? [`${u.id}/front`, `${u.id}/selfie`] : [],
      }))
      .sort((a, b) => +new Date(a.requested_at) - +new Date(b.requested_at));
  },
  async driverQueue() {
    const d = ensure();
    return Object.values(d.profiles)
      .filter((p) => p.driver_status === 'pending' && demoDrivers.has(p.id))
      .map((p) => {
        const r = demoDrivers.get(p.id)!;
        return { user_id: p.id, display_name: p.display_name || 'Unnamed user', licence_number: r.licence, licence_expiry: r.expiry, requested_at: r.requested_at, docs: [`driver:${p.id}/front`, `driver:${p.id}/selfie`] };
      });
  },
  async driverStatus(userId) {
    const p = ensure().profiles[userId];
    return { status: p?.driver_status ?? null, until: p?.driver_verified_until ?? null };
  },
  async reviewDriver(_adminId, userId, decision) {
    const d = ensure();
    const p = need(d.profiles[userId]);
    const r = demoDrivers.get(userId);
    const until = r ? Math.min(new Date(r.expiry).getTime() + 86_400_000, Date.now() + 365 * 86_400_000) : Date.now();
    p.driver_status = decision === 'approved' ? 'approved' : 'rejected';
    p.driver_verified_until = decision === 'approved' ? new Date(until).toISOString() : null;
    demoPhotos.delete(`driver:${userId}`);
    save();
    emitChange('admin');
  },
  async verificationPhotoUrls(paths) {
    return paths.map((p) => {
      const [id, kind] = p.split('/');
      const urls = demoPhotos.get(id);
      return urls ? urls[kind === 'front' ? 0 : 1] : '';
    });
  },
  async reviewVerification(adminId, userId, decision, notes, expiry) {
    demoPhotos.delete(userId);
    const d = ensure();
    const u = need(d.users.find((x) => x.id === userId));
    u.verification_status = decision;
    u.verification_expiry = decision === 'approved' ? expiry : null;
    if (decision === 'approved') u.trust_score = Math.min(100, u.trust_score + 15);
    const p = d.profiles[userId];
    if (p) {
      p.verification_date = new Date().toISOString();
      p.verification_history = [
        { id: uid('v'), date: new Date().toISOString(), cnic_masked: maskCnic(u.cnic_number), status: decision, valid_until: expiry, notes },
        ...(p.verification_history ?? []),
      ];
    }
    audit(d, { admin_id: adminId, action: `${decision === 'approved' ? 'approve' : 'reject'}_verification`, target_type: 'profile', target_id: userId, details: { name: u.display_name, notes, valid_until: expiry } });
    save();
    emitChange('admin');
  },
  async listListings(status) {
    const d = ensure();
    return d.listings.filter((l) => !status || l.status === status).sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  },
  async reviewListing(adminId, id, decision, notes) {
    const d = ensure();
    const l = need(d.listings.find((x) => x.id === id));
    l.status = decision;
    l.admin_notes = notes || null;
    l.reviewed_by = adminId;
    l.reviewed_at = new Date().toISOString();
    audit(d, { admin_id: adminId, action: `${decision === 'approved' ? 'approve' : 'reject'}_listing`, target_type: 'listing', target_id: id, details: { business: l.business_name, notes } });
    save();
    emitChange('admin');
  },
  async upsertEmergencyContact(adminId, c) {
    const d = ensure();
    if (c.id) {
      const e = need(d.emergency.find((x) => x.id === c.id));
      Object.assign(e, c);
    } else {
      d.emergency.push({ ...c, id: uid('em'), created_at: new Date().toISOString() });
    }
    audit(d, { admin_id: adminId, action: c.id ? 'update_emergency_contact' : 'add_emergency_contact', target_type: 'emergency_contact', target_id: c.id ?? null, details: { name: c.name, phone: c.phone } });
    save();
    emitChange('emergency');
  },
  async deleteEmergencyContact(adminId, id) {
    const d = ensure();
    const e = d.emergency.find((x) => x.id === id);
    d.emergency = d.emergency.filter((x) => x.id !== id);
    audit(d, { admin_id: adminId, action: 'delete_emergency_contact', target_type: 'emergency_contact', target_id: id, details: { name: e?.name } });
    save();
    emitChange('emergency');
  },
  async auditLog() {
    const d = ensure();
    return d.audit.map((a) => ({ ...a, admin_name: d.users.find((u) => u.id === a.admin_id)?.display_name }));
  },
  async listUsers(search, filter) {
    const d = ensure();
    const s = search.trim().toLowerCase();
    return d.users
      .filter((u) => !s || u.display_name.toLowerCase().includes(s) || (u.email ?? '').toLowerCase().includes(s) || (u.phone ?? '').includes(s))
      .filter((u) => {
        if (filter === 'verified') return u.verification_status === 'approved';
        if (filter === 'business') return u.is_business;
        if (filter === 'suspended') return Boolean(u.is_banned);
        if (filter === 'admins') return u.is_admin || Boolean(u.is_owner);
        return true;
      })
      .sort(
        (a, b) =>
          Number(Boolean(b.is_owner)) - Number(Boolean(a.is_owner)) ||
          Number(b.is_admin) - Number(a.is_admin) ||
          +new Date(b.created_at) - +new Date(a.created_at)
      )
      .map((u) => {
        const mine = new Set(d.posts.filter((p) => p.user_id === u.id).map((p) => p.id));
        return {
          id: u.id,
          display_name: u.display_name || 'Unnamed user',
          phone: u.phone,
          email: u.email ?? null,
          is_business: u.is_business,
          is_admin: u.is_admin || Boolean(u.is_owner),
          is_owner: Boolean(u.is_owner),
          is_banned: Boolean(u.is_banned),
          banned_reason: u.banned_reason ?? null,
          verification_status: u.verification_status,
          verification_expiry: u.verification_expiry,
          trust_score: u.trust_score,
          created_at: u.created_at,
          post_count: mine.size,
          reports_received: d.reports.filter((r) => mine.has(r.post_id)).length,
        };
      });
  },
  async updateUser(adminId, userId, action, value, reason) {
    const d = ensure();
    const u = need(d.users.find((x) => x.id === userId), 'User not found');
    if (action === 'ban') {
      if (userId === adminId) throw new Error('You cannot suspend your own account.');
      if (u.is_admin || u.is_owner) throw new Error('Admins cannot be suspended.');
      u.is_banned = true;
      u.banned_reason = reason?.trim() || null;
    }
    if (action === 'unban') {
      u.is_banned = false;
      u.banned_reason = null;
    }
    if (action === 'revoke_verification') {
      u.verification_status = null;
      u.verification_expiry = null;
      u.trust_score = Math.max(0, u.trust_score - 15);
    }
    if (action === 'set_trust') {
      if (value === undefined || value < 0 || value > 100) throw new Error('Trust score must be 0–100.');
      u.trust_score = Math.round(value);
    }
    audit(d, { admin_id: adminId, action: `${action}_user`, target_type: 'profile', target_id: userId, details: { name: u.display_name, reason: reason ?? null, value: value ?? null } });
    save();
    emitChange('admin');
    emitChange('posts');
  },
  async postReports(postId) {
    return ensure()
      .reports.filter((r) => r.post_id === postId)
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  },
  async updateSettings(ownerId, patch) {
    const d = ensure();
    if (!d.users.find((u) => u.id === ownerId)?.is_owner) throw new Error('Owner access required.');
    d.settings = {
      ...settingsOf(d),
      ...patch,
      announcement: patch.announcement !== undefined ? patch.announcement?.trim() || null : settingsOf(d).announcement,
      updated_at: new Date().toISOString(),
    };
    audit(d, { admin_id: ownerId, action: 'update_settings', target_type: 'settings', target_id: null, details: patch as Record<string, unknown> });
    save();
    emitChange('settings');
    emitChange('admin');
  },
  async setAdmin(ownerId, userId, isAdmin) {
    const d = ensure();
    if (!d.users.find((u) => u.id === ownerId)?.is_owner) throw new Error('Owner access required.');
    if (userId === ownerId) throw new Error('You cannot change your own role.');
    const u = need(d.users.find((x) => x.id === userId), 'User not found');
    if (u.is_owner) throw new Error('Owners cannot be changed here.');
    u.is_admin = isAdmin;
    if (isAdmin) u.is_banned = false;
    audit(d, { admin_id: ownerId, action: isAdmin ? 'grant_admin' : 'revoke_admin', target_type: 'profile', target_id: userId, details: { name: u.display_name } });
    save();
    emitChange('admin');
  },
};

// ── data ────────────────────────────────────────────────────────────────────

export const demoApi: DataApi = {
  mode: 'demo',
  auth,
  admin,

  async listPosts(q, viewer) {
    const d = ensure(q.center);
    const blocked = viewer ? d.profiles[viewer]?.blocked_users ?? [] : [];
    const visible = d.posts.filter((p) => !blocked.includes(p.user_id) && (p.user_id === viewer || !isBanned(d, p.user_id)));
    return finalizeFeed(visible.map((p) => hydrate(d, p, viewer)), q);
  },
  async getPost(id, viewer) {
    const d = ensure();
    const p = d.posts.find((x) => x.id === id);
    if (!p) return null;
    if (p.status === 'hidden' && p.user_id !== viewer && !d.users.find((u) => u.id === viewer)?.is_admin) return null;
    return hydrate(d, p, viewer);
  },
  async listUserPosts(userId) {
    const d = ensure();
    return d.posts
      .filter((p) => p.user_id === userId)
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
      .map((p) => hydrate(d, p, userId));
  },
  async listBookmarks(userId) {
    const d = ensure();
    const ids = d.bookmarks.filter((b) => b.user_id === userId).sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)).map((b) => b.post_id);
    return ids.map((id) => d.posts.find((p) => p.id === id)).filter((p): p is DemoDB['posts'][number] => Boolean(p) && p!.status !== 'hidden').map((p) => hydrate(d, p, userId));
  },
  async createPost(userId, input) {
    const d = ensure();
    assertActive(d, userId);
    assertCanPost(d, userId, input.category);
    const now = new Date().toISOString();
    const id = uid('post');
    const { poll_options, ...rest } = input;
    const post = {
      ...rest,
      id,
      user_id: userId,
      reposted_from_id: input.reposted_from_id ?? null,
      status: 'active' as const,
      is_featured: false,
      confirm_count: 0,
      resolve_count: 0,
      report_count: 0,
      upvotes: 0,
      downvotes: 0,
      created_at: now,
      updated_at: now,
    };
    d.posts.unshift(post);
    if (poll_options?.length) {
      poll_options.forEach((t) => d.pollOptions.push({ id: uid('opt'), post_id: id, option_text: t, vote_count: 0 }));
    }
    save();
    emitChange('posts');
    return hydrate(d, post, userId);
  },
  async updatePost(userId, id, patch) {
    const d = ensure();
    const p = need(d.posts.find((x) => x.id === id));
    if (p.user_id !== userId) throw new Error('You can only edit your own posts.');
    const { poll_options, ...rest } = patch;
    void poll_options;
    if (rest.status && p.status === 'hidden') delete rest.status; // hidden posts stay hidden
    Object.assign(p, rest, { updated_at: new Date().toISOString() });
    save();
    emitChange('posts');
  },
  async deletePost(userId, id) {
    const d = ensure();
    const p = need(d.posts.find((x) => x.id === id));
    if (p.user_id !== userId) throw new Error('You can only delete your own posts.');
    d.posts = d.posts.filter((x) => x.id !== id);
    save();
    emitChange('posts');
  },

  async setVote(userId, postId, vote) {
    const d = ensure();
    assertActive(d, userId);
    const p = need(d.posts.find((x) => x.id === postId));
    const prev = d.votes.find((v) => v.post_id === postId && v.user_id === userId);
    if (prev) {
      if (prev.vote_type === 'up') p.upvotes--;
      else p.downvotes--;
      d.votes = d.votes.filter((v) => v !== prev);
    }
    if (vote) {
      d.votes.push({ post_id: postId, user_id: userId, vote_type: vote, created_at: new Date().toISOString() });
      if (vote === 'up') p.upvotes++;
      else p.downvotes++;
    }
    save();
  },
  async toggleBookmark(userId, postId) {
    const d = ensure();
    const had = d.bookmarks.some((b) => b.post_id === postId && b.user_id === userId);
    d.bookmarks = had
      ? d.bookmarks.filter((b) => !(b.post_id === postId && b.user_id === userId))
      : [...d.bookmarks, { post_id: postId, user_id: userId, created_at: new Date().toISOString() }];
    save();
    emitChange('bookmarks');
    return !had;
  },
  async setConfirmation(userId, postId, type) {
    const d = ensure();
    assertActive(d, userId);
    const p = need(d.posts.find((x) => x.id === postId));
    const prev = d.confirmations.find((c) => c.post_id === postId && c.user_id === userId);
    if (prev) {
      if (prev.type === 'confirm') p.confirm_count--;
      else p.resolve_count--;
      d.confirmations = d.confirmations.filter((c) => c !== prev);
    }
    if (!prev || prev.type !== type) {
      d.confirmations.push({ post_id: postId, user_id: userId, type, created_at: new Date().toISOString() });
      if (type === 'confirm') p.confirm_count++;
      else p.resolve_count++;
    }
    // Crowd resolution: enough "resolved" votes close the alert.
    if (p.resolve_count >= 5 && p.resolve_count > p.confirm_count) p.status = 'resolved';
    save();
    emitChange('posts');
  },
  async reportPost(userId, postId, reason) {
    const d = ensure();
    assertActive(d, userId);
    const p = need(d.posts.find((x) => x.id === postId));
    if (d.reports.some((r) => r.post_id === postId && r.user_id === userId)) throw new Error('You have already reported this post.');
    d.reports.push({ id: uid("rep"), post_id: postId, user_id: userId, reason, created_at: new Date().toISOString() });
    p.report_count++;
    if (p.report_count >= 3) p.status = 'hidden';
    save();
    emitChange('posts');
  },

  async listComments(postId) {
    const d = ensure();
    return d.comments
      .filter((c) => c.post_id === postId)
      .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))
      .map((c) => ({ ...c, author: author(d, c.user_id) }));
  },
  async addComment(userId, postId, body) {
    const d = ensure();
    assertActive(d, userId);
    const c: Comment = { id: uid('cm'), post_id: postId, user_id: userId, body: body.trim(), created_at: new Date().toISOString() };
    d.comments.push(c);
    save();
    emitChange('comments');
    return { ...c, author: author(d, userId) };
  },
  async deleteComment(userId, commentId) {
    const d = ensure();
    d.comments = d.comments.filter((c) => !(c.id === commentId && c.user_id === userId));
    save();
    emitChange('comments');
  },

  async votePoll(userId, postId, optionId) {
    const d = ensure();
    assertActive(d, userId);
    const prev = d.pollVotes.find((v) => v.post_id === postId && v.user_id === userId);
    if (prev) {
      const o = d.pollOptions.find((x) => x.id === prev.option_id);
      if (o) o.vote_count--;
      d.pollVotes = d.pollVotes.filter((v) => v !== prev);
      if (prev.option_id === optionId) {
        save();
        return;
      }
    }
    const o = need(d.pollOptions.find((x) => x.id === optionId));
    o.vote_count++;
    d.pollVotes.push({ post_id: postId, user_id: userId, option_id: optionId, created_at: new Date().toISOString() });
    save();
  },
  async setRsvp(userId, postId, status) {
    const d = ensure();
    assertActive(d, userId);
    d.rsvps = d.rsvps.filter((r) => !(r.post_id === postId && r.user_id === userId));
    if (status) d.rsvps.push({ id: uid('r'), post_id: postId, user_id: userId, status, created_at: new Date().toISOString() });
    save();
    emitChange('rsvps');
  },
  async listRsvps(postId) {
    const d = ensure();
    return d.rsvps
      .filter((r) => r.post_id === postId)
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
      .map((r) => ({ ...r, author: author(d, r.user_id) }));
  },

  async uploadImages(_userId, files) {
    // Demo mode stores small JPEGs inline; production uses Supabase Storage.
    const out: string[] = [];
    for (const f of files) out.push(await blobToDataUrl(await compressImage(f, 960, 0.72)));
    return out;
  },

  async listEmergencyContacts() {
    return ensure().emergency.slice();
  },
  async listTrustedContacts(userId) {
    return ensure().trusted.filter((t) => t.user_id === userId);
  },
  async addTrustedContact(userId, name, phone) {
    const d = ensure();
    d.trusted.push({ id: uid('tc'), user_id: userId, name, phone, created_at: new Date().toISOString() });
    save();
    emitChange('trusted');
  },
  async removeTrustedContact(userId, id) {
    const d = ensure();
    d.trusted = d.trusted.filter((t) => !(t.id === id && t.user_id === userId));
    save();
    emitChange('trusted');
  },

  async submitListing(userId, input) {
    const d = ensure();
    assertActive(d, userId);
    const now = new Date().toISOString();
    d.listings.unshift({
      ...input,
      id: uid('l'),
      user_id: userId,
      status: 'pending',
      reviewed_by: null,
      reviewed_at: null,
      admin_notes: null,
      created_at: now,
      updated_at: now,
    });
    save();
    emitChange('listings');
  },
  async listMyListings(userId) {
    return ensure().listings.filter((l) => l.user_id === userId);
  },
  async getSettings() {
    return { ...settingsOf(ensure()) };
  },
  async listProviders() {
    const d = ensure();
    return d.listings.filter((l) => l.status === 'approved' && !isBanned(d, l.user_id));
  },
};

/** Wipe all demo data and sign out (Profile → Privacy). */
export function resetDemoData() {
  db = null;
  try {
    localStorage.removeItem(DB_KEY);
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function isHighRiskCategory(slug: string) {
  return Boolean(getCategory(slug).isHighRisk);
}
