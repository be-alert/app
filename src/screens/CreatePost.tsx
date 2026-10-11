import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  ArrowRight,
  CalendarClock,
  Camera,
  Check,
  Crosshair,
  ImagePlus,
  Loader2,
  Lock,
  MapPin,
  PauseCircle,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { PageHeader, RequireAuth } from '@/components/layout/Page';
import { PostCard } from '@/components/post/PostCard';
import { CategoryIcon, EmptyState, Spinner, Switch, useToast } from '@/components/ui';
import { useApi } from '@/data';
import { useAuth } from '@/lib/auth';
import { useAppSettings } from '@/lib/settings';
import { isNative } from '@/lib/native';
import { useRadar } from '@/lib/location-context';
import { useDebounced } from '@/lib/hooks';
import { categoriesByGroup, formatExpiryRule, getCategory, getExpiryDate, type CategoryField } from '@/lib/categories';
import { reverseGeocode, searchPlaces, type PlaceResult } from '@/services/maps';
import { cn } from '@/lib/format';
import type { Coords, PostWithRelations } from '@/lib/types';

const MiniMap = lazy(() => import('@/components/map/MiniMap').then((m) => ({ default: m.MiniMap })));

const MAX_IMAGES = 6;
const BLOOD = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];

interface Draft {
  category: string;
  title: string;
  description: string;
  metadata: Record<string, unknown>;
  pollOptions: string[];
  existingImages: string[];
  newImages: File[];
  coords: Coords;
  locationLabel: string;
  womenOnly: boolean;
  scheduleOn: boolean;
  scheduledFor: string;
  safetyAck: boolean;
}

export function CreatePost() {
  const { id } = useParams();
  const { user, profile, isAdmin } = useAuth();
  const settings = useAppSettings();
  if (profile?.is_banned) {
    return (
      <>
        <PageHeader title="Create a post" back />
        <EmptyState icon={Ban} title="Posting is disabled" body="Your account is suspended by the moderators. You can still browse your neighbourhood." />
      </>
    );
  }
  if (!settings.posting_enabled && !isAdmin && !id) {
    return (
      <>
        <PageHeader title="Create a post" back />
        <EmptyState
          icon={PauseCircle}
          title="New posts are paused"
          body={settings.announcement ?? 'The app owner has temporarily paused new posts. Please check back soon.'}
        />
      </>
    );
  }
  return user ? (
    <Composer editId={id ?? null} />
  ) : (
    <>
      <PageHeader title="Create a post" back />
      <RequireAuth icon={Plus} title="Share with your neighbourhood" body="Sign in with your email to post alerts, listings, events and more.">
        {null}
      </RequireAuth>
    </>
  );
}

