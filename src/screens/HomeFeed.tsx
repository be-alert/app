import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  ChevronDown,
  Crown,
  Download,
  Clock,
  Flame,
  LocateFixed,
  MapPin,
  Navigation,
  Phone,
  Plus,
  Radar,
  Search,
  ShieldCheck,
  Siren,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react';
import { useApi, useBackend } from '@/data';
import { finalizeFeed } from '@/data/feed';
import { useAuth } from '@/lib/auth';
import { useRadar } from '@/lib/location-context';
import { usePwa } from '@/lib/pwa';
import { useLocalStorage, useQuery } from '@/lib/hooks';
import { CATEGORIES, getCategory, headlineValue } from '@/lib/categories';
import { cn, greeting, telLink, timeAgo } from '@/lib/format';
import { formatDistance } from '@/lib/location';
import type { FeedSort, PostWithRelations } from '@/lib/types';
import { PostCard } from '@/components/post/PostCard';
import { RadarScope } from '@/components/RadarScope';
import { AreaSheet, RadiusSheet } from '@/components/radar/AreaSheet';
import { LogoMark } from '@/components/layout/Logo';
import { MAX_RADIUS_KM } from '@/lib/places';
import { ProvidersCard, ProvidersSection } from '@/components/Providers';
import { CategoryIcon, EmptyState, ErrorState, PostCardSkeleton, Segmented } from '@/components/ui';

const MAX_RADIUS = MAX_RADIUS_KM; // fetch once at the max; radius changes then filter instantly

