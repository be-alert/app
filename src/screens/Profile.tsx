import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  AlertTriangle,
  BadgeCheck,
  Bookmark,
  Briefcase,
  Camera,
  Clock,
  CarFront,
  Download,
  Eye,
  Loader2,
  LogOut,
  MapPin,
  Moon,
  Palette,
  Pin,
  Plus,
  Radar,
  Search,
  ShieldCheck,
  Store,
  Sun,
  SunMoon,
  Trash2,
  UserRound,
  VolumeX,
} from 'lucide-react';
import { PageBody, PageHeader, RequireAuth } from '@/components/layout/Page';
import { AreaSheet } from '@/components/radar/AreaSheet';
import { RadiusPicker, RadiusSelect } from '@/components/radar/Pickers';
import { Avatar, Badge, ConfirmDialog, Segmented, Sheet, Switch, TrustRing, VerifiedBadge, useToast, verificationState } from '@/components/ui';
import { useApi, useBackend } from '@/data';
import { loadDemo } from '@/data/demo-loader';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { useRadar } from '@/lib/location-context';
import { useDebounced, useQuery } from '@/lib/hooks';
import { CATEGORIES, getCategory } from '@/lib/categories';
import { cn, formatCnic, formatDate, maskPhone, toE164PK, uid } from '@/lib/format';
import { searchPlaces, type PlaceResult } from '@/services/maps';
import { compressImage } from '@/data/images';
import { checkCnic, readCnicNumber, warmUpCnicOcr, type CnicRead } from '@/lib/cnicOcr';
import { isFirebaseConfigured, requestNotificationPermission } from '@/services/firebase';
import type { Profile as ProfileT, WatchedArea } from '@/lib/types';

/**
 * Push alerts and the daily digest need a server-side sender (Firebase Cloud Messaging +
 * a scheduled job) that doesn't exist yet. Their settings stay hidden until it does, so
 * the app never promises alerts it can't deliver.
 */
const NOTIFICATIONS_LIVE = false;

const SECTIONS = [
  { id: 'account', label: 'Account', icon: UserRound },
  { id: 'verification', label: 'Verification', icon: ShieldCheck },
  { id: 'driver', label: 'Driving licence', icon: CarFront },
  { id: 'radar', label: 'Radar & places', icon: Radar },
  { id: 'feed', label: 'Feed preferences', icon: Pin },
  ...(NOTIFICATIONS_LIVE ? [{ id: 'notifications', label: 'Notifications', icon: Bell }] : []),
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'privacy', label: 'Privacy & data', icon: Download },
];

export function Profile() {
  return (
    <>
      <PageHeader title="Profile & settings" subtitle="Your identity, radar preferences and privacy controls." />
      <PageBody>
        <RequireAuth icon={UserRound} title="Your profile" body="Sign in to set up your profile, verify your CNIC and personalise your radar.">
          <ProfileContent />
        </RequireAuth>
      </PageBody>
    </>
  );
}

function ProfileContent() {
  // Deep links like /profile#verification (e.g. from "verify to post") scroll to that section.
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const t = setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 250);
    return () => clearTimeout(t);
  }, [hash]);

  const { profile, signOut } = useAuth();
  if (!profile) return null;
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="hidden lg:block">
        <nav className="sticky top-8 space-y-0.5" aria-label="Settings sections">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-ink-2 hover:bg-surface-2 hover:text-ink">
              <s.icon className="h-4 w-4" /> {s.label}
            </a>
          ))}
          <button onClick={signOut} className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-danger-600 hover:bg-surface-2">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </nav>
      </aside>
      <div className="min-w-0 space-y-5">
        <AccountCard profile={profile} />
        <VerificationSection profile={profile} />
        <DriverSection profile={profile} />
        <RadarSection profile={profile} />
        <FeedSection profile={profile} />
        {NOTIFICATIONS_LIVE && <NotificationSection profile={profile} />}
        <AppearanceSection />
        <PrivacySection profile={profile} />
        <button onClick={signOut} className="btn-outline w-full text-danger-600 lg:hidden">
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </div>
  );
}