function Composer({ editId }: { editId: string | null }) {
  const api = useApi();
  const { user, profile, isAdmin } = useAuth();
  const settings = useAppSettings();
  const radar = useRadar();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const repostId = params.get('repost');
  const isVerified = profile?.verification_status === 'approved' && (!profile.verification_expiry || new Date(profile.verification_expiry) > new Date());
  /** Why the user can't post in a category right now (owner settings), or null. */
  const blockedReason = (slug: string): string | null => {
    if (isAdmin || editId) return null;
    if (settings.disabled_categories.includes(slug)) return 'Turned off by the app owner';
    if (settings.verified_only_categories.includes(slug) && !isVerified)
      return profile?.verification_status === 'pending' ? 'Your CNIC verification is being reviewed' : 'Providers: verify your CNIC to post here';
    return null;
  };
  /** Provider categories the user can unlock by verifying (unlike ones the owner turned off). */
  const needsVerification = (slug: string) =>
    !isAdmin && !editId && settings.verified_only_categories.includes(slug) && !isVerified && !settings.disabled_categories.includes(slug);
  const rawPreset = params.get('category');
  const presetCategory = rawPreset && !blockedReason(rawPreset) ? rawPreset : null;

  const [loadingSource, setLoadingSource] = useState(Boolean(editId || repostId));
  const [step, setStep] = useState(presetCategory || editId ? 1 : 0);
  const [draft, setDraft] = useState<Draft>(() => ({
    category: presetCategory && getCategory(presetCategory).slug !== 'unknown' ? presetCategory : '',
    title: '',
    description: '',
    metadata: {},
    pollOptions: ['', ''],
    existingImages: [],
    newImages: [],
    coords: radar.coords,
    locationLabel: radar.area.kind === 'gps' && radar.gpsCoords ? radar.areaLabel : radar.area.kind !== 'gps' ? radar.areaLabel : '',
    womenOnly: false,
    scheduleOn: false,
    scheduledFor: '',
    safetyAck: false,
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [source, setSource] = useState<PostWithRelations | null>(null);

  // Prefill for edit / repost.
  useEffect(() => {
    const sid = editId ?? repostId;
    if (!sid) return;
    api.getPost(sid, user?.id).then((p) => {
      setLoadingSource(false);
      if (!p) {
        toast.error('Post not found');
        navigate('/my-posts', { replace: true });
        return;
      }
      if (editId && p.user_id !== user?.id) {
        toast.error('You can only edit your own posts');
        navigate(`/post/${p.id}`, { replace: true });
        return;
      }
      setSource(p);
      setDraft((d) => ({
        ...d,
        category: p.category,
        title: p.title,
        description: p.description ?? '',
        metadata: { ...p.metadata },
        pollOptions: p.poll_options?.map((o) => o.option_text) ?? ['', ''],
        existingImages: p.image_urls,
        coords: { lat: p.lat, lng: p.lng },
        locationLabel: p.location_label ?? '',
        womenOnly: p.women_only,
      }));
      setStep(1);
    });
  }, [api, editId, repostId, user?.id, navigate, toast]);

  const cat = draft.category ? getCategory(draft.category) : null;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setMeta = (k: string, v: unknown) => setDraft((d) => ({ ...d, metadata: { ...d.metadata, [k]: v } }));

  function validate(forStep: number): boolean {
    const e: Record<string, string> = {};
    if (forStep >= 1 && cat) {
      if (draft.title.trim().length < 5) e.title = 'Give your post a clear title (at least 5 characters).';
      for (const f of cat.fields) {
        if (f.type === 'poll_options') {
          const opts = draft.pollOptions.map((o) => o.trim()).filter(Boolean);
          if (opts.length < 2) e.poll_options = 'Add at least 2 options.';
          else if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) e.poll_options = 'Options must be different.';
          continue;
        }
        const v = draft.metadata[f.key];
        if (f.required && (v === undefined || v === null || String(v).trim() === '')) e[f.key] = `${f.label} is required.`;
      }
      if (cat.requiresPhoto && draft.existingImages.length + draft.newImages.length === 0) e.images = 'Add at least one photo for marketplace items.';
    }
    if (forStep >= 2 && cat) {
      if (!draft.locationLabel.trim()) e.locationLabel = 'Add a landmark or area name so neighbours know roughly where.';
      if (draft.scheduleOn) {
        const t = new Date(draft.scheduledFor).getTime();
        if (!draft.scheduledFor || Number.isNaN(t) || t < Date.now() + 5 * 60_000) e.scheduledFor = 'Pick a time at least 5 minutes from now.';
      }
      if (cat.isHighRisk && !draft.safetyAck && !editId) e.safetyAck = 'Please confirm you’ve read the safety guidelines.';
    }
    setErrors(e);
    if (Object.keys(e).length) {
      toast.error('Please check the highlighted fields');
      return false;
    }
    return true;
  }

  async function submit() {
    if (!user || !cat || !validate(2)) return;
    setSubmitting(true);
    try {
      const uploaded = draft.newImages.length ? await api.uploadImages(user.id, draft.newImages) : [];
      const scheduled = draft.scheduleOn ? new Date(draft.scheduledFor).toISOString() : null;
      const base = {
        title: draft.title.trim(),
        description: draft.description.trim(),
        metadata: draft.metadata,
        image_urls: [...draft.existingImages, ...uploaded],
        lat: draft.coords.lat,
        lng: draft.coords.lng,
        location_label: draft.locationLabel.trim(),
        women_only: cat.slug === 'ride_share' ? draft.womenOnly : false,
      };
      if (editId) {
        await api.updatePost(user.id, editId, base);
        toast.success('Post updated');
        navigate(`/post/${editId}`, { replace: true });
      } else {
        const created = await api.createPost(user.id, {
          ...base,
          // Lets the owner/admin console show where activity comes from.
          metadata: { ...base.metadata, _source: isNative ? 'android' : 'web' },
          category: cat.slug,
          expires_at: getExpiryDate(cat.slug, scheduled ? new Date(scheduled) : new Date()),
          scheduled_for: scheduled,
          reposted_from_id: repostId,
          poll_options: cat.slug === 'community_poll' ? draft.pollOptions.map((o) => o.trim()).filter(Boolean) : undefined,
        });
        toast.success(scheduled ? 'Post scheduled' : 'Your post is live! 🎉', scheduled ? 'It will appear in the feed at the scheduled time.' : 'Neighbours around you can see it now.');
        navigate(`/post/${created.id}`, { replace: true });
      }
    } catch (e) {
      toast.error('Could not publish', (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const preview: PostWithRelations | null = useMemo(() => {
    if (!cat || !user) return null;
    const now = new Date().toISOString();
    return {
      id: 'preview',
      user_id: user.id,
      category: cat.slug,
      title: draft.title || cat.titlePlaceholder.replace(/^e\.g\.,\s*/, ''),
      description: draft.description || null,
      metadata: draft.metadata,
      image_urls: draft.existingImages,
      lat: draft.coords.lat,
      lng: draft.coords.lng,
      location_label: draft.locationLabel || null,
      status: 'active',
      is_featured: false,
      women_only: draft.womenOnly,
      expires_at: getExpiryDate(cat.slug),
      scheduled_for: null,
      reposted_from_id: null,
      confirm_count: 0,
      resolve_count: 0,
      report_count: 0,
      upvotes: 0,
      downvotes: 0,
      created_at: now,
      updated_at: now,
      comment_count: 0,
      distance_km: 0,
      poll_options:
        cat.slug === 'community_poll'
          ? draft.pollOptions.filter((o) => o.trim()).map((o, i) => ({ id: `p${i}`, post_id: 'preview', option_text: o, vote_count: 0 }))
          : undefined,
    };
  }, [cat, user, draft]);

  const title = editId ? 'Edit post' : repostId ? 'Repost' : 'Create a post';
  const stepLabels = ['Category', 'Details', 'Location & publish'];

  if (loadingSource) {
    return (
      <>
        <PageHeader title={title} back />
        <Spinner className="mx-auto mt-16" />
      </>
    );
  }

  return (
    <>
      <PageHeader title={title} subtitle={cat ? cat.description : 'What would you like to share with your neighbourhood?'} back />
      <div className="mx-auto grid grid-cols-1 max-w-6xl gap-8 px-4 pt-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:px-8 lg:pt-6">
        <div className="min-w-0">
          {/* Stepper */}
          <ol className="mb-5 flex items-center gap-2">
            {stepLabels.map((l, i) => (
              <li key={l} className="flex flex-1 items-center gap-2">
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition',
                    i < step ? 'bg-success-600 text-white' : i === step ? 'bg-primary-600 text-white' : 'bg-surface-2 text-ink-3'
                  )}
                >
                  {i < step ? <Check className="h-4 w-4" /> : i + 1}
                </span>
                <span className={cn('hidden truncate text-[13px] font-semibold sm:block', i === step ? 'text-ink' : 'text-ink-3')}>{l}</span>
                {i < 2 && <span className="h-px flex-1 bg-line" />}
              </li>
            ))}
          </ol>

          {step === 0 && (
            <div className="space-y-6">
              {categoriesByGroup().map((g) => (
                <section key={g.group}>
                  <p className="eyebrow mb-2.5">{g.label}</p>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {g.items.map((c) => {
                      const blocked = blockedReason(c.slug);
                      const verifiedOnly = settings.verified_only_categories.includes(c.slug);
                      if (settings.disabled_categories.includes(c.slug) && !isAdmin) return null;
                      return (
                        <button
                          key={c.slug}
                          disabled={Boolean(blocked) && !needsVerification(c.slug)}
                          title={blocked ?? undefined}
                          onClick={() => {
                            if (needsVerification(c.slug)) {
                              if (profile?.verification_status === 'pending') {
                                toast.info('Verification under review', 'You can post here as soon as a moderator approves your CNIC.');
                              } else {
                                toast.info('Verify your CNIC first', `${c.label} is for verified providers. It takes 2 minutes.`);
                                navigate('/profile#verification');
                              }
                              return;
                            }
                            set('category', c.slug);
                            setStep(1);
                          }}
                          className={cn(
                            'card flex items-center gap-3 p-3.5 text-left transition hover:shadow-lift disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-card',
                            draft.category === c.slug && 'ring-2 ring-primary-500'
                          )}
                        >
                          <CategoryIcon slug={c.slug} size={44} />
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-ink">{c.label}</p>
                            <p className="line-clamp-2 text-xs text-ink-2">{blocked ?? c.description}</p>
                          </div>
                          {verifiedOnly && (
                            <span className="shrink-0 rounded-full bg-primary-600/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary-700 dark:text-primary-300">
                              {blocked ? <Lock className="inline h-3 w-3" /> : 'Verified'}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}

          {step === 1 && cat && (
            <div className="card space-y-5 p-5 lg:p-6">
              <div className="flex items-center gap-3">
                <CategoryIcon slug={cat.slug} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-ink">{cat.label}</p>
                  <p className="text-xs text-ink-3">{formatExpiryRule(cat.autoExpireMinutes)}</p>
                </div>
                {!editId && (
                  <button className="btn-ghost btn-sm" onClick={() => setStep(0)}>
                    Change
                  </button>
                )}
              </div>

              <Field label="Title" error={errors.title} hint={`${draft.title.length}/120`}>
                <input className="input" maxLength={120} placeholder={cat.titlePlaceholder} value={draft.title} onChange={(e) => set('title', e.target.value)} />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                {cat.fields.map((f) => (
                  <div key={f.key} className={cn(f.type === 'poll_options' || f.type === 'blood_type' || f.type === 'textarea' ? 'sm:col-span-2' : '')}>
                    <DynamicField
                      field={f}
                      value={draft.metadata[f.key]}
                      onChange={(v) => setMeta(f.key, v)}
                      error={errors[f.key]}
                      pollOptions={draft.pollOptions}
                      setPollOptions={(o) => set('pollOptions', o)}
                      disabled={Boolean(editId) && f.type === 'poll_options'}
                    />
                  </div>
                ))}
              </div>

              <Field label="Description" hint={`${draft.description.length}/2000`}>
                <textarea
                  className="input"
                  rows={5}
                  maxLength={2000}
                  placeholder="Add helpful details — what, when, conditions, how to reach you…"
                  value={draft.description}
                  onChange={(e) => set('description', e.target.value)}
                />
              </Field>

              <ImagePicker
                existing={draft.existingImages}
                files={draft.newImages}
                onExisting={(v) => set('existingImages', v)}
                onFiles={(v) => set('newImages', v)}
                required={cat.requiresPhoto}
                error={errors.images}
              />
            </div>
          )}

          {step === 2 && cat && (
            <div className="space-y-4">
              <LocationPicker
                coords={draft.coords}
                label={draft.locationLabel}
                category={cat.slug}
                error={errors.locationLabel}
                onCoords={(c) => set('coords', c)}
                onLabel={(l) => set('locationLabel', l)}
              />

              <div className="card divide-y divide-line">
                {cat.slug === 'ride_share' && (
                  <div className="flex items-center gap-3 p-4">
                    <div className="flex-1">
                      <p className="font-semibold text-ink">Women-only carpool</p>
                      <p className="text-xs text-ink-2">Only women riders will be accepted for this ride.</p>
                    </div>
                    <Switch label="Women only" checked={draft.womenOnly} onChange={(v) => set('womenOnly', v)} />
                  </div>
                )}
                {!editId && (
                  <div className="p-4">
                    <div className="flex items-center gap-3">
                      <CalendarClock className="h-5 w-5 text-ink-3" />
                      <div className="flex-1">
                        <p className="font-semibold text-ink">Schedule for later</p>
                        <p className="text-xs text-ink-2">Publish automatically at a future time.</p>
                      </div>
                      <Switch label="Schedule" checked={draft.scheduleOn} onChange={(v) => set('scheduleOn', v)} />
                    </div>
                    {draft.scheduleOn && (
                      <div className="mt-3">
                        <input
                          type="datetime-local"
                          className="input"
                          value={draft.scheduledFor}
                          min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000 + 10 * 60000).toISOString().slice(0, 16)}
                          onChange={(e) => set('scheduledFor', e.target.value)}
                        />
                        {errors.scheduledFor && <p className="mt-1.5 text-xs font-medium text-danger-600">{errors.scheduledFor}</p>}
                      </div>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-3 p-4 text-[13px] text-ink-2">
                  <ShieldCheck className="h-5 w-5 shrink-0 text-success-600" />
                  <span>
                    {formatExpiryRule(cat.autoExpireMinutes)}. Neighbours nearby will see it. Your email stays private.
                  </span>
                </div>
              </div>

              {cat.safetyTips && !editId && (
                <div className={cn('card border-amber-500/40 bg-amber-500/5 p-4', errors.safetyAck && 'ring-2 ring-danger-500')}>
                  <p className="flex items-center gap-2 font-bold text-ink">
                    <AlertTriangle className="h-4 w-4 text-amber-600" /> Safety guidelines
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {cat.safetyTips.map((t) => (
                      <li key={t} className="flex gap-2 text-[13px] text-ink-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                        {t}
                      </li>
                    ))}
                  </ul>
                  {cat.isHighRisk && (
                    <label className="mt-3 flex cursor-pointer items-center gap-2.5 rounded-xl bg-surface px-3 py-2.5 text-[13px] font-semibold text-ink">
                      <input type="checkbox" className="h-4 w-4 accent-primary-600" checked={draft.safetyAck} onChange={(e) => set('safetyAck', e.target.checked)} />
                      I’ve read these and my post follows them.
                    </label>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Footer nav */}
          {step > 0 && (
            <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 -mx-4 mt-6 flex items-center gap-3 border-t border-line bg-bg/90 px-4 py-3 backdrop-blur-xl lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:backdrop-blur-none">
              <button className="btn-outline" onClick={() => setStep(step - 1)} disabled={submitting || (step === 1 && Boolean(editId))}>
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
              {step === 1 ? (
                <button className="btn-primary ml-auto min-w-[140px]" onClick={() => validate(1) && setStep(2)}>
                  Continue <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button className="btn-primary ml-auto min-w-[160px]" onClick={submit} disabled={submitting}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {submitting ? 'Publishing…' : editId ? 'Save changes' : draft.scheduleOn ? 'Schedule post' : 'Publish post'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Live preview */}
        <aside className="hidden lg:block">
          <div className="sticky top-8">
            <p className="eyebrow mb-3">Live preview</p>
            {preview ? (
              <div className="pointer-events-none">
                <PostCard post={preview} onChange={() => {}} />
              </div>
            ) : (
              <div className="card flex h-56 items-center justify-center p-6 text-center text-sm text-ink-3">Pick a category to see how your post will look.</div>
            )}
            {source && repostId && <p className="mt-3 text-xs text-ink-3">Reposting “{source.title}” with a fresh expiry.</p>}
          </div>
        </aside>
      </div>
    </>
  );
}

function Field({ label, error, hint, children, required }: { label: string; error?: string; hint?: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="label">
          {label}
          {required && <span className="text-danger-500"> *</span>}
        </label>
        {hint && <span className="text-[11px] text-ink-3">{hint}</span>}
      </div>
      {children}
      {error && <p className="mt-1.5 text-xs font-medium text-danger-600">{error}</p>}
    </div>
  );
}

function DynamicField({
  field: f,
  value,
  onChange,
  error,
  pollOptions,
  setPollOptions,
  disabled,
}: {
  field: CategoryField;
  value: unknown;
  onChange(v: unknown): void;
  error?: string;
  pollOptions: string[];
  setPollOptions(o: string[]): void;
  disabled?: boolean;
}) {
  const str = value === undefined || value === null ? '' : String(value);
  switch (f.type) {
    case 'select':
      return (
        <Field label={f.label} error={error} required={f.required}>
          <select className="input" value={str} onChange={(e) => onChange(e.target.value)}>
            <option value="">Select…</option>
            {f.options?.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </Field>
      );
    case 'blood_type':
      return (
        <Field label={f.label} error={error} required={f.required}>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
            {BLOOD.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => onChange(b)}
                className={cn('h-12 rounded-xl border text-base font-extrabold transition', str === b ? 'border-danger-600 bg-danger-600 text-white' : 'border-line text-ink hover:border-danger-500')}
              >
                {b}
              </button>
            ))}
          </div>
        </Field>
      );
    case 'toggle':
      return (
        <div className="flex h-full items-center justify-between gap-3 rounded-xl border border-line px-3.5 py-3">
          <span className="text-sm font-semibold text-ink">{f.label}</span>
          <Switch label={f.label} checked={Boolean(value)} onChange={onChange} />
        </div>
      );
    case 'price':
      return (
        <Field label={f.label} error={error} required={f.required}>
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-ink-3">Rs</span>
            <input
              className="input pl-10"
              inputMode="numeric"
              placeholder={f.placeholder?.replace(/^e\.g\.,\s*/, '')}
              value={str ? new Intl.NumberFormat('en-PK').format(Number(str)) : ''}
              onChange={(e) => {
                const n = e.target.value.replace(/\D/g, '');
                onChange(n ? Number(n) : '');
              }}
            />
          </div>
        </Field>
      );
    case 'number':
      return (
        <Field label={f.label} error={error} required={f.required}>
          <input className="input" inputMode="numeric" placeholder={f.placeholder} value={str} onChange={(e) => onChange(e.target.value.replace(/\D/g, '') ? Number(e.target.value.replace(/\D/g, '')) : '')} />
        </Field>
      );
    case 'date':
    case 'time':
      return (
        <Field label={f.label} error={error} required={f.required}>
          <input type={f.type} className="input" value={str} onChange={(e) => onChange(e.target.value)} />
        </Field>
      );
    case 'phone':
      return (
        <Field label={f.label} error={error} required={f.required}>
          <input className="input" inputMode="tel" placeholder={f.placeholder} value={str} onChange={(e) => onChange(e.target.value)} />
        </Field>
      );
    case 'textarea':
      return (
        <Field label={f.label} error={error} required={f.required}>
          <textarea className="input" rows={3} placeholder={f.placeholder} value={str} onChange={(e) => onChange(e.target.value)} />
        </Field>
      );
    case 'poll_options':
      return (
        <Field label={f.label} error={error} required hint={disabled ? 'Options can’t be changed after publishing' : f.helper}>
          <div className="space-y-2">
            {pollOptions.map((o, i) => (
              <div key={i} className="flex gap-2">
                <input
                  className="input"
                  disabled={disabled}
                  maxLength={80}
                  placeholder={`Option ${i + 1}`}
                  value={o}
                  onChange={(e) => setPollOptions(pollOptions.map((x, k) => (k === i ? e.target.value : x)))}
                />
                {pollOptions.length > 2 && !disabled && (
                  <button type="button" className="icon-btn h-11 w-11 shrink-0" aria-label="Remove option" onClick={() => setPollOptions(pollOptions.filter((_, k) => k !== i))}>
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
            {pollOptions.length < 6 && !disabled && (
              <button type="button" className="btn-ghost btn-sm" onClick={() => setPollOptions([...pollOptions, ''])}>
                <Plus className="h-4 w-4" /> Add option
              </button>
            )}
          </div>
        </Field>
      );
    default:
      return (
        <Field label={f.label} error={error} required={f.required}>
          <input className="input" placeholder={f.placeholder} value={str} onChange={(e) => onChange(e.target.value)} />
        </Field>
      );
  }
}

function ImagePicker({
  existing,
  files,
  onExisting,
  onFiles,
  required,
  error,
}: {
  existing: string[];
  files: File[];
  onExisting(v: string[]): void;
  onFiles(v: File[]): void;
  required: boolean;
  error?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);
  const total = existing.length + files.length;

  return (
    <Field label={`Photos${required ? '' : ' (optional)'}`} error={error} required={required} hint={`${total}/${MAX_IMAGES}`}>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {existing.map((u) => (
          <Thumb key={u} src={u} onRemove={() => onExisting(existing.filter((x) => x !== u))} />
        ))}
        {previews.map((u, i) => (
          <Thumb key={u} src={u} onRemove={() => onFiles(files.filter((_, k) => k !== i))} />
        ))}
        {total < MAX_IMAGES && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line text-ink-3 transition hover:border-primary-500 hover:text-primary-600"
          >
            {total ? <ImagePlus className="h-6 w-6" /> : <Camera className="h-6 w-6" />}
            <span className="text-xs font-semibold">Add photo</span>
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith('image/') && f.size < 15 * 1024 * 1024);
          onFiles([...files, ...picked].slice(0, MAX_IMAGES - existing.length));
          e.target.value = '';
        }}
      />
    </Field>
  );
}

function Thumb({ src, onRemove }: { src: string; onRemove(): void }) {
  return (
    <div className="relative aspect-square overflow-hidden rounded-xl bg-surface-2">
      <img src={src} alt="" className="h-full w-full object-cover" />
      <button type="button" onClick={onRemove} aria-label="Remove photo" className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function LocationPicker({
  coords,
  label,
  category,
  error,
  onCoords,
  onLabel,
}: {
  coords: Coords;
  label: string;
  category: string;
  error?: string;
  onCoords(c: Coords): void;
  onLabel(l: string): void;
}) {
  const radar = useRadar();
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 450);
  const [results, setResults] = useState<PlaceResult[]>([]);
  const labelTouched = useRef(Boolean(label));

  useEffect(() => {
    let alive = true;
    if (dq.trim().length < 3) {
      setResults([]);
      return;
    }
    searchPlaces(dq).then((r) => alive && setResults(r));
    return () => {
      alive = false;
    };
  }, [dq]);

  const move = (c: Coords, name?: string) => {
    onCoords(c);
    if (name) {
      onLabel(name);
      labelTouched.current = true;
    } else if (!labelTouched.current) {
      reverseGeocode(c).then((r) => r && !labelTouched.current && onLabel(r.label));
    }
  };

  return (
    <div className="card overflow-hidden">
      <div className="relative">
        <Suspense fallback={<div className="skeleton h-64 rounded-none" />}>
          <MiniMap center={coords} category={category} you={radar.gpsCoords} zoom={15} className="h-64" onPick={(c) => move(c)} />
        </Suspense>
        <div className="pointer-events-none absolute inset-x-3 top-3 z-[400]">
          <div className="pointer-events-auto relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
            <input className="input bg-surface/95 pl-10 shadow-lift backdrop-blur" placeholder="Search a place or landmark…" value={q} onChange={(e) => setQ(e.target.value)} />
            {results.length > 0 && (
              <ul className="absolute inset-x-0 top-12 max-h-60 overflow-y-auto rounded-xl border border-line bg-surface shadow-lift">
                {results.map((r) => (
                  <li key={`${r.lat},${r.lng}`}>
                    <button
                      type="button"
                      className="flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left hover:bg-surface-2"
                      onClick={() => {
                        move({ lat: r.lat, lng: r.lng }, r.label);
                        setQ('');
                        setResults([]);
                      }}
                    >
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-ink">{r.label}</span>
                        <span className="block truncate text-xs text-ink-3">{r.detail}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {radar.gpsCoords && (
          <button
            type="button"
            onClick={() => move(radar.gpsCoords!)}
            className="absolute bottom-3 right-3 z-[400] inline-flex h-10 items-center gap-1.5 rounded-xl bg-surface px-3 text-[13px] font-semibold text-ink shadow-lift"
          >
            <Crosshair className="h-4 w-4 text-primary-600" /> My location
          </button>
        )}
      </div>
      <div className="p-4">
        <Field label="Area / landmark shown on the post" error={error} required>
          <input
            className="input"
            placeholder="e.g., Near Block 5 park gate"
            value={label}
            maxLength={80}
            onChange={(e) => {
              labelTouched.current = true;
              onLabel(e.target.value);
            }}
          />
        </Field>
        <p className="mt-2 text-xs text-ink-3">Tap the map or drag the pin to adjust. Use a nearby landmark rather than your exact address.</p>
      </div>
    </div>
  );
}