export function HomeFeed() {
  const api = useApi();
  const { user, profile, isAdmin, isOwner } = useAuth();
  const radar = useRadar();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const category = params.get('category');
  const [sort, setSort] = useLocalStorage<FeedSort>('sr_feed_sort', 'latest');
  const [areaOpen, setAreaOpen] = useState(false);
  const [radiusOpen, setRadiusOpen] = useState(false);

  // Fetch the full 5 km once; radius, category and sort are applied instantly on the client.
  const { data, loading, error, refetch, setData } = useQuery(
    () => api.listPosts({ center: radar.coords, radiusKm: MAX_RADIUS, sort: 'latest' }, user?.id),
    [api, radar.coords.lat, radar.coords.lng, user?.id],
    { scopes: ['posts', 'bookmarks', 'comments', 'rsvps'] }
  );
  const all = useMemo(() => data ?? [], [data]);

  const inRadius = useMemo(() => all.filter((p) => (p.distance_km ?? 0) <= radar.radiusKm), [all, radar.radiusKm]);
  const feed = useMemo(
    () => finalizeFeed(inRadius, { center: radar.coords, radiusKm: radar.radiusKm, category, sort }),
    [inRadius, radar.coords, radar.radiusKm, category, sort]
  );
  const urgent = useMemo(() => inRadius.filter((p) => getCategory(p.category).isUrgent).slice(0, 8), [inRadius]);

  const stats = useMemo(() => {
    const dayAgo = Date.now() - 86_400_000;
    const weekAhead = Date.now() + 7 * 86_400_000;
    return {
      active: inRadius.length,
      urgent: urgent.length,
      today: inRadius.filter((p) => new Date(p.created_at).getTime() > dayAgo).length,
      events: inRadius.filter(
        (p) => p.category === 'local_event' && typeof p.metadata.event_date === 'string' && new Date(p.metadata.event_date).getTime() < weekAhead
      ).length,
    };
  }, [inRadius, urgent.length]);

  const [localPinned] = useLocalStorage<string[]>('sr_pinned', []);
  const chipOrder = useMemo(() => {
    const pinned = profile?.pinned_categories?.length ? profile.pinned_categories : localPinned;
    const counts = new Map<string, number>();
    inRadius.forEach((p) => counts.set(p.category, (counts.get(p.category) ?? 0) + 1));
    return [...CATEGORIES]
      .map((c) => ({ c, n: counts.get(c.slug) ?? 0, pinned: pinned.includes(c.slug) }))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.n - a.n);
  }, [inRadius, profile?.pinned_categories, localPinned]);

  const updatePost = useCallback((p: PostWithRelations) => setData((list) => (list ?? []).map((x) => (x.id === p.id ? { ...x, ...p } : x))), [setData]);
  const setCategory = (slug: string | null) => {
    const next = new URLSearchParams(params);
    if (slug) next.set('category', slug);
    else next.delete('category');
    setParams(next, { replace: true });
  };
  const countFor = useCallback((km: number) => all.filter((p) => (p.distance_km ?? 0) <= km).length, [all]);

  const firstName = profile?.display_name?.split(' ')[0];

  return (
    <div>
      {/* Mobile header */}
      <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/85 pt-safe backdrop-blur-xl lg:hidden">
        <div className="flex h-14 items-center gap-2 px-3">
          <LogoMark size={30} className="ml-1" />
          <button onClick={() => setAreaOpen(true)} className="flex min-w-0 flex-1 items-center gap-1 rounded-xl px-2 py-1.5 text-left hover:bg-surface-2">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-3">Scanning {radar.radiusKm} km around</p>
              <p className="flex items-center gap-1 truncate text-[15px] font-bold text-ink">
                <span className="truncate">{radar.areaLabel}</span>
                <ChevronDown className="h-4 w-4 shrink-0 text-ink-3" />
              </p>
            </div>
          </button>
          {isAdmin && (
            <Link to="/admin/dashboard" className="icon-btn text-amber-500" aria-label={isOwner ? 'Owner Console' : 'Admin Console'}>
              {isOwner ? <Crown className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
            </Link>
          )}
          <Link to="/search" className="icon-btn" aria-label="Search">
            <Search className="h-5 w-5" />
          </Link>
          <Link to="/emergency" className="icon-btn text-danger-600" aria-label="Emergency">
            <Siren className="h-5 w-5" />
          </Link>
        </div>
      </header>

      <div className="mx-auto grid grid-cols-1 max-w-[1180px] gap-8 px-4 pt-4 lg:grid-cols-[minmax(0,1fr)_330px] lg:px-8 lg:pt-8">
        <div className="min-w-0">
          <DemoNotice />
          <ConsoleStrip />
          <InstallCard />

          {/* Hero */}
          <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-600 via-primary-700 to-[#131a4a] p-5 text-white shadow-lift lg:p-7">
            <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-radar-400/20 blur-3xl" />
            <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(circle_at_center,white_1px,transparent_1px)] [background-size:16px_16px]" />
            <div className="relative flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white/70">
                  {greeting()}
                  {firstName ? `, ${firstName}` : ''} 👋
                </p>
                <h1 className="mt-1 text-[22px] font-extrabold leading-tight tracking-tight text-balance lg:text-[30px]">
                  {loading ? 'Scanning your neighbourhood…' : stats.active ? `${stats.active} things happening near you` : 'It’s quiet around here'}
                </h1>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => setAreaOpen(true)}
                    className="hidden h-9 max-w-full items-center gap-1.5 rounded-full bg-white/15 px-3.5 text-[13px] font-semibold backdrop-blur hover:bg-white/25 lg:inline-flex"
                  >
                    <MapPin className="h-4 w-4 shrink-0" />
                    <span className="truncate">{radar.areaLabel}</span>
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                  </button>
                  <button onClick={() => setRadiusOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white/15 px-3.5 text-[13px] font-semibold backdrop-blur hover:bg-white/25">
                    <Radar className="h-4 w-4" /> {radar.radiusKm} km radius
                  </button>
                  {radar.gpsStatus !== 'granted' && radar.area.kind === 'gps' && (
                    <button onClick={radar.requestLocation} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-3.5 text-[13px] font-bold text-primary-700 hover:bg-white/90">
                      <LocateFixed className="h-4 w-4" /> {radar.gpsStatus === 'locating' ? 'Locating…' : 'Use my location'}
                    </button>
                  )}
                </div>
              </div>
              <div className="shrink-0 text-white lg:hidden">
                <RadarScope center={radar.coords} radiusKm={radar.radiusKm} posts={inRadius} size={104} />
              </div>
            </div>
            <div className="relative mt-5 grid grid-cols-4 gap-2 lg:gap-3">
              <HeroStat icon={Radar} label="Active" value={stats.active} loading={loading} />
              <HeroStat icon={Siren} label="Urgent" value={stats.urgent} loading={loading} accent={stats.urgent > 0} />
              <HeroStat icon={Clock} label="Today" value={stats.today} loading={loading} />
              <HeroStat icon={CalendarDays} label="Events" value={stats.events} loading={loading} />
            </div>
          </section>

          {/* Urgent strip */}
          {urgent.length > 0 && (
            <section className="mt-6">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-[17px] font-bold tracking-tight text-ink">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger-500 opacity-60" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-danger-500" />
                  </span>
                  Urgent near you
                </h2>
                <Link to="/emergency" className="text-[13px] font-semibold text-primary-600">
                  Emergency help
                </Link>
              </div>
              <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 no-scrollbar lg:mx-0 lg:px-0">
                {urgent.map((p) => (
                  <UrgentCard key={p.id} post={p} />
                ))}
              </div>
            </section>
          )}

          {!category && (
            <div className="mt-6 lg:hidden">
              <ProvidersSection />
            </div>
          )}

          {/* Filters */}
          <section className="sticky top-14 z-20 -mx-4 mt-6 bg-bg/90 px-4 py-2 backdrop-blur-xl lg:top-0 lg:mx-0 lg:px-0">
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              <button onClick={() => setCategory(null)} className={!category ? 'chip-on' : 'chip-off'}>
                All <span className="opacity-60">{inRadius.length}</span>
              </button>
              {chipOrder.map(({ c, n }) => {
                const active = category === c.slug;
                return (
                  <button key={c.slug} onClick={() => setCategory(active ? null : c.slug)} className={active ? 'chip-on' : 'chip-off'}>
                    <c.icon className="h-4 w-4" style={active ? undefined : { color: c.color }} />
                    {c.short}
                    {n > 0 && <span className="opacity-60">{n}</span>}
                  </button>
                );
              })}
            </div>
          </section>

          <div className="mb-3 mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <p className="whitespace-nowrap text-sm text-ink-2">
              {loading ? (
                'Loading…'
              ) : (
                <>
                  <b className="text-ink">{feed.length}</b> {category ? getCategory(category).short.toLowerCase() : 'posts'} · {radar.radiusKm} km
                </>
              )}
            </p>
            <Segmented
              size="sm"
              value={sort}
              onChange={setSort}
              options={[
                { value: 'latest', label: 'Latest', icon: Sparkles },
                { value: 'nearest', label: 'Nearest', icon: Navigation },
                { value: 'top', label: 'Top', icon: Flame },
              ]}
            />
          </div>

          {error ? (
            <ErrorState message={error} onRetry={refetch} />
          ) : loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <PostCardSkeleton key={i} />
              ))}
            </div>
          ) : feed.length === 0 ? (
            <EmptyState
              icon={Radar}
              title={category ? `No ${getCategory(category).short.toLowerCase()} posts nearby` : 'Nothing on your radar yet'}
              body={
                radar.radiusKm < MAX_RADIUS
                  ? `Try widening your radius, or be the first to post something within ${radar.radiusKm} km.`
                  : 'Be the first to share something with your neighbourhood.'
              }
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  {radar.radiusKm < MAX_RADIUS && (
                    <button className="btn-outline" onClick={() => radar.setRadiusKm(MAX_RADIUS)}>
                      Scan {MAX_RADIUS} km
                    </button>
                  )}
                  <button className="btn-primary" onClick={() => navigate(category ? `/create?category=${category}` : '/create')}>
                    <Plus className="h-4 w-4" /> Create a post
                  </button>
                </div>
              }
            />
          ) : (
            <div className="space-y-3">
              {feed.map((p) => (
                <PostCard key={p.id} post={p} onChange={updatePost} />
              ))}
              <p className="py-6 text-center text-xs font-medium text-ink-3">You’re all caught up within {radar.radiusKm} km ✨</p>
            </div>
          )}
        </div>

        {/* Right rail */}
        <aside className="hidden lg:block">
          <div className="sticky top-8 space-y-5">
            <div className="card p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-ink">Live radar</h3>
                <button onClick={() => setRadiusOpen(true)} className="text-[13px] font-semibold text-primary-600">
                  Adjust
                </button>
              </div>
              <div className="mt-4 flex justify-center text-ink">
                <RadarScope center={radar.coords} radiusKm={radar.radiusKm} posts={inRadius} size={240} onBlipClick={(p) => navigate(`/post/${p.id}`)} />
              </div>
              <Link to="/map" className="btn-secondary mt-4 w-full">
                Open live map <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <CategoryBreakdown posts={inRadius} onPick={setCategory} active={category} />
            <ProvidersCard />
            <EmergencyCard />
            <TrendingCard posts={inRadius} />
          </div>
        </aside>
      </div>

      <AreaSheet open={areaOpen} onClose={() => setAreaOpen(false)} />
      <RadiusSheet open={radiusOpen} onClose={() => setRadiusOpen(false)} countFor={countFor} />
    </div>
  );
}