function Section({ id, icon: Icon, title, description, children, action }: { id: string; icon: typeof Radar; title: string; description?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section id={id} className="card scroll-mt-24 p-5 lg:p-6">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-600/10 text-primary-600">
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-ink">{title}</h2>
          {description && <p className="text-[13px] text-ink-2">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Row({ title, body, children }: { title: string; body?: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{title}</p>
        {body && <p className="text-xs text-ink-2">{body}</p>}
      </div>
      {children}
    </div>
  );
}

function useSave() {
  const { updateProfile } = useAuth();
  const toast = useToast();
  return async (patch: Parameters<typeof updateProfile>[0], msg?: string) => {
    try {
      await updateProfile(patch);
      if (msg) toast.success(msg);
    } catch (e) {
      toast.error('Could not save', (e as Error).message);
    }
  };
}

// ── Account ─────────────────────────────────────────────────────────────────

function AccountCard({ profile }: { profile: ProfileT }) {
  const api = useApi();
  const { user } = useAuth();
  const toast = useToast();
  const save = useSave();
  const [name, setName] = useState(profile.display_name);
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const { data: stats } = useQuery(() => api.listUserPosts(profile.id), [api, profile.id]);
  useEffect(() => setName(profile.display_name), [profile.display_name]);

  async function upload(f: File) {
    if (!user) return;
    setUploading(true);
    try {
      const [url] = await api.uploadImages(user.id, [f]);
      await save({ avatar_url: url }, 'Profile photo updated');
    } catch (e) {
      toast.error('Upload failed', (e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  const posts = stats ?? [];
  return (
    <section id="account" className="card scroll-mt-24 overflow-hidden">
      <div className="h-24 bg-gradient-to-r from-primary-600 via-primary-700 to-[#131a4a] lg:h-28" />
      <div className="px-5 pb-5 lg:px-6">
        <div className="-mt-12 flex items-end gap-4">
          <button onClick={() => file.current?.click()} className="group relative rounded-full ring-4 ring-surface" aria-label="Change profile photo">
            <Avatar name={profile.display_name || 'You'} src={profile.avatar_url} size={88} />
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition group-hover:opacity-100">
              <Camera className="h-6 w-6" />
            </span>
            {uploading && <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-xs font-bold text-white">…</span>}
          </button>
          <input ref={file} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <div className="ml-auto">
            <TrustRing score={profile.trust_score} size={60} />
          </div>
        </div>
        <div className="mt-3">
          <h2 className="flex items-center gap-1.5 text-xl font-extrabold tracking-tight text-ink">
            {profile.display_name || 'Add your name'} <VerifiedBadge profile={profile} size={18} />
          </h2>
          <p className="text-sm text-ink-2">
            {user?.email || maskPhone(profile.phone) || 'Signed in'} · Member since {formatDate(profile.created_at, { month: 'short', year: 'numeric' })}
          </p>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            ['Posts', posts.length],
            ['Upvotes', posts.reduce((s, p) => s + p.upvotes, 0)],
            ['Trust', profile.trust_score],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-surface-2 p-2.5 text-center">
              <p className="text-lg font-extrabold tabular-nums text-ink">{v}</p>
              <p className="text-[11px] font-semibold text-ink-3">{k}</p>
            </div>
          ))}
        </div>
        <form
          className="mt-5 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim().length >= 2) save({ display_name: name.trim() }, 'Name updated');
          }}
        >
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-label="Display name" placeholder="Display name" />
          <button className="btn-secondary" disabled={name.trim() === profile.display_name || name.trim().length < 2}>
            Save
          </button>
        </form>
      </div>
    </section>
  );
}

// ── Verification & business ─────────────────────────────────────────────────

function VerificationSection({ profile }: { profile: ProfileT }) {
  const api = useApi();
  const toast = useToast();
  const [cnic, setCnic] = useState('');
  const [front, setFront] = useState<Blob | null>(null);
  const [selfie, setSelfie] = useState<Blob | null>(null);
  const [business, setBusiness] = useState(profile.is_business);
  const [busy, setBusy] = useState(false);
  const [listingOpen, setListingOpen] = useState(false);
  const { data: listings } = useQuery(() => api.listMyListings(profile.id), [api, profile.id], { scopes: ['listings', 'admin'] });
  const v = verificationState(profile);
  const status = profile.verification_status;

  const cnicDigits = cnic.replace(/\D/g, '');
  const cnicValid = /^[1-7]\d{12}$/.test(cnicDigits);
  const ready = cnicValid && front && selfie;

  // Read the number printed on the CNIC photo, on this device, as soon as the photo is added.
  const [card, setCard] = useState<{ state: 'idle' | 'reading' | 'done' | 'failed'; read?: CnicRead }>({ state: 'idle' });
  const [photoTries, setPhotoTries] = useState(0);
  const reading = useRef<Promise<CnicRead | null> | null>(null);
  useEffect(() => {
    if (!front) {
      setCard({ state: 'idle' });
      reading.current = null;
      return;
    }
    let alive = true;
    setPhotoTries((n) => n + 1);
    setCard({ state: 'reading' });
    const job = readCnicNumber(front).then(
      (r) => {
        if (alive) setCard({ state: 'done', read: r });
        return r;
      },
      () => {
        if (alive) setCard({ state: 'failed' });
        return null;
      }
    );
    reading.current = job;
    return () => {
      alive = false;
    };
  }, [front]);
  const photo = card.read && cnicValid ? checkCnic(cnicDigits, card.read) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    try {
      let r = await reading.current;
      // Not an exact match yet: read again, aiming at the typed number (extra image treatments).
      if (r && !r.candidates.includes(cnicDigits)) r = await readCnicNumber(front!, cnicDigits).catch(() => r);
      // OCR couldn't run at all (offline / old phone): let a moderator compare by eye.
      const result = r ? checkCnic(cnicDigits, r) : ({ check: 'unreadable', read: null } as const);
      if (r && result.check === 'unreadable' && photoTries < 2) {
        toast.error('We couldn’t read the number on your CNIC', 'Retake the photo flat, in good light, with no glare or fingers over the number.');
        return;
      }
      const outcome = await api.auth.submitVerification(
        profile.id,
        cnic,
        business,
        result.check === 'mismatch' ? null : { front: front!, selfie: selfie! },
        result.read
      );
      if (outcome === 'auto_rejected') {
        toast.error('Verification rejected', 'The CNIC number you typed doesn’t match the number on your card. Only your own CNIC can be used.');
      } else {
        toast.success('Request submitted', 'Your request is under review. You’ll hear back within 24 hours.');
      }
      setCnic('');
      setFront(null);
      setSelfie(null);
      setPhotoTries(0);
    } catch (err) {
      toast.error('Could not submit', (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      id="verification"
      icon={ShieldCheck}
      title="CNIC verification"
      description="Needed to sell items, offer services, tutoring, domestic help, rentals, jobs or shop deals. After your CNIC is approved you can post in these sections and get a blue badge."
    >
      {status === 'approved' && v !== 'expired' ? (
        <div className="flex items-center gap-3 rounded-2xl bg-primary-600/5 p-4 ring-1 ring-primary-500/20">
          <BadgeCheck className="h-8 w-8 fill-primary-600 text-white" />
          <div>
            <p className="font-bold text-ink">You’re verified</p>
            <p className="text-[13px] text-ink-2">
              {profile.verification_expiry ? `Valid until ${formatDate(profile.verification_expiry)}` : 'No expiry'}
              {v === 'due_soon' ? ' · renewal due soon' : ''}
            </p>
          </div>
        </div>
      ) : status === 'pending' ? (
        <div className="flex items-start gap-3 rounded-2xl bg-warning-50 p-4 text-warning-700 dark:bg-warning-500/10 dark:text-warning-500">
          <Clock className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-bold">Your request is under review</p>
            <p className="mt-0.5 text-[13px]">We’re checking your CNIC details. You’ll hear back within 24 hours.</p>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          {status === 'rejected' && (
            <p className="rounded-xl bg-danger-50 px-3.5 py-2.5 text-[13px] text-danger-700 dark:bg-danger-500/10 dark:text-danger-400">
              Your last request wasn’t approved.{' '}
              {profile.verification_history?.[0]?.notes ? <b>Reason: {profile.verification_history[0].notes}. </b> : null}
              Make sure the CNIC number matches the card and both photos are clear, then try again.
            </p>
          )}
          {v === 'expired' && <p className="rounded-xl bg-surface-2 px-3.5 py-2.5 text-[13px] text-ink-2">Your verification has expired — please re-submit.</p>}
          <div>
            <label className="label" htmlFor="cnic">CNIC number</label>
            <input
              id="cnic"
              className="input tracking-wider"
              inputMode="numeric"
              placeholder="42101-1234567-1"
              value={cnic}
              onFocus={warmUpCnicOcr}
              onChange={(e) => setCnic(formatCnic(e.target.value))}
            />
            {cnicDigits.length === 13 && !cnicValid && <p className="mt-1.5 text-xs font-medium text-danger-600">This doesn’t look like a valid CNIC number.</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <PhotoPick label="CNIC front" hint="All text readable, no glare" value={front} onChange={setFront} />
            <PhotoPick label="Selfie holding your CNIC" hint="Your face and the card visible" value={selfie} onChange={setSelfie} />
          </div>
          <CardCheck state={card.state} photo={photo} cnicValid={cnicValid} />
          <label className="flex items-center justify-between gap-3 rounded-xl border border-line px-3.5 py-3">
            <span>
              <span className="block text-sm font-semibold text-ink">I’m a business / service provider</span>
              <span className="block text-xs text-ink-2">Electricians, tutors, shops, estate agents…</span>
            </span>
            <Switch label="Business account" checked={business} onChange={setBusiness} />
          </label>
          <button className="btn-primary w-full sm:w-auto" disabled={busy || !ready}>
            {busy ? 'Uploading securely…' : 'Submit for verification'}
          </button>
        </form>
      )}

      <div className="mt-5 border-t border-line pt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-bold text-ink">
              <Store className="h-4 w-4 text-ink-3" /> Business listings
            </p>
            <p className="text-xs text-ink-2">Get listed in the verified business directory. Your CNIC must be verified first.</p>
          </div>
          <button className="btn-secondary btn-sm" onClick={() => setListingOpen(true)}>
            <Plus className="h-4 w-4" /> Submit
          </button>
        </div>
        {!!listings?.length && (
          <ul className="mt-3 space-y-2">
            {listings.map((l) => (
              <li key={l.id} className="rounded-xl bg-surface-2 px-3.5 py-2.5">
                <div className="flex items-center gap-3">
                  <Briefcase className="h-4 w-4 text-ink-3" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{l.business_name}</p>
                    <p className="text-xs text-ink-3">{getCategory(l.category).label}</p>
                  </div>
                  <Badge tone={l.status === 'approved' ? 'success' : l.status === 'rejected' ? 'danger' : 'warning'}>
                    {l.status === 'approved' ? 'listed' : l.status}
                  </Badge>
                  <button
                    className="rounded-lg p-1.5 text-ink-3 hover:bg-surface hover:text-danger-600"
                    aria-label={`Delete ${l.business_name}`}
                    onClick={async () => {
                      if (!window.confirm(`Delete “${l.business_name}”? This removes it from Be Alert.`)) return;
                      try {
                        await api.deleteMyListing(profile.id, l.id);
                        toast.success('Listing deleted');
                      } catch (e) {
                        toast.error('Could not delete', (e as Error).message);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {l.status === 'rejected' && l.admin_notes && <p className="mt-1.5 text-xs text-danger-600">Reason: {l.admin_notes}</p>}
                {l.status === 'pending' && status !== 'approved' && (
                  <p className="mt-1.5 text-xs text-warning-700 dark:text-warning-500">Verify your CNIC above — only verified owners are listed.</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <ListingSheet open={listingOpen} onClose={() => setListingOpen(false)} userId={profile.id} />
    </Section>
  );
}

// ── Driving licence (required to offer rides) ──────────────────────────────

function DriverSection({ profile }: { profile: ProfileT }) {
  const api = useApi();
  const toast = useToast();
  const [licence, setLicence] = useState('');
  const [expiry, setExpiry] = useState('');
  const [front, setFront] = useState<Blob | null>(null);
  const [selfie, setSelfie] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const status = profile.driver_status;
  const until = profile.driver_verified_until ? new Date(profile.driver_verified_until) : null;
  const active = status === 'approved' && until !== null && until > new Date();
  const today = new Date().toISOString().slice(0, 10);
  const licenceOk = licence.replace(/[^A-Za-z0-9]/g, '').length >= 5;
  const ready = licenceOk && expiry > today && front && selfie;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    try {
      await api.auth.submitDriverVerification(profile.id, licence.trim(), expiry, { front: front!, selfie: selfie! });
      toast.success('Request submitted', 'Your licence is under review. You’ll hear back within 24 hours.');
      setLicence('');
      setExpiry('');
      setFront(null);
      setSelfie(null);
    } catch (err) {
      toast.error('Could not submit', (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section id="driver" icon={CarFront} title="Driving licence" description="Required only to offer rides in Carpool & Rideshare. Riders see a “Verified driver” badge on your rides.">
      {active ? (
        <div className="flex items-center gap-3 rounded-2xl bg-primary-600/5 p-4 ring-1 ring-primary-500/20">
          <CarFront className="h-8 w-8 text-primary-600" />
          <div>
            <p className="font-bold text-ink">You’re a verified driver</p>
            <p className="text-[13px] text-ink-2">Valid until {formatDate(until!.toISOString())} — renew before your licence expires.</p>
          </div>
        </div>
      ) : status === 'pending' ? (
        <div className="flex items-start gap-3 rounded-2xl bg-warning-50 p-4 text-warning-700 dark:bg-warning-500/10 dark:text-warning-500">
          <Clock className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-bold">Your request is under review</p>
            <p className="mt-0.5 text-[13px]">We’re checking your driving licence. You’ll hear back within 24 hours.</p>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          {status === 'rejected' && (
            <p className="rounded-xl bg-danger-50 px-3.5 py-2.5 text-[13px] text-danger-700 dark:bg-danger-500/10 dark:text-danger-400">
              Your licence wasn’t approved (or has expired).{' '}
              {profile.driver_review_notes ? <b>Reason: {profile.driver_review_notes}. </b> : null}
              Make sure the details match the card and both photos are clear, then try again.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="licence">Licence number</label>
              <input id="licence" className="input uppercase tracking-wider" placeholder="As printed on your licence" value={licence} onChange={(e) => setLicence(e.target.value.slice(0, 30))} />
            </div>
            <div>
              <label className="label" htmlFor="licence-expiry">Valid until</label>
              <input id="licence-expiry" type="date" className="input" min={today} value={expiry} onChange={(e) => setExpiry(e.target.value)} />
              {expiry && expiry <= today && <p className="mt-1.5 text-xs font-medium text-danger-600">This licence has expired.</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <PhotoPick label="Driving licence (front)" hint="Name, photo and dates readable" value={front} onChange={setFront} />
            <PhotoPick label="Selfie holding your licence" hint="Your face and the card visible" value={selfie} onChange={setSelfie} />
          </div>
          <button className="btn-primary w-full sm:w-auto" disabled={busy || !ready}>
            {busy ? 'Uploading securely…' : 'Submit licence'}
          </button>
        </form>
      )}
    </Section>
  );
}

/** Pick (or take) a photo; it's resized and re-encoded on the device, which also strips EXIF/location data. */
/** Live result of reading the number on the CNIC photo. */
function CardCheck({ state, photo, cnicValid }: { state: string; photo: ReturnType<typeof checkCnic> | null; cnicValid: boolean }) {
  const box = 'flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-[13px]';
  if (state === 'reading')
    return (
      <p className={cn(box, 'bg-surface-2 text-ink-2')}>
        <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" /> Checking the number on your CNIC photo…
      </p>
    );
  if (state === 'failed')
    return <p className={cn(box, 'bg-surface-2 text-ink-2')}>Couldn’t check the photo automatically — a moderator will compare it by eye.</p>;
  if (state !== 'done' || !cnicValid || !photo) return null;
  if (photo.check === 'match')
    return (
      <p className={cn(box, 'bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-500')}>
        <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" /> The number on your card matches.
      </p>
    );
  if (photo.check === 'unreadable')
    return (
      <p className={cn(box, 'bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-500')}>
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> We couldn’t read the number on the card. Retake the photo flat, in good light, with no
        glare or fingers over the number.
      </p>
    );
  const shown = photo.read ? formatCnic(photo.read) : '';
  if (photo.check === 'near')
    return (
      <p className={cn(box, 'bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-500')}>
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Your card seems to show <b className="tracking-wider">{shown}</b>. Check the number you typed. If it’s right, submit — a sharper photo
          helps, and Be Alert will compare it during review.
        </span>
      </p>
    );
  return (
    <p className={cn(box, 'bg-danger-50 text-danger-700 dark:bg-danger-500/10 dark:text-danger-400')}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        The number on this card (<b className="tracking-wider">{shown}</b>) doesn’t match the number you typed. Use your own CNIC and type its number
        exactly — <b>requests that don’t match are rejected automatically.</b>
      </span>
    </p>
  );
}

function PhotoPick({ label, hint, value, onChange }: { label: string; hint: string; value: Blob | null; onChange(b: Blob | null): void }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!value) return setPreview(null);
    const url = URL.createObjectURL(value);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  async function pick(file: File | undefined) {
    if (!file) return;
    setWorking(true);
    try {
      onChange(await compressImage(file, 1600, 0.85));
    } catch (e) {
      toast.error('Could not use this photo', (e as Error).message);
    } finally {
      setWorking(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => input.current?.click()}
        className={cn(
          'relative flex aspect-[4/3] w-full flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed text-center transition',
          value ? 'border-primary-500/50' : 'border-line hover:border-primary-500/50'
        )}
      >
        {preview ? (
          <>
            <img src={preview} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-white">Change</span>
          </>
        ) : (
          <span className="px-2 text-ink-3">
            <Camera className="mx-auto h-6 w-6" />
            <span className="mt-1.5 block text-xs font-semibold">{working ? 'Processing…' : 'Add photo'}</span>
          </span>
        )}
      </button>
      <p className="mt-1.5 text-xs font-semibold text-ink">{label}</p>
      <p className="text-[11px] text-ink-3">{hint}</p>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/heic" hidden onChange={(e) => pick(e.target.files?.[0])} />
    </div>
  );
}

function ListingSheet({ open, onClose, userId }: { open: boolean; onClose(): void; userId: string }) {
  const api = useApi();
  const toast = useToast();
  const radar = useRadar();
  const [f, setF] = useState({ business_name: '', category: 'home_services', description: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const valid = f.business_name.trim().length >= 3 && toE164PK(f.phone);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    try {
      await api.submitListing(userId, {
        ...f,
        business_name: f.business_name.trim(),
        phone: toE164PK(f.phone)!,
        lat: radar.coords.lat,
        lng: radar.coords.lng,
        location_label: radar.areaLabel,
      });
      toast.success('Listing submitted', 'It will appear in the directory once approved.');
      onClose();
      setF({ business_name: '', category: 'home_services', description: '', phone: '' });
    } catch (err) {
      toast.error('Could not submit', (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Submit a business listing" description="Listings are reviewed by moderators before going public." size="sm">
      <form onSubmit={submit} className="space-y-3.5">
        <div>
          <label className="label">Business name</label>
          <input data-autofocus className="input" value={f.business_name} onChange={(e) => setF({ ...f, business_name: e.target.value })} placeholder="e.g., Usman Electric Works" />
        </div>
        <div>
          <label className="label">Category</label>
          <select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {CATEGORIES.filter((c) => ['services', 'rentals', 'marketplace', 'jobs'].includes(c.group)).map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Business phone</label>
          <input className="input" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="0300 1234567" />
        </div>
        <div>
          <label className="label">About</label>
          <textarea className="input" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Services, timings, experience…" />
        </div>
        <button className="btn-primary w-full" disabled={!valid || busy}>
          {busy ? 'Submitting…' : 'Submit for review'}
        </button>
      </form>
    </Sheet>
  );
}

// ── Radar & places ──────────────────────────────────────────────────────────

function RadarSection({ profile }: { profile: ProfileT }) {
  const radar = useRadar();
  const save = useSave();
  const [placeOpen, setPlaceOpen] = useState(false);
  const [watchOpen, setWatchOpen] = useState(false);
  const [areaOpen, setAreaOpen] = useState(false);

  return (
    <Section id="radar" icon={Radar} title="Radar & places" description="Your city or country, scan radius, saved places and neighbourhoods you watch.">
      <Row title="City / country" body={radar.area.kind === 'gps' ? 'Using your current location' : radar.areaLabel}>
        <button className="btn-secondary btn-sm" onClick={() => setAreaOpen(true)}>
          <MapPin className="h-4 w-4" /> Change
        </button>
      </Row>
      <div className="border-t border-line py-4">
        <p className="text-sm font-semibold text-ink">Scan radius</p>
        <p className="mb-3 text-xs text-ink-2">How far your feed looks — from 1 km up to 50 km.</p>
        <RadiusPicker value={radar.radiusKm} onChange={radar.setRadiusKm} compact />
      </div>
      <AreaSheet open={areaOpen} onClose={() => setAreaOpen(false)} />

      <div className="mt-2 border-t border-line pt-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="flex items-center gap-2 text-sm font-bold text-ink">
            <Bookmark className="h-4 w-4 text-ink-3" /> Saved places
          </p>
          <button className="btn-ghost btn-sm" onClick={() => setPlaceOpen(true)}>
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
        {profile.saved_locations.length === 0 ? (
          <p className="text-[13px] text-ink-3">Save Home, Work or your kids’ school to switch your radar in one tap.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {profile.saved_locations.map((s) => (
              <span key={s.label} className="chip-off pr-1.5">
                <MapPin className="h-3.5 w-3.5" /> {s.label}
                <button
                  aria-label={`Remove ${s.label}`}
                  className="ml-1 rounded-full p-1 hover:bg-surface-2"
                  onClick={() => save({ saved_locations: profile.saved_locations.filter((x) => x.label !== s.label) }, 'Place removed')}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 border-t border-line pt-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="flex items-center gap-2 text-sm font-bold text-ink">
            <Eye className="h-4 w-4 text-ink-3" /> Watched areas
          </p>
          <button className="btn-ghost btn-sm" onClick={() => setWatchOpen(true)}>
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
        {profile.watched_areas.length === 0 ? (
          <p className="text-[13px] text-ink-3">Moving soon? Watch another neighbourhood for rentals, jobs and events.</p>
        ) : (
          <ul className="space-y-2">
            {profile.watched_areas.map((w) => (
              <li key={w.id} className="flex items-center gap-3 rounded-xl bg-surface-2 px-3.5 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{w.name}</p>
                  <p className="text-xs text-ink-3">
                    {w.city} · {w.radius_km} km
                  </p>
                </div>
                <Switch
                  label={`Notifications for ${w.name}`}
                  checked={w.notify}
                  onChange={(v) => save({ watched_areas: profile.watched_areas.map((x) => (x.id === w.id ? { ...x, notify: v } : x)) })}
                />
                <button className="icon-btn h-9 w-9" aria-label={`Remove ${w.name}`} onClick={() => save({ watched_areas: profile.watched_areas.filter((x) => x.id !== w.id) }, 'Area removed')}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <SavePlaceSheet open={placeOpen} onClose={() => setPlaceOpen(false)} profile={profile} />
      <WatchAreaSheet open={watchOpen} onClose={() => setWatchOpen(false)} profile={profile} />
    </Section>
  );
}

function SavePlaceSheet({ open, onClose, profile }: { open: boolean; onClose(): void; profile: ProfileT }) {
  const radar = useRadar();
  const save = useSave();
  const [label, setLabel] = useState('Home');
  const where = radar.coords;
  return (
    <Sheet open={open} onClose={onClose} title="Save this place" description={`Saves your current radar centre (${radar.areaLabel}).`} size="sm">
      <div className="flex flex-wrap gap-2">
        {['Home', 'Work', 'School', 'Gym', 'Parents'].map((l) => (
          <button key={l} onClick={() => setLabel(l)} className={label === l ? 'chip-on' : 'chip-off'}>
            {l}
          </button>
        ))}
      </div>
      <input className="input mt-3" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={24} placeholder="Label" />
      <button
        className="btn-primary mt-4 w-full"
        disabled={!label.trim() || profile.saved_locations.some((s) => s.label.toLowerCase() === label.trim().toLowerCase())}
        onClick={async () => {
          await save({ saved_locations: [...profile.saved_locations, { label: label.trim(), lat: where.lat, lng: where.lng }] }, 'Place saved');
          onClose();
        }}
      >
        Save place
      </button>
    </Sheet>
  );
}

function WatchAreaSheet({ open, onClose, profile }: { open: boolean; onClose(): void; profile: ProfileT }) {
  const save = useSave();
  const radar = useRadar();
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 450);
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [radius, setRadius] = useState(3);

  useEffect(() => {
    let alive = true;
    if (dq.trim().length < 3) {
      setResults([]);
      return;
    }
    searchPlaces(dq, radar.countryCode).then((r) => alive && setResults(r));
    return () => {
      alive = false;
    };
  }, [dq, radar.countryCode]);

  async function add(r: PlaceResult) {
    const area: WatchedArea = {
      id: uid('wa'),
      name: r.label,
      city: r.detail.split(',').slice(-2, -1)[0]?.trim() || r.detail.split(',')[0] || '',
      lat: r.lat,
      lng: r.lng,
      radius_km: radius,
      notify: true,
      created_at: new Date().toISOString(),
    };
    await save({ watched_areas: [area, ...profile.watched_areas].slice(0, 10) }, `Watching ${r.label}`);
    setQ('');
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title="Watch a neighbourhood" description="Switch your radar to it anytime from the feed." size="sm">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
        <input data-autofocus className="input pl-10" placeholder="e.g., DHA Phase 6, Lahore" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-ink-2">Radius</span>
        <RadiusSelect value={radius} onChange={setRadius} />
      </div>
      <ul className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line empty:hidden">
        {results.map((r) => (
          <li key={`${r.lat},${r.lng}`}>
            <button onClick={() => add(r)} className="flex w-full items-start gap-3 px-3.5 py-3 text-left hover:bg-surface-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-ink">{r.label}</span>
                <span className="block truncate text-xs text-ink-3">{r.detail}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

// ── Feed preferences ────────────────────────────────────────────────────────

function FeedSection({ profile }: { profile: ProfileT }) {
  const save = useSave();
  const toggle = (key: 'pinned_categories' | 'muted_categories', slug: string) => {
    const list = profile[key];
    save({ [key]: list.includes(slug) ? list.filter((s) => s !== slug) : [...list, slug] });
  };
  return (
    <Section id="feed" icon={Pin} title="Feed preferences" description="Pinned categories appear first. Muted categories won’t notify you.">
      <p className="eyebrow mb-2">Pinned</p>
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => {
          const on = profile.pinned_categories.includes(c.slug);
          return (
            <button key={c.slug} onClick={() => toggle('pinned_categories', c.slug)} aria-pressed={on} className={on ? 'chip-on' : 'chip-off'}>
              <c.icon className="h-4 w-4" style={on ? undefined : { color: c.color }} /> {c.short}
            </button>
          );
        })}
      </div>
      <p className="eyebrow mb-2 mt-5 flex items-center gap-1.5">
        <VolumeX className="h-3.5 w-3.5" /> Muted
      </p>
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => {
          const on = profile.muted_categories.includes(c.slug);
          return (
            <button
              key={c.slug}
              onClick={() => toggle('muted_categories', c.slug)}
              aria-pressed={on}
              className={cn('chip', on ? 'border-danger-500/40 bg-danger-50 text-danger-700 dark:bg-danger-500/10 dark:text-danger-400' : 'border-line bg-surface text-ink-2')}
            >
              {c.short}
            </button>
          );
        })}
      </div>
    </Section>
  );
}

// ── Notifications / digest ──────────────────────────────────────────────────

function NotificationSection({ profile }: { profile: ProfileT }) {
  const save = useSave();
  const toast = useToast();
  const pushAvailable = isFirebaseConfigured();
  const [pushState, setPushState] = useState<NotificationPermission | 'unsupported'>(() => ('Notification' in window ? Notification.permission : 'unsupported'));

  return (
    <Section id="notifications" icon={Bell} title="Notifications & daily digest">
      <div className="divide-y divide-line">
        <Row
          title="Push alerts"
          body={pushAvailable ? 'Urgent alerts near you, even when the app is closed.' : 'Push notifications will be available once Firebase is configured.'}
        >
          <button
            className="btn-secondary btn-sm"
            disabled={!pushAvailable || pushState === 'granted' || pushState === 'unsupported'}
            onClick={async () => {
              const token = await requestNotificationPermission();
              setPushState('Notification' in window ? Notification.permission : 'unsupported');
              if (token) {
                // Stored on the profile so a server-side sender can target this device.
                await save({ fcm_token: token });
                toast.success('Push alerts enabled');
              } else if ('Notification' in window && Notification.permission === 'granted') {
                toast.error('Push setup incomplete', 'The Firebase VAPID key is not configured yet.');
              }
            }}
          >
            {pushState === 'granted' ? 'Enabled' : pushState === 'denied' ? 'Blocked' : 'Enable'}
          </button>
        </Row>
        <Row title="Daily digest" body="One summary of what happened around you each day.">
          <Switch label="Daily digest" checked={profile.digest_enabled} onChange={(v) => save({ digest_enabled: v })} />
        </Row>
        {profile.digest_enabled && (
          <>
            <Row title="Delivery time">
              <input type="time" className="input h-10 w-32" value={profile.digest_time} onChange={(e) => save({ digest_time: e.target.value })} />
            </Row>
            <div className="py-3">
              <p className="mb-2 text-sm font-semibold text-ink">Include</p>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => {
                  const on = profile.digest_categories.includes(c.slug);
                  return (
                    <button
                      key={c.slug}
                      aria-pressed={on}
                      onClick={() =>
                        save({ digest_categories: on ? profile.digest_categories.filter((s) => s !== c.slug) : [...profile.digest_categories, c.slug] })
                      }
                      className={on ? 'chip-on' : 'chip-off'}
                    >
                      {c.short}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </Section>
  );
}

// ── Appearance ──────────────────────────────────────────────────────────────

function AppearanceSection() {
  const { pref, setPref } = useTheme();
  return (
    <Section id="appearance" icon={Palette} title="Appearance">
      <Segmented
        className="flex w-full"
        value={pref}
        onChange={setPref}
        options={[
          { value: 'light', label: 'Light', icon: Sun },
          { value: 'dark', label: 'Dark', icon: Moon },
          { value: 'system', label: 'System', icon: SunMoon },
        ]}
      />
    </Section>
  );
}

// ── Privacy ─────────────────────────────────────────────────────────────────

function PrivacySection({ profile }: { profile: ProfileT }) {
  const api = useApi();
  const { demoReason } = useBackend();
  const save = useSave();
  const toast = useToast();
  const [resetOpen, setResetOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const { deleteMyAccount } = useAuth();
  const navigate = useNavigate();

  async function confirmDelete() {
    setDeleting(true);
    const { error } = await deleteMyAccount();
    setDeleting(false);
    if (error) {
      toast.error('Could not delete account', error);
      return;
    }
    setDeleteOpen(false);
    toast.success('Your account has been deleted');
    navigate('/', { replace: true });
  }

  async function exportData() {
    try {
      const [posts, bookmarks, trusted, listings] = await Promise.all([
        api.listUserPosts(profile.id),
        api.listBookmarks(profile.id),
        api.listTrustedContacts(profile.id),
        api.listMyListings(profile.id),
      ]);
      const pkg = {
        exported_at: new Date().toISOString(),
        app: 'Be Alert',
        profile,
        posts: posts.map((p) => {
          const { author, ...rest } = p;
          void author;
          return rest;
        }),
        bookmarks: bookmarks.map((b) => ({ id: b.id, title: b.title })),
        trusted_contacts: trusted,
        provider_listings: listings,
      };
      const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `be-alert-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Your data export is ready');
    } catch (e) {
      toast.error('Export failed', (e as Error).message);
    }
  }

  return (
    <Section id="privacy" icon={Download} title="Privacy & data">
      <div className="divide-y divide-line">
        <Row title="Download your data" body="Profile, posts, bookmarks, contacts and listings as JSON.">
          <button className="btn-secondary btn-sm" onClick={exportData}>
            <Download className="h-4 w-4" /> Export
          </button>
        </Row>
        <Row title="Blocked users" body={profile.blocked_users.length ? `${profile.blocked_users.length} blocked — their posts are hidden from you.` : 'You haven’t blocked anyone.'}>
          <button className="btn-secondary btn-sm" disabled={!profile.blocked_users.length} onClick={() => save({ blocked_users: [] }, 'Everyone unblocked')}>
            Unblock all
          </button>
        </Row>
        <Row title="Privacy Policy & Terms" body="How Be Alert uses and protects your data.">
          <div className="flex gap-2">
            <Link to="/privacy" className="btn-secondary btn-sm">Privacy</Link>
            <Link to="/terms" className="btn-secondary btn-sm">Terms</Link>
          </div>
        </Row>
        {!profile.is_owner && (
          <Row title="Delete my account" body="Permanently deletes your account, posts, comments, photos and listings. This cannot be undone.">
            <button className="btn-secondary btn-sm text-danger-600" onClick={() => { setDeleteText(''); setDeleteOpen(true); }}>
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          </Row>
        )}
        {demoReason && (
          <Row title="Reset demo data" body="Deletes all demo posts, sign-ins and settings stored in this browser.">
            <button className="btn-secondary btn-sm text-danger-600" onClick={() => setResetOpen(true)}>
              <Trash2 className="h-4 w-4" /> Reset
            </button>
          </Row>
        )}
      </div>
      <ConfirmDialog
        open={deleteOpen}
        title="Delete your account permanently?"
        body="Your profile, posts, comments, photos, bookmarks and listings will be erased from Be Alert. This cannot be undone."
        confirmLabel="Delete forever"
        tone="danger"
        busy={deleting}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => {
          if (deleteText.trim().toUpperCase() !== 'DELETE') {
            toast.error('Type DELETE to confirm');
            return;
          }
          void confirmDelete();
        }}
      >
        <label className="block text-sm font-semibold text-ink-2">
          Type <span className="font-bold text-danger-600">DELETE</span> to confirm
          <input className="input mt-1.5" value={deleteText} onChange={(e) => setDeleteText(e.target.value)} autoComplete="off" placeholder="DELETE" />
        </label>
      </ConfirmDialog>
      <ConfirmDialog
        open={resetOpen}
        title="Reset all demo data?"
        body="Posts you created, comments, bookmarks and settings in this browser will be erased and fresh sample data loaded."
        confirmLabel="Reset"
        tone="danger"
        onClose={() => setResetOpen(false)}
        onConfirm={async () => {
          const { resetDemoData } = await loadDemo();
          resetDemoData();
          window.location.assign(import.meta.env.BASE_URL);
        }}
      />
    </Section>
  );
}