function HeroStat({ icon: Icon, label, value, loading, accent }: { icon: typeof Radar; label: string; value: number; loading?: boolean; accent?: boolean }) {
  return (
    <div className={cn('rounded-2xl bg-white/10 p-2.5 backdrop-blur lg:p-3.5', accent && 'bg-danger-500/30 ring-1 ring-white/20')}>
      <Icon className="h-4 w-4 text-white/70" />
      <p className="mt-1.5 text-xl font-extrabold tabular-nums leading-none lg:text-2xl">{loading ? '–' : value}</p>
      <p className="mt-1 text-[11px] font-medium text-white/70 lg:text-xs">{label}</p>
    </div>
  );
}

function UrgentCard({ post }: { post: PostWithRelations }) {
  const cat = getCategory(post.category);
  const headline = headlineValue(post.category, post.metadata);
  return (
    <Link
      to={`/post/${post.id}`}
      className="card w-[260px] shrink-0 snap-start overflow-hidden p-3.5 transition hover:shadow-lift"
      style={{ borderTop: `3px solid ${cat.color}` }}
    >
      <div className="flex items-center gap-2.5">
        <CategoryIcon slug={post.category} size={36} />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: cat.color }}>
            {cat.short}
            {headline ? ` · ${headline}` : ''}
          </p>
          <p className="text-xs text-ink-3">
            {timeAgo(post.created_at)} · {formatDistance(post.distance_km)}
          </p>
        </div>
      </div>
      <p className="mt-2.5 line-clamp-2 text-[14px] font-semibold leading-snug text-ink">{post.title}</p>
      {cat.supportsConfirm && (
        <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-ink-2">
          <AlertTriangle className="h-3.5 w-3.5" style={{ color: cat.color }} /> {post.confirm_count} neighbours confirmed
        </p>
      )}
    </Link>
  );
}

function CategoryBreakdown({ posts, onPick, active }: { posts: PostWithRelations[]; onPick(s: string | null): void; active: string | null }) {
  const rows = useMemo(() => {
    const m = new Map<string, number>();
    posts.forEach((p) => m.set(p.category, (m.get(p.category) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [posts]);
  const max = Math.max(1, ...rows.map((r) => r[1]));
  if (!rows.length) return null;
  return (
    <div className="card p-5">
      <h3 className="flex items-center gap-2 font-bold text-ink">
        <TrendingUp className="h-4 w-4 text-primary-600" /> What’s active nearby
      </h3>
      <div className="mt-4 space-y-3">
        {rows.map(([slug, n]) => {
          const c = getCategory(slug);
          return (
            <button key={slug} onClick={() => onPick(active === slug ? null : slug)} className="group block w-full text-left">
              <div className="mb-1 flex items-center justify-between text-[13px]">
                <span className={cn('flex items-center gap-2 font-semibold', active === slug ? 'text-primary-600' : 'text-ink-2 group-hover:text-ink')}>
                  <c.icon className="h-4 w-4" style={{ color: c.color }} /> {c.short}
                </span>
                <span className="font-bold tabular-nums text-ink">{n}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full transition-all" style={{ width: `${(n / max) * 100}%`, background: c.color }} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const QUICK_DIAL = [
  { name: 'Rescue', phone: '1122' },
  { name: 'Police', phone: '15' },
  { name: 'Edhi', phone: '115' },
  { name: 'Fire', phone: '16' },
];

function EmergencyCard() {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between bg-danger-600 px-5 py-3 text-white">
        <h3 className="flex items-center gap-2 font-bold">
          <Siren className="h-4 w-4" /> Emergency
        </h3>
        <Link to="/emergency" className="text-xs font-semibold text-white/85 hover:text-white">
          SOS & contacts →
        </Link>
      </div>
      <div className="grid grid-cols-4 gap-2 p-3">
        {QUICK_DIAL.map((e) => (
          <a key={e.phone} href={telLink(e.phone)} className="flex flex-col items-center rounded-xl p-2 text-center transition hover:bg-surface-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-danger-50 text-danger-600 dark:bg-danger-500/15">
              <Phone className="h-4 w-4" />
            </span>
            <span className="mt-1 text-[15px] font-extrabold text-ink">{e.phone}</span>
            <span className="text-[11px] text-ink-3">{e.name}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

function TrendingCard({ posts }: { posts: PostWithRelations[] }) {
  const top = useMemo(
    () => [...posts].sort((a, b) => b.upvotes - b.downvotes + (b.comment_count ?? 0) - (a.upvotes - a.downvotes + (a.comment_count ?? 0))).slice(0, 4),
    [posts]
  );
  if (!top.length) return null;
  return (
    <div className="card p-5">
      <h3 className="flex items-center gap-2 font-bold text-ink">
        <Flame className="h-4 w-4 text-orange-500" /> Trending
      </h3>
      <ol className="mt-3 space-y-1">
        {top.map((p, i) => (
          <li key={p.id}>
            <Link to={`/post/${p.id}`} className="-mx-2 flex items-start gap-3 rounded-xl p-2 hover:bg-surface-2">
              <span className="mt-0.5 w-4 text-sm font-extrabold text-ink-3">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-ink">{p.title}</p>
                <p className="mt-0.5 text-[11px] text-ink-3">
                  {getCategory(p.category).short} · {p.upvotes - p.downvotes} votes · {p.comment_count ?? 0} replies
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ol>
      <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-surface-2 px-3 py-2 text-xs text-ink-2">
        <ShieldCheck className="h-4 w-4 shrink-0 text-success-600" /> Posts with 3+ reports are hidden automatically.
      </p>
    </div>
  );
}

/** Shown to the owner/admins on the feed: one tap to the management console. */
function ConsoleStrip() {
  const { isAdmin, isOwner } = useAuth();
  if (!isAdmin) return null;
  return (
    <Link
      to="/admin/dashboard"
      className="mb-4 flex items-center gap-3 rounded-2xl border border-amber-400/50 bg-amber-400/10 p-3.5 transition hover:bg-amber-400/20"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-400 text-[#3a2600]">
        {isOwner ? <Crown className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-bold text-ink">{isOwner ? 'You’re the owner of Be Alert' : 'You’re an admin'}</p>
        <p className="text-[13px] text-ink-2">
          {isOwner ? 'Manage every user, post, admin and app setting.' : 'Moderate posts, users and verifications.'} This page is the normal user view.
        </p>
      </div>
      <span className="hidden shrink-0 items-center gap-1 text-sm font-bold text-amber-700 dark:text-amber-300 sm:flex">
        Open {isOwner ? 'Owner' : 'Admin'} Console <ArrowRight className="h-4 w-4" />
      </span>
      <ArrowRight className="h-5 w-5 shrink-0 text-amber-600 sm:hidden" />
    </Link>
  );
}

/** Android phone browsers: point to the Android app on Google Play (dismissible, remembered). */
function InstallCard() {
  const { androidAppUrl } = usePwa();
  const [dismissed, setDismissed] = useLocalStorage('sr_getapp_dismissed', false);
  const isAndroidPhone = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);
  if (!androidAppUrl || !isAndroidPhone || dismissed) return null;
  return (
    <div className="mb-4 flex items-start gap-3 rounded-2xl border border-primary-600/25 bg-primary-600/5 p-3.5 lg:hidden">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-white">
        <Download className="h-5 w-5" />
      </span>
      {/* Button sits under the text so the title keeps the full width on small phones. */}
      <div className="min-w-0 flex-1">
        <p className="font-bold text-ink">Get the Be Alert app</p>
        <p className="text-[13px] text-ink-2">Same account and posts — with GPS alerts on the go.</p>
        <a className="btn-primary btn-sm mt-2.5 inline-flex" href={androidAppUrl} target="_blank" rel="noopener noreferrer">Get app</a>
      </div>
      <button aria-label="Dismiss" className="icon-btn -mr-1 -mt-1 h-8 w-8 shrink-0" onClick={() => setDismissed(true)}>
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function DemoNotice() {
  const { demoReason } = useBackend();
  const [dismissed, setDismissed] = useLocalStorage('sr_demo_notice_dismissed', false);
  if (!demoReason || dismissed) return null;
  const why =
    demoReason === 'unreachable'
      ? 'Your Supabase project couldn’t be reached, so Be Alert is running on sample data.'
      : demoReason === 'forced'
        ? 'Demo mode is switched on (VITE_DATA_MODE=demo).'
        : 'Supabase isn’t configured yet, so Be Alert is running on sample data.';
  return (
    <div className="mb-4 flex items-start gap-3 rounded-2xl border border-warning-500/30 bg-warning-50 p-3.5 text-[13px] text-warning-700 dark:bg-warning-500/10 dark:text-warning-500">
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="flex-1">
        <b>Demo mode.</b> <span className="hidden sm:inline">{why} </span>Everything works and is saved in this browser. Sign in with any email
        using code <b>123456</b>.
      </p>
      <button onClick={() => setDismissed(true)} aria-label="Dismiss" className="-m-1 rounded-lg p-1 hover:bg-warning-500/10">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
