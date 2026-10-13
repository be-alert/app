import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Globe,
  Smartphone,
  ArrowLeft,
  BadgeCheck,
  Ban,
  CheckCircle2,
  Crown,
  Eye,
  Megaphone,
  SlidersHorizontal,
  UserMinus,
  UserPlus,
  EyeOff,
  FileText,
  Flag,
  LayoutDashboard,
  LogOut,
  Moon,
  Pencil,
  Phone,
  Plus,
  ScrollText,
  Search,
  ShieldCheck,
  Siren,
  Star,
  Store,
  Sun,
  Trash2,
  UserCheck,
  Users,
  XCircle,
  CarFront,
} from 'lucide-react';
import { LogoMark } from '@/components/layout/Logo';
import { Avatar, Badge, CategoryIcon, ConfirmDialog, EmptyState, Segmented, Sheet, Spinner, Switch, TrustRing, VerifiedBadge, useToast } from '@/components/ui';
import { useAppSettings } from '@/lib/settings';
import { CATEGORIES, categoriesByGroup } from '@/lib/categories';
import { useApi, useBackend } from '@/data';
import type { ModerationAction } from '@/data/api';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { useDebounced, useQuery } from '@/lib/hooks';
import { useRadar } from '@/lib/location-context';
import { getCategory } from '@/lib/categories';
import { cn, formatDate, formatDateTime, maskCnic, timeAgo } from '@/lib/format';
import type { AdminOverview, AdminUser, AdminUserFilter, AppSettings, EmergencyContact, PostWithRelations, ProviderListing, VerificationRequest } from '@/lib/types';
import { CategoryBars, DailyBars } from './charts';
import { RadiusSelect } from '@/components/radar/Pickers';

type Tab = 'overview' | 'activity' | 'moderation' | 'users' | 'verification' | 'listings' | 'emergency' | 'audit' | 'team' | 'settings';

const TABS: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'activity', label: 'Live activity', icon: Activity },
  { id: 'moderation', label: 'Moderation', icon: Flag },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'verification', label: 'Verification', icon: UserCheck },
  { id: 'listings', label: 'Listings', icon: Store },
  { id: 'emergency', label: 'Emergency', icon: Siren },
  { id: 'audit', label: 'Audit log', icon: ScrollText },
];

/** Owner-only areas. */
const OWNER_TABS: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'team', label: 'Team & roles', icon: Crown },
  { id: 'settings', label: 'App settings', icon: SlidersHorizontal },
];

export function AdminDashboard() {
  const api = useApi();
  const { profile, signOut, isOwner } = useAuth();
  const { resolved, toggle } = useTheme();
  const { demoReason } = useBackend();
  const [tab, setTab] = useState<Tab>('overview');
  const overview = useQuery(() => api.admin.overview(), [api], { scopes: ['posts', 'admin'] });
  const o = overview.data;
  const badges: Partial<Record<Tab, number>> = o
    ? { moderation: o.reportedPosts, verification: o.pendingVerifications + (o.pendingDrivers ?? 0), listings: o.pendingListings }
    : {};
  const allTabs = isOwner ? [...TABS, ...OWNER_TABS] : TABS;
  const current = allTabs.find((t) => t.id === tab) ?? TABS[0];

  return (
    <div className="min-h-dvh bg-bg">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-[#0b1024] text-white lg:flex">
        <div className="flex h-[72px] items-center gap-2.5 px-5">
          <LogoMark size={32} />
          <div>
            <p className="text-[15px] font-extrabold leading-none tracking-tight">Be Alert</p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-white/50">{isOwner ? 'Owner console' : 'Admin console'}</p>
          </div>
        </div>
        <nav className="mt-2 flex-1 space-y-0.5 overflow-y-auto px-3 no-scrollbar">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex h-11 w-full items-center gap-3 rounded-xl px-3 text-[14px] font-semibold transition',
                tab === t.id ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'
              )}
            >
              <t.icon className="h-[18px] w-[18px]" /> {t.label}
              {!!badges[t.id] && <span className="ml-auto rounded-full bg-danger-500 px-2 py-0.5 text-[11px] font-bold">{badges[t.id]}</span>}
            </button>
          ))}
          {isOwner && (
            <>
              <p className="px-3 pb-1.5 pt-5 text-[11px] font-bold uppercase tracking-wider text-amber-400/80">Owner</p>
              {OWNER_TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    'flex h-11 w-full items-center gap-3 rounded-xl px-3 text-[14px] font-semibold transition',
                    tab === t.id ? 'bg-amber-400/15 text-amber-300' : 'text-white/60 hover:bg-white/5 hover:text-white'
                  )}
                >
                  <t.icon className="h-[18px] w-[18px]" /> {t.label}
                </button>
              ))}
            </>
          )}
        </nav>
        <div className="space-y-2 border-t border-white/10 p-4">
          {demoReason && <p className="rounded-lg bg-warning-500/15 px-3 py-2 text-xs font-medium text-warning-500">Demo mode — local data</p>}
          <div className="flex items-center gap-2.5">
            <Avatar name={profile?.display_name || 'Admin'} size={34} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{profile?.display_name || 'Admin'}</p>
              <p className={cn('flex items-center gap-1 text-xs', isOwner ? 'text-amber-300' : 'text-white/50')}>
                {isOwner && <Crown className="h-3 w-3" />}
                {isOwner ? 'Owner' : 'Administrator'}
              </p>
            </div>
            <button onClick={signOut} className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-20 border-b border-line bg-bg/85 pt-safe backdrop-blur-xl">
          <div className="flex h-14 items-center gap-2 px-3 lg:h-[72px] lg:px-8">
            <LogoMark size={28} className="lg:hidden" />
            <h1 className="flex-1 truncate text-[17px] font-extrabold tracking-tight text-ink lg:text-2xl">{current.label}</h1>
            <Link to="/" className="btn-ghost btn-sm">
              <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Back to app</span>
            </Link>
            <button onClick={toggle} className="icon-btn" aria-label="Toggle theme">
              {resolved === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <button onClick={signOut} className="icon-btn lg:hidden" aria-label="Sign out">
              <LogOut className="h-5 w-5" />
            </button>
          </div>
          <div className="flex gap-1.5 overflow-x-auto px-3 pb-2.5 no-scrollbar lg:hidden">
            {allTabs.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} className={tab === t.id ? 'chip-on' : 'chip-off'}>
                <t.icon className="h-4 w-4" /> {t.label}
                {!!badges[t.id] && <span className="rounded-full bg-danger-500 px-1.5 text-[10px] text-white">{badges[t.id]}</span>}
              </button>
            ))}
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-5 lg:px-8 lg:py-8">
          {tab === 'overview' && <Overview data={o} loading={overview.loading} goto={setTab} />}
          {tab === 'activity' && <LiveActivity />}
          {tab === 'moderation' && <Moderation />}
          {tab === 'users' && <UsersAdmin />}
          {tab === 'verification' && <Verification />}
          {tab === 'listings' && <Listings />}
          {tab === 'emergency' && <EmergencyAdmin />}
          {tab === 'audit' && <Audit />}
          {tab === 'team' && isOwner && <TeamAdmin />}
          {tab === 'settings' && isOwner && <SettingsAdmin />}
        </main>
      </div>
    </div>
  );
}

function useAdminAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return {
    busy,
    run: async (label: string, fn: () => Promise<void>) => {
      setBusy(true);
      try {
        await fn();
        toast.success(label);
        return true;
      } catch (e) {
        toast.error('Action failed', (e as Error).message);
        return false;
      } finally {
        setBusy(false);
      }
    },
  };
}

// ── Overview ────────────────────────────────────────────────────────────────

function Kpi({ icon: Icon, label, value, hint, tone = 'neutral', onClick }: { icon: typeof Users; label: string; value: number | string; hint?: string; tone?: 'neutral' | 'danger' | 'warning'; onClick?(): void }) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp onClick={onClick} className={cn('card p-4 text-left transition lg:p-5', onClick && 'hover:shadow-lift')}>
      <div className="flex items-center justify-between">
        <span
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-xl',
            tone === 'danger' ? 'bg-danger-50 text-danger-600 dark:bg-danger-500/15' : tone === 'warning' ? 'bg-warning-50 text-warning-600 dark:bg-warning-500/15' : 'bg-primary-600/10 text-primary-600'
          )}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
        {hint && <span className="text-[11px] font-semibold text-ink-3">{hint}</span>}
      </div>
      <p className="mt-3 text-2xl font-extrabold tabular-nums tracking-tight text-ink lg:text-[28px]">{value}</p>
      <p className="text-[13px] font-medium text-ink-2">{label}</p>
    </Comp>
  );
}

function Overview({ data, loading, goto }: { data: AdminOverview | undefined; loading: boolean; goto(t: Tab): void }) {
  const api = useApi();
  const reported = useQuery(() => api.admin.listPosts('reported'), [api], { scopes: ['posts', 'admin'] });
  const activity = useQuery(() => api.admin.auditLog(), [api], { scopes: ['posts', 'admin', 'emergency'] });
  if (loading || !data) return <Spinner className="mx-auto mt-16 h-6 w-6" />;
  const weekTotal = data.postsByDay.slice(-7).reduce((s, d) => s + d.count, 0);
  const prevWeek = data.postsByDay.slice(0, 7).reduce((s, d) => s + d.count, 0);
  const delta = prevWeek ? Math.round(((weekTotal - prevWeek) / prevWeek) * 100) : 0;

  const todo = [
    { label: 'Review reported posts', n: data.reportedPosts, tab: 'moderation' as Tab, icon: Flag },
    { label: 'Verify CNIC requests', n: data.pendingVerifications, tab: 'verification' as Tab, icon: UserCheck },
    { label: 'Check driving licences', n: data.pendingDrivers ?? 0, tab: 'verification' as Tab, icon: CarFront },
    { label: 'Approve business listings', n: data.pendingListings, tab: 'listings' as Tab, icon: Store },
  ];
  const open = todo.reduce((s, t) => s + t.n, 0);

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#131a4a] via-primary-800 to-primary-600 p-5 text-white lg:p-6">
        <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(circle_at_center,white_1px,transparent_1px)] [background-size:16px_16px]" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center">
          <div className="flex-1">
            <p className="text-sm text-white/70">{formatDate(new Date().toISOString(), { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            <h2 className="mt-1 text-2xl font-extrabold tracking-tight">{open ? `${open} item${open === 1 ? '' : 's'} need your review` : 'All caught up 🎉'}</h2>
            <p className="mt-1 text-sm text-white/70">Moderation keeps Be Alert safe and trusted.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3 lg:w-[560px]">
            {todo.map((t) => (
              <button key={t.tab} onClick={() => goto(t.tab)} className="flex items-center gap-3 rounded-2xl bg-white/10 p-3 text-left backdrop-blur transition hover:bg-white/20">
                <t.icon className="h-5 w-5 shrink-0 text-white/80" />
                <span className="min-w-0 flex-1 text-[13px] font-semibold leading-tight">{t.label}</span>
                <span className={cn('rounded-full px-2 py-0.5 text-xs font-bold', t.n ? 'bg-white text-primary-700' : 'bg-white/15 text-white/70')}>{t.n}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <Kpi icon={FileText} label="Active posts" value={data.activePosts} hint={`${data.totalPosts} total`} />
        <Kpi icon={Users} label="Registered users" value={data.totalUsers.toLocaleString()} hint={data.suspendedUsers ? `${data.suspendedUsers} suspended` : undefined} onClick={() => goto('users')} />
        <Kpi icon={Flag} label="Reported, awaiting review" value={data.reportedPosts} hint={`${data.hiddenPosts} auto-hidden`} tone={data.reportedPosts ? 'danger' : 'neutral'} onClick={() => goto('moderation')} />
        <Kpi
          icon={UserCheck}
          label="Pending approvals"
          value={data.pendingVerifications + (data.pendingDrivers ?? 0) + data.pendingListings}
          hint={`${data.pendingVerifications} CNIC · ${data.pendingDrivers ?? 0} licences · ${data.pendingListings} listings`}
          tone={data.pendingVerifications + (data.pendingDrivers ?? 0) + data.pendingListings ? 'warning' : 'neutral'}
          onClick={() => goto('verification')}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-6">
        <section className="card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-bold text-ink">New posts per day</h2>
              <p className="text-[13px] text-ink-2">Last 14 days</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-extrabold tabular-nums text-ink">{weekTotal}</p>
              <p className={cn('text-xs font-semibold', delta >= 0 ? 'text-success-600' : 'text-danger-600')}>
                {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}% vs prior week
              </p>
            </div>
          </div>
          <div className="mt-4">
            <DailyBars data={data.postsByDay} />
          </div>
        </section>
        <section className="card p-5">
          <h2 className="font-bold text-ink">Posts by category</h2>
          <p className="mb-4 text-[13px] text-ink-2">All time</p>
          <CategoryBars data={data.postsByCategory} />
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4">
            <h2 className="flex items-center gap-2 font-bold text-ink">
              <AlertTriangle className="h-4 w-4 text-danger-600" /> Needs attention
            </h2>
            <button className="text-[13px] font-semibold text-primary-600" onClick={() => goto('moderation')}>
              Open moderation →
            </button>
          </div>
          {reported.loading ? (
            <Spinner className="mx-auto mb-6" />
          ) : !reported.data?.length ? (
            <p className="px-5 pb-5 text-sm text-ink-3">No reported posts. The neighbourhood is behaving. ✨</p>
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {reported.data.slice(0, 5).map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-5 py-3">
                  <CategoryIcon slug={p.category} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{p.title}</p>
                    <p className="text-xs text-ink-3">
                      {p.author?.display_name ?? 'Unknown'} · {timeAgo(p.created_at)}
                    </p>
                  </div>
                  <Badge tone="danger">
                    <Flag className="h-3 w-3" /> {p.report_count}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4">
            <h2 className="flex items-center gap-2 font-bold text-ink">
              <ScrollText className="h-4 w-4 text-primary-600" /> Recent admin activity
            </h2>
            <button className="text-[13px] font-semibold text-primary-600" onClick={() => goto('audit')}>
              Full audit log →
            </button>
          </div>
          {!activity.data?.length ? (
            <p className="px-5 pb-5 text-sm text-ink-3">No admin actions yet.</p>
          ) : (
            <ol className="relative space-y-4 border-t border-line px-5 py-4">
              {activity.data.slice(0, 5).map((a) => (
                <li key={a.id} className="flex gap-3">
                  <span
                    className={cn(
                      'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full',
                      /^(delete|reject|hide|ban|revoke)/.test(a.action) ? 'bg-danger-500' : /^(approve|unban)/.test(a.action) ? 'bg-success-500' : 'bg-primary-500'
                    )}
                  />
                  <div className="min-w-0">
                    <p className="text-sm text-ink">
                      <b>{a.admin_name ?? 'Admin'}</b> <span className="text-ink-2">{a.action.replace(/_/g, ' ')}</span>
                      {typeof a.details?.name === 'string' || typeof a.details?.title === 'string' || typeof a.details?.business === 'string' ? (
                        <span className="text-ink"> · {String(a.details.name ?? a.details.title ?? a.details.business)}</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-ink-3">{timeAgo(a.created_at)}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

// ── Live activity ───────────────────────────────────────────────────────────

const REFRESH_MS = 15_000;

function SourceBadge({ source }: { source: unknown }) {
  if (source === 'android')
    return (
      <Badge className="bg-success-500/15 text-success-700 dark:text-success-500">
        <Smartphone className="h-3 w-3" /> App
      </Badge>
    );
  if (source === 'web')
    return (
      <Badge tone="primary">
        <Globe className="h-3 w-3" /> Web
      </Badge>
    );
  return null;
}

/** What's happening right now across the Android app and website (auto-refreshes). */
function LiveActivity() {
  const api = useApi();
  const posts = useQuery(() => api.admin.listPosts('all'), [api], { scopes: ['posts', 'admin'] });
  const users = useQuery(() => api.admin.listUsers('', 'all'), [api], { scopes: ['admin', 'profile'] });
  const [updated, setUpdated] = useState(Date.now());
  const [, tick] = useState(0);

  useEffect(() => {
    const refresh = setInterval(() => {
      posts.refetch();
      users.refetch();
      setUpdated(Date.now());
    }, REFRESH_MS);
    const clock = setInterval(() => tick((n) => n + 1), 1000);
    return () => {
      clearInterval(refresh);
      clearInterval(clock);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const latestPosts = useMemo(() => [...(posts.data ?? [])].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)).slice(0, 25), [posts.data]);
  const latestUsers = useMemo(() => [...(users.data ?? [])].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)).slice(0, 15), [users.data]);
  const dayAgo = Date.now() - 86_400_000;
  const today = (posts.data ?? []).filter((p) => +new Date(p.created_at) > dayAgo);
  const stats = [
    { label: 'Posts today', value: today.length, icon: FileText },
    { label: 'From Android app', value: today.filter((p) => p.metadata?._source === 'android').length, icon: Smartphone },
    { label: 'From website', value: today.filter((p) => p.metadata?._source === 'web').length, icon: Globe },
    { label: 'New members today', value: (users.data ?? []).filter((u) => +new Date(u.created_at) > dayAgo).length, icon: Users },
  ];
  const ago = Math.round((Date.now() - updated) / 1000);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-[13px] text-ink-2">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success-500 opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success-500" />
        </span>
        Live — refreshes every {REFRESH_MS / 1000}s · updated {ago < 2 ? 'just now' : `${ago}s ago`}
        <button
          className="btn-ghost btn-sm ml-auto"
          onClick={() => {
            posts.refetch();
            users.refetch();
            setUpdated(Date.now());
          }}
        >
          Refresh now
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {stats.map((s) => (
          <div key={s.label} className="card p-4">
            <s.icon className="h-5 w-5 text-primary-600" />
            <p className="mt-2 text-2xl font-extrabold tabular-nums text-ink">{s.value}</p>
            <p className="text-[13px] text-ink-2">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section className="card overflow-hidden">
          <h2 className="px-5 py-4 font-bold text-ink">Latest posts</h2>
          {posts.loading && !posts.data ? (
            <Spinner className="mx-auto mb-6" />
          ) : !latestPosts.length ? (
            <EmptyState icon={FileText} title="No posts yet" body="New posts from the Android app and website will appear here instantly." className="py-10" />
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {latestPosts.map((p) => (
                <li key={p.id}>
                  <Link to={`/post/${p.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2">
                    <CategoryIcon slug={p.category} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{p.title}</p>
                      <p className="truncate text-xs text-ink-3">
                        {p.author?.display_name ?? 'Member'} · {getCategory(p.category).short} · {timeAgo(p.created_at)}
                        {p.location_label ? ` · ${p.location_label}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <SourceBadge source={p.metadata?._source} />
                      {p.status !== 'active' && <Badge tone={p.status === 'hidden' ? 'danger' : 'neutral'}>{p.status}</Badge>}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card overflow-hidden">
          <h2 className="px-5 py-4 font-bold text-ink">Newest members</h2>
          {users.loading && !users.data ? (
            <Spinner className="mx-auto mb-6" />
          ) : !latestUsers.length ? (
            <EmptyState icon={Users} title="No members yet" body="People who sign up in the app or on the website appear here." className="py-10" />
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {latestUsers.map((u) => (
                <li key={u.id} className="flex items-center gap-3 px-5 py-3">
                  <Avatar name={u.display_name} size={34} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1 truncate text-sm font-semibold text-ink">
                      {u.display_name} <VerifiedBadge profile={u} size={13} />
                    </p>
                    <p className="text-xs text-ink-3">
                      joined {timeAgo(u.created_at)} · {u.post_count} post{u.post_count === 1 ? '' : 's'}
                    </p>
                  </div>
                  {u.is_owner ? (
                    <Badge className="bg-amber-400/15 text-amber-700 dark:text-amber-300">Owner</Badge>
                  ) : u.is_admin ? (
                    <Badge tone="primary">Admin</Badge>
                  ) : u.is_banned ? (
                    <Badge tone="danger">Suspended</Badge>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

// ── Moderation ──────────────────────────────────────────────────────────────

function Moderation() {
  const api = useApi();
  const { user } = useAuth();
  const [filter, setFilter] = useState<'reported' | 'hidden' | 'all'>('reported');
  const [q, setQ] = useState('');
  const { data, loading } = useQuery(() => api.admin.listPosts(filter, q), [api, filter, q], { scopes: ['posts', 'admin'] });
  const [pending, setPending] = useState<{ post: PostWithRelations; action: ModerationAction } | null>(null);
  const [reason, setReason] = useState('');
  const [openReports, setOpenReports] = useState<string | null>(null);
  const { busy, run } = useAdminAction();

  const act = (post: PostWithRelations, action: ModerationAction) => {
    if (action === 'delete' || action === 'hide') {
      setReason('');
      setPending({ post, action });
    } else {
      run(action === 'approve' ? 'Post restored' : action === 'feature' ? 'Post featured' : 'Feature removed', () => api.admin.moderatePost(user!.id, post.id, action));
    }
  };

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'reported', label: 'Reported' },
            { value: 'hidden', label: 'Hidden' },
            { value: 'all', label: 'All posts' },
          ]}
        />
        <div className="relative sm:ml-auto sm:w-72">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
          <input className="input pl-10" placeholder="Search titles…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <Spinner className="mx-auto mt-12 h-6 w-6" />
      ) : !data?.length ? (
        <EmptyState icon={ShieldCheck} title="All clear" body={filter === 'reported' ? 'No posts are waiting for review.' : 'Nothing to show here.'} />
      ) : (
        <div className="card mt-4 overflow-hidden">
          <div className="hidden grid-cols-[minmax(0,1fr)_140px_90px_110px_230px] gap-4 border-b border-line bg-surface-2 px-5 py-2.5 text-xs font-bold uppercase tracking-wide text-ink-3 lg:grid">
            <span>Post</span>
            <span>Author</span>
            <span>Reports</span>
            <span>Status</span>
            <span className="text-right">Actions</span>
          </div>
          <ul className="divide-y divide-line">
            {data.map((p) => (
              <li key={p.id} className="grid grid-cols-1 gap-3 px-4 py-3.5 lg:grid-cols-[minmax(0,1fr)_130px_100px_90px_280px] lg:items-center lg:gap-4 lg:px-5">
                <Link to={`/post/${p.id}`} className="flex min-w-0 items-center gap-3">
                  <CategoryIcon slug={p.category} size={38} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink hover:underline">{p.title}</p>
                    <p className="text-xs text-ink-3">
                      {getCategory(p.category).short} · {timeAgo(p.created_at)}
                    </p>
                  </div>
                </Link>
                <p className="truncate text-sm text-ink-2">{p.author?.display_name ?? '—'}</p>
                <div>
                  {p.report_count > 0 ? (
                    <button
                      onClick={() => setOpenReports(openReports === p.id ? null : p.id)}
                      aria-expanded={openReports === p.id}
                      className="inline-flex items-center gap-1 rounded-full bg-danger-50 px-2 py-0.5 text-[11px] font-bold text-danger-700 hover:ring-2 hover:ring-danger-500/30 dark:bg-danger-500/15 dark:text-danger-400"
                      title="Show report reasons"
                    >
                      <Flag className="h-3 w-3" /> {p.report_count} · why?
                    </button>
                  ) : (
                    <span className="text-sm text-ink-3">0</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  <Badge tone={p.status === 'hidden' ? 'danger' : p.status === 'active' ? 'success' : 'neutral'}>{p.status}</Badge>
                  {p.is_featured && (
                    <Badge tone="warning">
                      <Star className="h-3 w-3" />
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 lg:justify-end">
                  {(p.status === 'hidden' || p.report_count > 0) && (
                    <button className="btn-secondary btn-sm" onClick={() => act(p, 'approve')} disabled={busy}>
                      <CheckCircle2 className="h-4 w-4 text-success-600" /> Restore
                    </button>
                  )}
                  {p.status !== 'hidden' && (
                    <button className="btn-secondary btn-sm" onClick={() => act(p, 'hide')} disabled={busy}>
                      <EyeOff className="h-4 w-4" /> Hide
                    </button>
                  )}
                  <button className="btn-secondary btn-sm" onClick={() => act(p, p.is_featured ? 'unfeature' : 'feature')} disabled={busy} aria-label={p.is_featured ? 'Unfeature' : 'Feature'}>
                    <Star className={cn('h-4 w-4', p.is_featured && 'fill-amber-500 text-amber-500')} />
                  </button>
                  <button className="btn-secondary btn-sm text-danger-600" onClick={() => act(p, 'delete')} disabled={busy} aria-label="Delete">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {openReports === p.id && <ReportReasons postId={p.id} />}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pending)}
        title={pending?.action === 'delete' ? 'Delete this post permanently?' : 'Hide this post?'}
        body={pending?.post.title}
        confirmLabel={pending?.action === 'delete' ? 'Delete' : 'Hide post'}
        tone="danger"
        busy={busy}
        onClose={() => setPending(null)}
        onConfirm={async () => {
          if (!pending) return;
          const ok = await run(pending.action === 'delete' ? 'Post deleted' : 'Post hidden', () => api.admin.moderatePost(user!.id, pending.post.id, pending.action, reason.trim() || undefined));
          if (ok) setPending(null);
        }}
      >
        <label className="label mt-2">Reason (saved to the audit log)</label>
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g., Advance-payment scam" />
      </ConfirmDialog>
    </div>
  );
}

function ReportReasons({ postId }: { postId: string }) {
  const api = useApi();
  const { data, loading } = useQuery(() => api.admin.postReports(postId), [api, postId], { scopes: ['posts'] });
  return (
    <div className="rounded-xl bg-surface-2 p-3 lg:col-span-5">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-3">Why people reported this</p>
      {loading ? (
        <Spinner className="h-4 w-4" />
      ) : !data?.length ? (
        <p className="text-sm text-ink-3">Report details aren’t available for this post.</p>
      ) : (
        <ul className="space-y-1.5">
          {data.map((r) => (
            <li key={r.id} className="flex items-start gap-2 text-sm">
              <Flag className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger-600" />
              <span className="flex-1 text-ink">{r.reason || 'No reason given'}</span>
              <span className="shrink-0 text-xs text-ink-3">{timeAgo(r.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Users ───────────────────────────────────────────────────────────────────

const USER_FILTERS: { value: AdminUserFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'verified', label: 'Verified' },
  { value: 'business', label: 'Business' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'admins', label: 'Admins' },
];

function UsersAdmin() {
  const api = useApi();
  const [filter, setFilter] = useState<AdminUserFilter>('all');
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 250);
  const { data, loading } = useQuery(() => api.admin.listUsers(dq, filter), [api, dq, filter], { scopes: ['admin', 'profile'] });
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const current = selected ? data?.find((u) => u.id === selected.id) ?? selected : null;

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="-mx-4 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:px-0">
          <Segmented value={filter} onChange={setFilter} options={USER_FILTERS} />
        </div>
        <div className="relative sm:ml-auto sm:w-72">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
          <input className="input pl-10" placeholder="Search name or email…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <Spinner className="mx-auto mt-12 h-6 w-6" />
      ) : !data?.length ? (
        <EmptyState icon={Users} title="No users found" body="Try a different filter or search." />
      ) : (
        <div className="card mt-4 overflow-hidden">
          <div className="hidden grid-cols-[minmax(0,1fr)_220px_90px_70px_80px_110px] gap-4 border-b border-line bg-surface-2 px-5 py-2.5 text-xs font-bold uppercase tracking-wide text-ink-3 lg:grid">
            <span>User</span>
            <span>Email</span>
            <span>Trust</span>
            <span>Posts</span>
            <span>Reports</span>
            <span>Joined</span>
          </div>
          <ul className="divide-y divide-line">
            {data.map((u) => (
              <li key={u.id}>
                <button
                  onClick={() => setSelected(u)}
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-2 lg:grid-cols-[minmax(0,1fr)_220px_90px_70px_80px_110px] lg:gap-4 lg:px-5"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Avatar name={u.display_name} size={38} />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1 truncate text-sm font-semibold text-ink">
                        <span className="truncate">{u.display_name}</span>
                        <VerifiedBadge profile={u} size={14} />
                      </span>
                      <span className="mt-0.5 flex flex-wrap gap-1">
                        {u.is_owner ? (
                          <Badge className="bg-amber-400/15 text-amber-700 dark:text-amber-300">
                            <Crown className="h-3 w-3" /> Owner
                          </Badge>
                        ) : (
                          u.is_admin && <Badge tone="primary">Admin</Badge>
                        )}
                        {u.is_business && <Badge>Business</Badge>}
                        {u.verification_status === 'pending' && <Badge tone="warning">Pending CNIC</Badge>}
                        {u.is_banned && <Badge tone="danger">Suspended</Badge>}
                      </span>
                    </span>
                  </span>
                  <span className="hidden truncate text-sm text-ink-2 lg:block">{u.email ?? u.phone ?? '—'}</span>
                  <span className="flex items-center gap-2">
                    <span className="hidden h-1.5 w-12 overflow-hidden rounded-full bg-surface-2 lg:block">
                      <span className={cn('block h-full rounded-full', u.trust_score >= 70 ? 'bg-success-500' : u.trust_score >= 40 ? 'bg-warning-500' : 'bg-danger-500')} style={{ width: `${u.trust_score}%` }} />
                    </span>
                    <span className="text-sm font-bold tabular-nums text-ink">{u.trust_score}</span>
                  </span>
                  <span className="hidden text-sm tabular-nums text-ink-2 lg:block">{u.post_count}</span>
                  <span className={cn('hidden text-sm tabular-nums lg:block', u.reports_received ? 'font-bold text-danger-600' : 'text-ink-3')}>{u.reports_received}</span>
                  <span className="hidden text-sm text-ink-3 lg:block">{formatDate(u.created_at, { day: 'numeric', month: 'short', year: '2-digit' })}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <UserSheet user={current} onClose={() => setSelected(null)} />
    </div>
  );
}

function UserSheet({ user: u, onClose }: { user: AdminUser | null; onClose(): void }) {
  const api = useApi();
  const { user: me, isOwner } = useAuth();
  const { busy, run } = useAdminAction();
  const [trust, setTrust] = useState(50);
  const [reason, setReason] = useState('');
  const [confirmBan, setConfirmBan] = useState(false);
  const [confirmVerify, setConfirmVerify] = useState(false);
  const [verifyNote, setVerifyNote] = useState('');

  useEffect(() => {
    if (u) {
      setTrust(u.trust_score);
      setReason('');
      setVerifyNote('');
    }
  }, [u?.id, u?.trust_score]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!u) return null;
  const isSelf = u.id === me?.id;

  return (
    <>
      <Sheet open={Boolean(u)} onClose={onClose} size="md" bare>
        <div className="px-5 pb-6 pt-4 lg:px-6 lg:pt-6">
          <div className="flex items-center gap-4">
            <Avatar name={u.display_name} size={60} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 truncate text-lg font-extrabold text-ink">
                {u.display_name} <VerifiedBadge profile={u} size={18} />
              </p>
              <p className="text-sm text-ink-2">
                {u.email ?? u.phone ?? 'No email on file'} · joined {formatDate(u.created_at)}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {u.is_owner ? (
                          <Badge className="bg-amber-400/15 text-amber-700 dark:text-amber-300">
                            <Crown className="h-3 w-3" /> Owner
                          </Badge>
                        ) : (
                          u.is_admin && <Badge tone="primary">Admin</Badge>
                        )}
                {u.is_business && <Badge>Business</Badge>}
                {u.is_banned && <Badge tone="danger">Suspended</Badge>}
              </div>
            </div>
            <TrustRing score={u.trust_score} size={56} />
          </div>

          {u.is_banned && (
            <div className="mt-4 rounded-xl bg-danger-50 px-3.5 py-2.5 text-[13px] text-danger-700 dark:bg-danger-500/10 dark:text-danger-400">
              <b>Suspended.</b> {u.banned_reason ? `${u.banned_reason.replace(/\.$/, '')}.` : 'No reason recorded.'} Their posts are hidden and they can’t post, comment or vote.
            </div>
          )}

          <div className="mt-4 grid grid-cols-3 gap-2">
            {[
              ['Posts', u.post_count],
              ['Reports received', u.reports_received],
              ['Verification', u.verification_status === 'approved' ? 'Verified' : u.verification_status === 'pending' ? 'Pending' : 'None'],
            ].map(([k, v]) => (
              <div key={k as string} className="rounded-xl bg-surface-2 p-2.5 text-center">
                <p className={cn('text-base font-extrabold text-ink', k === 'Reports received' && Number(v) > 0 && 'text-danger-600')}>{v}</p>
                <p className="text-[11px] font-semibold text-ink-3">{k}</p>
              </div>
            ))}
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between">
              <label className="label mb-0" htmlFor="trust">Trust score</label>
              <span className="text-sm font-bold tabular-nums text-ink">{trust}</span>
            </div>
            <input id="trust" type="range" min={0} max={100} value={trust} onChange={(e) => setTrust(Number(e.target.value))} className="mt-2 w-full accent-primary-600" />
            <button
              className="btn-secondary btn-sm mt-2"
              disabled={busy || trust === u.trust_score}
              onClick={() => run('Trust score updated', () => api.admin.updateUser(me!.id, u.id, 'set_trust', trust))}
            >
              Save trust score
            </button>
          </div>

          <div className="mt-5 space-y-2 border-t border-line pt-5">
            {isOwner && !u.is_owner && !isSelf && (
              <button
                className="btn-outline w-full justify-start"
                disabled={busy}
                onClick={() =>
                  run(u.is_admin ? `${u.display_name} is no longer an admin` : `${u.display_name} is now an admin`, () =>
                    api.admin.setAdmin(me!.id, u.id, !u.is_admin)
                  )
                }
              >
                {u.is_admin ? <UserMinus className="h-4 w-4 text-danger-600" /> : <Crown className="h-4 w-4 text-amber-500" />}
                {u.is_admin ? 'Remove admin role' : 'Make admin'}
                <span className="ml-auto text-xs font-medium text-ink-3">owner only</span>
              </button>
            )}
            <DriverPanel userId={u.id} name={u.display_name} />
            {u.verification_status === 'pending' && (
              <div className="rounded-xl border border-warning-500/30 bg-warning-50 p-3 dark:bg-warning-500/10">
                <p className="text-[13px] font-semibold text-warning-700 dark:text-warning-500">CNIC submitted — waiting for review</p>
                <p className="mt-0.5 text-xs text-ink-2">Compare the photos with the CNIC before approving. Approval lasts 1 year; the photos are deleted either way.</p>
                <PendingPhotos userId={u.id} />
                <div className="mt-2.5 grid grid-cols-2 gap-2">
                  <button
                    className="btn-primary btn-sm"
                    disabled={busy}
                    onClick={() => run(`${u.display_name} is now verified`, () => api.admin.reviewVerification(me!.id, u.id, 'approved', '', null))}
                  >
                    <BadgeCheck className="h-4 w-4" /> Approve
                  </button>
                  <button
                    className="btn-outline btn-sm text-danger-600"
                    disabled={busy}
                    onClick={() => run('Verification rejected', () => api.admin.reviewVerification(me!.id, u.id, 'rejected', 'Rejected from the user panel', null))}
                  >
                    <XCircle className="h-4 w-4" /> Reject
                  </button>
                </div>
              </div>
            )}
            {u.verification_status !== 'approved' && u.verification_status !== 'pending' && (
              <button className="btn-outline w-full justify-start" disabled={busy} onClick={() => setConfirmVerify(true)}>
                <BadgeCheck className="h-4 w-4 text-primary-600" /> Verify this user
                <span className="ml-auto text-xs font-medium text-ink-3">blue badge · 1 year</span>
              </button>
            )}
            {u.verification_status === 'approved' && (
              <button
                className="btn-outline w-full justify-start"
                disabled={busy}
                onClick={() => run('Verification revoked', () => api.admin.updateUser(me!.id, u.id, 'revoke_verification', undefined, 'Revoked by admin'))}
              >
                <XCircle className="h-4 w-4 text-warning-600" /> Revoke CNIC verification
              </button>
            )}
            {u.is_banned ? (
              <button className="btn-outline w-full justify-start" disabled={busy} onClick={() => run(`${u.display_name} restored`, () => api.admin.updateUser(me!.id, u.id, 'unban'))}>
                <CheckCircle2 className="h-4 w-4 text-success-600" /> Restore account
              </button>
            ) : (
              <button className="btn-outline w-full justify-start text-danger-600" disabled={busy || isSelf || u.is_admin} onClick={() => setConfirmBan(true)}>
                <Ban className="h-4 w-4" /> Suspend account
                {(isSelf || u.is_admin) && <span className="ml-auto text-xs font-medium text-ink-3">admins can’t be suspended</span>}
              </button>
            )}
          </div>
        </div>
      </Sheet>

      <ConfirmDialog
        open={confirmVerify}
        title={`Verify ${u.display_name}?`}
        body="They get the blue verified badge and +15 trust for 1 year. Only do this after checking who they are (CNIC, business documents or in person)."
        confirmLabel="Verify"
        busy={busy}
        onClose={() => setConfirmVerify(false)}
        onConfirm={async () => {
          const ok = await run(`${u.display_name} is now verified`, () =>
            api.admin.reviewVerification(me!.id, u.id, 'approved', verifyNote.trim() || 'Verified manually by admin', null)
          );
          if (ok) setConfirmVerify(false);
        }}
      >
        <label className="label mt-2">How did you check? (saved to the audit log)</label>
        <input className="input" value={verifyNote} onChange={(e) => setVerifyNote(e.target.value)} placeholder="e.g., CNIC seen in person, shop visited" />
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmBan}
        title={`Suspend ${u.display_name}?`}
        body="They’ll still be able to browse, but can’t post, comment, vote, report or RSVP. Their posts are hidden from the public feed."
        confirmLabel="Suspend"
        tone="danger"
        busy={busy}
        onClose={() => setConfirmBan(false)}
        onConfirm={async () => {
          const ok = await run(`${u.display_name} suspended`, () => api.admin.updateUser(me!.id, u.id, 'ban', undefined, reason.trim()));
          if (ok) setConfirmBan(false);
        }}
      >
        <label className="label mt-2">Reason (shown to the user and saved to the audit log)</label>
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g., Repeated scam listings" />
      </ConfirmDialog>
    </>
  );
}

// ── Verification ────────────────────────────────────────────────────────────

/**
 * The CNIC photo and selfie of a pending request. They live in a private bucket; these are
 * signed links that stop working after 5 minutes, so they're re-created whenever this mounts.
 */
function VerificationPhotos({ paths, labels = ['CNIC front', 'Selfie with CNIC'] }: { paths: string[]; labels?: string[] }) {
  const api = useApi();
  const { data: urls, loading } = useQuery(() => api.admin.verificationPhotoUrls(paths), [api, paths.join('|')]);
  if (!paths.length) {
    return (
      <p className="mt-3 rounded-xl bg-warning-50 px-3 py-2 text-xs text-warning-700 dark:bg-warning-500/10 dark:text-warning-500">
        No photos — sent before photo checks existed. Reject it so they can re-submit with photos.
      </p>
    );
  }
  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      {labels.map((label, i) => (
        <a
          key={label}
          href={urls?.[i] || undefined}
          target="_blank"
          rel="noreferrer"
          className="group relative block aspect-[4/3] overflow-hidden rounded-xl bg-surface-2"
          aria-label={`Open ${label} full size`}
        >
          {urls?.[i] ? (
            <img src={urls[i]} alt={label} className="h-full w-full object-cover transition group-hover:scale-105" referrerPolicy="no-referrer" />
          ) : (
            <span className="flex h-full items-center justify-center text-xs text-ink-3">{loading ? 'Loading…' : 'Unavailable'}</span>
          )}
          <span className="absolute inset-x-0 bottom-0 bg-black/55 px-2 py-1 text-[11px] font-semibold text-white">{label}</span>
        </a>
      ))}
    </div>
  );
}

/** Driver status of one user, with review / revoke actions (user panel). */
function DriverPanel({ userId, name }: { userId: string; name: string }) {
  const api = useApi();
  const { user: me } = useAuth();
  const { busy, run } = useAdminAction();
  const status = useQuery(() => api.admin.driverStatus(userId), [api, userId], { scopes: ['admin', 'profile'] });
  const queue = useQuery(() => api.admin.driverQueue(), [api], { scopes: ['admin', 'profile'] });
  const req = queue.data?.find((r) => r.user_id === userId);
  const s = status.data;
  const active = s?.status === 'approved' && !!s.until && new Date(s.until) > new Date();
  if (req) {
    return (
      <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-3">
        <p className="flex items-center gap-1.5 text-[13px] font-semibold text-sky-700 dark:text-sky-300">
          <CarFront className="h-4 w-4" /> Driving licence submitted — {req.licence_number}, valid until {formatDate(req.licence_expiry)}
        </p>
        <VerificationPhotos paths={req.docs} labels={['Licence front', 'Selfie with licence']} />
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <button className="btn-primary btn-sm" disabled={busy || new Date(req.licence_expiry) <= new Date()} onClick={() => run(`${name} can now offer rides`, () => api.admin.reviewDriver(me!.id, userId, 'approved', ''))}>
            <BadgeCheck className="h-4 w-4" /> Approve driver
          </button>
          <button className="btn-outline btn-sm text-danger-600" disabled={busy} onClick={() => run('Licence rejected', () => api.admin.reviewDriver(me!.id, userId, 'rejected', 'Rejected from the user panel'))}>
            <XCircle className="h-4 w-4" /> Reject
          </button>
        </div>
      </div>
    );
  }
  if (active) {
    return (
      <button className="btn-outline w-full justify-start" disabled={busy} onClick={() => run('Driver status revoked', () => api.admin.reviewDriver(me!.id, userId, 'revoked', 'Revoked by admin'))}>
        <CarFront className="h-4 w-4 text-warning-600" /> Revoke driver status
        <span className="ml-auto text-xs font-medium text-ink-3">verified until {formatDate(s!.until!)}</span>
      </button>
    );
  }
  return null;
}

function PendingPhotos({ userId }: { userId: string }) {
  const api = useApi();
  const { data } = useQuery(() => api.admin.verificationQueue(), [api], { scopes: ['admin', 'profile'] });
  const req = data?.find((r) => r.user_id === userId);
  return req ? <VerificationPhotos paths={req.docs ?? []} /> : null;
}

function Verification() {
  const api = useApi();
  const { user } = useAuth();
  const { data, loading } = useQuery(() => api.admin.verificationQueue(), [api], { scopes: ['admin', 'profile'] });
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<Record<string, string>>({});
  const defaultExpiry = useMemo(() => new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10), []);
  const [expiry, setExpiry] = useState<Record<string, string>>({});
  const { busy, run } = useAdminAction();

  if (loading) return <Spinner className="mx-auto mt-12 h-6 w-6" />;

  return (
    <div className="space-y-8">
      <DriverQueue />
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink">
          <BadgeCheck className="h-4 w-4 text-primary-600" /> CNIC — providers
        </h2>
        {!data?.length ? (
          <EmptyState icon={BadgeCheck} title="No CNIC requests" body="Providers’ CNIC submissions will appear here." />
        ) : (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {data.map((r) => {
        const show = revealed.has(r.user_id);
        return (
          <article key={r.user_id} className="card flex flex-col p-5">
            <div className="flex items-center gap-3">
              <Avatar name={r.display_name} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-ink">{r.display_name}</p>
                <p className="text-xs text-ink-3">Requested {timeAgo(r.requested_at)}</p>
              </div>
              {r.is_business && <Badge tone="primary">Business</Badge>}
            </div>
            <dl className="mt-4 space-y-2 rounded-xl bg-surface-2 p-3.5 text-sm">
              {r.phone && (
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-3">Phone</dt>
                  <dd className="font-semibold text-ink">{r.phone}</dd>
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-3">CNIC</dt>
                <dd className="flex items-center gap-1.5 font-mono font-semibold text-ink">
                  {show && r.cnic_number ? `${r.cnic_number.slice(0, 5)}-${r.cnic_number.slice(5, 12)}-${r.cnic_number.slice(12)}` : maskCnic(r.cnic_number)}
                  <button
                    className="rounded p-0.5 text-ink-3 hover:text-ink"
                    aria-label={show ? 'Hide CNIC' : 'Reveal CNIC'}
                    onClick={() => setRevealed((s) => {
                      const n = new Set(s);
                      if (n.has(r.user_id)) n.delete(r.user_id);
                      else n.add(r.user_id);
                      return n;
                    })}
                  >
                    {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </dd>
              </div>
              <PhotoCheckRow check={r.photo_check} reveal={show} />
              <div className="flex justify-between gap-3">
                <dt className="text-ink-3">Trust score</dt>
                <dd className="font-semibold text-ink">{r.trust_score}</dd>
              </div>
            </dl>
            <VerificationPhotos paths={r.docs ?? []} />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <label className="label">Valid until</label>
                <input type="date" className="input h-10" value={expiry[r.user_id] ?? defaultExpiry} onChange={(e) => setExpiry({ ...expiry, [r.user_id]: e.target.value })} />
              </div>
              <input className="input col-span-2 h-10" placeholder="Notes (optional)" value={notes[r.user_id] ?? ''} onChange={(e) => setNotes({ ...notes, [r.user_id]: e.target.value })} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                className="btn-secondary text-danger-600"
                disabled={busy}
                onClick={() => run('Verification rejected', () => api.admin.reviewVerification(user!.id, r.user_id, 'rejected', notes[r.user_id] ?? '', null))}
              >
                <XCircle className="h-4 w-4" /> Reject
              </button>
              <button
                className="btn-primary"
                disabled={busy}
                onClick={() =>
                  run(`${r.display_name} verified`, () =>
                    api.admin.reviewVerification(user!.id, r.user_id, 'approved', notes[r.user_id] ?? '', new Date(expiry[r.user_id] ?? defaultExpiry).toISOString())
                  )
                }
              >
                <BadgeCheck className="h-4 w-4" /> Approve
              </button>
            </div>
          </article>
        );
      })}
    </div>
        )}
      </section>
    </div>
  );
}

/** Pending driving-licence checks (required to offer rides). */
function DriverQueue() {
  const api = useApi();
  const { user } = useAuth();
  const { data } = useQuery(() => api.admin.driverQueue(), [api], { scopes: ['admin', 'profile'] });
  const [notes, setNotes] = useState<Record<string, string>>({});
  const { busy, run } = useAdminAction();
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink">
        <CarFront className="h-4 w-4 text-sky-600" /> Driving licences — ride givers
      </h2>
      {!data?.length ? (
        <EmptyState icon={CarFront} title="No licence requests" body="Drivers who want to offer rides appear here." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((r) => {
            const expired = new Date(r.licence_expiry) <= new Date();
            return (
              <article key={r.user_id} className="card flex flex-col p-5">
                <div className="flex items-center gap-3">
                  <Avatar name={r.display_name} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-ink">{r.display_name}</p>
                    <p className="text-xs text-ink-3">Requested {timeAgo(r.requested_at)}</p>
                  </div>
                </div>
                <dl className="mt-4 space-y-2 rounded-xl bg-surface-2 p-3.5 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-3">Licence no.</dt>
                    <dd className="font-mono font-semibold text-ink">{r.licence_number}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-3">Valid until</dt>
                    <dd className={cn('font-semibold', expired ? 'text-danger-600' : 'text-ink')}>{formatDate(r.licence_expiry)}</dd>
                  </div>
                </dl>
                <VerificationPhotos paths={r.docs} labels={['Licence front', 'Selfie with licence']} />
                <p className="mt-2 text-xs text-ink-3">Check the name, photo and expiry on the licence match the selfie and the details above.</p>
                <input className="input mt-3 h-10" placeholder="Notes (optional)" value={notes[r.user_id] ?? ''} onChange={(e) => setNotes({ ...notes, [r.user_id]: e.target.value })} />
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button className="btn-secondary text-danger-600" disabled={busy} onClick={() => run('Licence rejected', () => api.admin.reviewDriver(user!.id, r.user_id, 'rejected', notes[r.user_id] ?? ''))}>
                    <XCircle className="h-4 w-4" /> Reject
                  </button>
                  <button className="btn-primary" disabled={busy || expired} onClick={() => run(`${r.display_name} can now offer rides`, () => api.admin.reviewDriver(user!.id, r.user_id, 'approved', notes[r.user_id] ?? ''))}>
                    <BadgeCheck className="h-4 w-4" /> Approve
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ── Listings ────────────────────────────────────────────────────────────────

function Listings() {
  const api = useApi();
  const { user } = useAuth();
  const [status, setStatus] = useState<ProviderListing['status']>('pending');
  const { data, loading } = useQuery(() => api.admin.listListings(status), [api, status], { scopes: ['admin', 'listings'] });
  const [notes, setNotes] = useState<Record<string, string>>({});
  const { busy, run } = useAdminAction();

  return (
    <div>
      <Segmented
        value={status}
        onChange={setStatus}
        options={[
          { value: 'pending', label: 'Pending' },
          { value: 'approved', label: 'Approved' },
          { value: 'rejected', label: 'Rejected' },
        ]}
      />
      {loading ? (
        <Spinner className="mx-auto mt-12 h-6 w-6" />
      ) : !data?.length ? (
        <EmptyState icon={Store} title={`No ${status} listings`} />
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {data.map((l) => (
            <article key={l.id} className="card p-5">
              <div className="flex items-start gap-3">
                <CategoryIcon slug={l.category} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-ink">{l.business_name}</p>
                  <p className="text-xs text-ink-3">
                    {getCategory(l.category).label} · submitted {timeAgo(l.created_at)}
                  </p>
                  <p className={cn('mt-1 inline-flex items-center gap-1 text-xs font-semibold', l.owner_verified ? 'text-success-600' : 'text-warning-600')}>
                    {l.owner_verified ? <BadgeCheck className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                    {l.owner_name} · {l.owner_verified ? 'CNIC verified' : 'CNIC not verified'}
                  </p>
                </div>
                <Badge tone={l.status === 'approved' ? 'success' : l.status === 'rejected' ? 'danger' : 'warning'}>{l.status}</Badge>
              </div>
              {l.description && <p className="mt-3 text-sm text-ink-2">{l.description}</p>}
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
                {l.phone && (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" /> {l.phone}
                  </span>
                )}
                {l.location_label && <span>{l.location_label}</span>}
              </div>
              {l.admin_notes && <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-2">Note: {l.admin_notes}</p>}
              {l.status === 'pending' && !l.owner_verified && (
                <p className="mt-3 rounded-lg bg-warning-50 px-3 py-2 text-xs text-warning-700 dark:bg-warning-500/10 dark:text-warning-500">
                  Only CNIC-verified owners can be listed. Approve their CNIC in the Verification tab first (or reject this with a note asking them to verify).
                </p>
              )}
              {l.status === 'approved' && (
                <div className="mt-4 flex gap-2">
                  <input className="input h-10 flex-1" placeholder="Reason (shown to the owner)" value={notes[l.id] ?? ''} onChange={(e) => setNotes({ ...notes, [l.id]: e.target.value })} />
                  <button
                    className="btn-secondary h-10 shrink-0 text-danger-600"
                    disabled={busy}
                    onClick={() => run('Removed from the directory', () => api.admin.reviewListing(user!.id, l.id, 'removed', notes[l.id] || 'Removed from the directory by Be Alert'))}
                  >
                    <Trash2 className="h-4 w-4" /> Remove
                  </button>
                </div>
              )}
              {l.status === 'pending' && (
                <>
                  <input className="input mt-4 h-10" placeholder="Notes for the owner (optional)" value={notes[l.id] ?? ''} onChange={(e) => setNotes({ ...notes, [l.id]: e.target.value })} />
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button className="btn-secondary text-danger-600" disabled={busy} onClick={() => run('Listing rejected', () => api.admin.reviewListing(user!.id, l.id, 'rejected', notes[l.id] ?? ''))}>
                      <XCircle className="h-4 w-4" /> Reject
                    </button>
                    <button
                      className="btn-primary"
                      disabled={busy || !l.owner_verified}
                      title={l.owner_verified ? undefined : 'Verify the owner’s CNIC first'}
                      onClick={() => run('Listing approved', () => api.admin.reviewListing(user!.id, l.id, 'approved', notes[l.id] ?? ''))}
                    >
                      <CheckCircle2 className="h-4 w-4" /> Approve
                    </button>
                  </div>
                </>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Emergency contacts ──────────────────────────────────────────────────────

const TYPES = ['rescue', 'police', 'ambulance', 'fire', 'hospital'];

function EmergencyAdmin() {
  const api = useApi();
  const { user } = useAuth();
  const radar = useRadar();
  const { data, loading } = useQuery(() => api.listEmergencyContacts(), [api], { scopes: ['emergency'] });
  const [editing, setEditing] = useState<Partial<EmergencyContact> | null>(null);
  const [deleting, setDeleting] = useState<EmergencyContact | null>(null);
  const { busy, run } = useAdminAction();

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-2">Numbers shown in the Emergency screen and on the map (when a location is set).</p>
        <button className="btn-primary btn-sm" onClick={() => setEditing({ type: 'rescue', name: '', phone: '', lat: null, lng: null })}>
          <Plus className="h-4 w-4" /> Add
        </button>
      </div>
      {loading ? (
        <Spinner className="mx-auto mt-12 h-6 w-6" />
      ) : (
        <div className="card mt-4 divide-y divide-line overflow-hidden">
          {(data ?? []).map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-5 py-3.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-danger-50 text-danger-600 dark:bg-danger-500/15">
                <Phone className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">{c.name}</p>
                <p className="text-xs text-ink-3">
                  {c.phone} · {c.type}
                  {c.lat !== null ? ' · on map' : ''}
                </p>
              </div>
              <button className="icon-btn h-9 w-9" aria-label={`Edit ${c.name}`} onClick={() => setEditing(c)}>
                <Pencil className="h-4 w-4" />
              </button>
              <button className="icon-btn h-9 w-9 text-danger-600" aria-label={`Delete ${c.name}`} onClick={() => setDeleting(c)}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Sheet open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.id ? 'Edit contact' : 'Add emergency contact'} size="sm">
        {editing && (
          <form
            className="space-y-3.5"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await run('Contact saved', () =>
                api.admin.upsertEmergencyContact(user!.id, {
                  id: editing.id,
                  name: editing.name!.trim(),
                  phone: editing.phone!.trim(),
                  type: editing.type ?? 'rescue',
                  lat: editing.lat ?? null,
                  lng: editing.lng ?? null,
                })
              );
              if (ok) setEditing(null);
            }}
          >
            <div>
              <label className="label">Name</label>
              <input data-autofocus className="input" required value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Phone</label>
                <input className="input" required inputMode="tel" value={editing.phone ?? ''} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
              </div>
              <div>
                <label className="label">Type</label>
                <select className="input" value={editing.type} onChange={(e) => setEditing({ ...editing, type: e.target.value })}>
                  {TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-line px-3.5 py-3 text-sm">
              <span>
                <span className="block font-semibold text-ink">Show on map</span>
                <span className="block text-xs text-ink-2">{editing.lat !== null && editing.lat !== undefined ? `${editing.lat.toFixed(4)}, ${editing.lng?.toFixed(4)}` : 'Uses the current radar centre'}</span>
              </span>
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary-600"
                checked={editing.lat !== null && editing.lat !== undefined}
                onChange={(e) => setEditing({ ...editing, lat: e.target.checked ? radar.coords.lat : null, lng: e.target.checked ? radar.coords.lng : null })}
              />
            </label>
            <button className="btn-primary w-full" disabled={busy}>
              Save
            </button>
          </form>
        )}
      </Sheet>

      <ConfirmDialog
        open={Boolean(deleting)}
        title={`Delete ${deleting?.name}?`}
        body="It will disappear from the Emergency screen for everyone."
        tone="danger"
        confirmLabel="Delete"
        busy={busy}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (deleting && (await run('Contact deleted', () => api.admin.deleteEmergencyContact(user!.id, deleting.id)))) setDeleting(null);
        }}
      />
    </div>
  );
}

// ── Audit log ───────────────────────────────────────────────────────────────

function Audit() {
  const api = useApi();
  const { data, loading } = useQuery(() => api.admin.auditLog(), [api], { scopes: ['admin', 'posts', 'emergency'] });
  if (loading) return <Spinner className="mx-auto mt-12 h-6 w-6" />;
  if (!data?.length) return <EmptyState icon={ScrollText} title="No admin actions yet" />;
  return (
    <div className="card overflow-hidden">
      <div className="hidden grid-cols-[160px_150px_200px_minmax(0,1fr)] gap-4 border-b border-line bg-surface-2 px-5 py-2.5 text-xs font-bold uppercase tracking-wide text-ink-3 lg:grid">
        <span>When</span>
        <span>Admin</span>
        <span>Action</span>
        <span>Details</span>
      </div>
      <ul className="divide-y divide-line">
        {data.map((a) => (
          <li key={a.id} className="grid grid-cols-1 gap-1 px-5 py-3 text-sm lg:grid-cols-[160px_150px_200px_minmax(0,1fr)] lg:items-center lg:gap-4">
            <span className="text-xs text-ink-3 lg:text-sm" title={formatDate(a.created_at)}>
              {formatDateTime(a.created_at)}
            </span>
            <span className="font-semibold text-ink">{a.admin_name ?? a.admin_id.slice(0, 8)}</span>
            <span>
              <Badge tone={a.action.startsWith('delete') || a.action.startsWith('reject') || a.action.startsWith('hide') ? 'danger' : a.action.startsWith('approve') ? 'success' : 'primary'}>
                {a.action.replace(/_/g, ' ')}
              </Badge>
            </span>
            <span className="truncate text-ink-2">
              {Object.entries(a.details ?? {})
                .filter(([, v]) => v !== null && v !== '')
                .map(([k, v]) => `${k}: ${typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) ? formatDate(v) : String(v)}`)
                .join(' · ') || '—'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Owner: team & roles ─────────────────────────────────────────────────────

function TeamAdmin() {
  const api = useApi();
  const { user: me } = useAuth();
  const { busy, run } = useAdminAction();
  const team = useQuery(() => api.admin.listUsers('', 'admins'), [api], { scopes: ['admin'] });
  const [addOpen, setAddOpen] = useState(false);
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 250);
  const candidates = useQuery(() => api.admin.listUsers(dq, 'all'), [api, dq], { scopes: ['admin'], enabled: addOpen });
  const [removing, setRemoving] = useState<AdminUser | null>(null);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="card overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <div>
            <h2 className="font-bold text-ink">Your team</h2>
            <p className="text-[13px] text-ink-2">People who can moderate Be Alert.</p>
          </div>
          <button className="btn-primary btn-sm" onClick={() => setAddOpen(true)}>
            <UserPlus className="h-4 w-4" /> Add admin
          </button>
        </div>
        {team.loading ? (
          <Spinner className="mx-auto mb-6" />
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {(team.data ?? []).map((u) => (
              <li key={u.id} className="flex items-center gap-3 px-5 py-3.5">
                <Avatar name={u.display_name} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate font-semibold text-ink">
                    {u.display_name}
                    {u.id === me?.id && <span className="text-xs font-medium text-ink-3">(you)</span>}
                  </p>
                  <p className="text-xs text-ink-3">
                    {u.email ?? u.phone ?? 'Email sign-in'} · joined {formatDate(u.created_at)}
                  </p>
                </div>
                {u.is_owner ? (
                  <Badge className="bg-amber-400/15 text-amber-700 dark:text-amber-300">
                    <Crown className="h-3 w-3" /> Owner
                  </Badge>
                ) : (
                  <>
                    <Badge tone="primary">
                      <ShieldCheck className="h-3 w-3" /> Admin
                    </Badge>
                    <button className="btn-ghost btn-sm text-danger-600" disabled={busy} onClick={() => setRemoving(u)}>
                      <UserMinus className="h-4 w-4" /> <span className="hidden sm:inline">Remove</span>
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside className="space-y-4">
        <div className="card p-5">
          <h3 className="flex items-center gap-2 font-bold text-ink">
            <Crown className="h-4 w-4 text-amber-500" /> Roles
          </h3>
          <dl className="mt-3 space-y-3 text-[13px]">
            <div>
              <dt className="font-semibold text-ink">Owner (you)</dt>
              <dd className="text-ink-2">Everything admins can do, plus appointing admins and changing app settings.</dd>
            </div>
            <div>
              <dt className="font-semibold text-ink">Admin</dt>
              <dd className="text-ink-2">Moderates posts, reviews CNIC verifications and listings, manages users and emergency numbers.</dd>
            </div>
            <div>
              <dt className="font-semibold text-ink">User</dt>
              <dd className="text-ink-2">Posts, votes, comments and browses the neighbourhood.</dd>
            </div>
          </dl>
        </div>
        <p className="px-1 text-xs text-ink-3">Every role change is recorded in the audit log. Admins can’t suspend the owner or other admins.</p>
      </aside>

      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="Add an admin" description="Pick a trusted member. They get admin console access immediately." size="sm">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
          <input data-autofocus className="input pl-10" placeholder="Search name or email…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <ul className="mt-3 max-h-80 divide-y divide-line overflow-y-auto rounded-xl border border-line">
          {(candidates.data ?? [])
            .filter((u) => !u.is_admin && !u.is_owner)
            .slice(0, 30)
            .map((u) => (
              <li key={u.id} className="flex items-center gap-3 px-3.5 py-2.5">
                <Avatar name={u.display_name} size={34} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{u.display_name}</p>
                  <p className="text-xs text-ink-3">
                    Trust {u.trust_score}
                    {u.is_banned ? ' · suspended' : ''}
                  </p>
                </div>
                <button
                  className="btn-secondary btn-sm"
                  disabled={busy}
                  onClick={async () => {
                    if (await run(`${u.display_name} is now an admin`, () => api.admin.setAdmin(me!.id, u.id, true))) setAddOpen(false);
                  }}
                >
                  Make admin
                </button>
              </li>
            ))}
        </ul>
      </Sheet>

      <ConfirmDialog
        open={Boolean(removing)}
        title={`Remove ${removing?.display_name} as admin?`}
        body="They lose access to the admin console right away. Their account stays active."
        confirmLabel="Remove admin"
        tone="danger"
        busy={busy}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (removing && (await run('Admin removed', () => api.admin.setAdmin(me!.id, removing.id, false)))) setRemoving(null);
        }}
      />
    </div>
  );
}

// ── Owner: app settings ─────────────────────────────────────────────────────

const TONE_CLASSES = { info: 'bg-primary-600 text-white', warning: 'bg-warning-500 text-[#3a2600]', success: 'bg-success-600 text-white' };

function SettingsAdmin() {
  const api = useApi();
  const { user: me } = useAuth();
  const settings = useAppSettings();
  const { busy, run } = useAdminAction();
  const [draft, setDraft] = useState<AppSettings>(settings);
  useEffect(() => setDraft(settings), [settings]);

  const strip = (s: AppSettings) => JSON.stringify({ ...s, announcement: s.announcement?.trim() || null, updated_at: null });
  const dirty = strip(draft) !== strip(settings);
  const toggleList = (key: 'disabled_categories' | 'verified_only_categories', slug: string, on: boolean) =>
    setDraft((d) => ({ ...d, [key]: on ? [...new Set([...d[key], slug])] : d[key].filter((s) => s !== slug) }));

  const save = () =>
    run('Settings saved — live for everyone', () =>
      api.admin.updateSettings(me!.id, {
        announcement: draft.announcement,
        announcement_tone: draft.announcement_tone,
        posting_enabled: draft.posting_enabled,
        disabled_categories: draft.disabled_categories,
        verified_only_categories: draft.verified_only_categories,
        default_radius_km: draft.default_radius_km,
      })
    );

  return (
    <div className="space-y-6 pb-24">
      <section className="card p-5 lg:p-6">
        <h2 className="flex items-center gap-2 font-bold text-ink">
          <Megaphone className="h-4 w-4 text-primary-600" /> Announcement banner
        </h2>
        <p className="text-[13px] text-ink-2">Shown at the top of the app for every user. Leave empty to hide it.</p>
        <textarea
          className="input mt-4"
          rows={2}
          maxLength={200}
          placeholder="e.g., Scheduled maintenance tonight 1–2 AM."
          value={draft.announcement ?? ''}
          onChange={(e) => setDraft({ ...draft, announcement: e.target.value })}
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Segmented
            size="sm"
            value={draft.announcement_tone}
            onChange={(v) => setDraft({ ...draft, announcement_tone: v })}
            options={[
              { value: 'info', label: 'Info' },
              { value: 'warning', label: 'Warning' },
              { value: 'success', label: 'Good news' },
            ]}
          />
          <span className="text-xs text-ink-3">{(draft.announcement ?? '').length}/200</span>
        </div>
        {draft.announcement?.trim() && (
          <div className={cn('mt-4 flex items-start gap-2.5 rounded-xl px-4 py-2.5 text-[13px] font-semibold', TONE_CLASSES[draft.announcement_tone])}>
            <Megaphone className="mt-0.5 h-4 w-4 shrink-0" /> {draft.announcement}
          </div>
        )}
      </section>

      <section className="card divide-y divide-line">
        <div className="flex items-center gap-4 p-5">
          <div className="flex-1">
            <p className="font-bold text-ink">Allow new posts</p>
            <p className="text-[13px] text-ink-2">Turn off to pause all new posts (e.g. during an incident). Admins can still post official notices.</p>
          </div>
          <Switch label="Allow new posts" checked={draft.posting_enabled} onChange={(v) => setDraft({ ...draft, posting_enabled: v })} />
        </div>
        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
          <div className="flex-1">
            <p className="font-bold text-ink">Default radar radius</p>
            <p className="text-[13px] text-ink-2">Used for new visitors until they choose their own.</p>
          </div>
          <RadiusSelect value={draft.default_radius_km} onChange={(v) => setDraft({ ...draft, default_radius_km: v })} />
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="px-5 pb-3 pt-5">
          <h2 className="font-bold text-ink">Categories</h2>
          <p className="text-[13px] text-ink-2">Switch categories off, or require CNIC verification to post in risky ones (rentals, jobs, domestic help…).</p>
        </div>
        <div className="hidden grid-cols-[minmax(0,1fr)_110px_130px] gap-4 border-y border-line bg-surface-2 px-5 py-2.5 text-xs font-bold uppercase tracking-wide text-ink-3 sm:grid">
          <span>Category</span>
          <span>Enabled</span>
          <span>Verified only</span>
        </div>
        {categoriesByGroup().map((g) => (
          <div key={g.group}>
            <p className="eyebrow px-5 pb-1 pt-4">{g.label}</p>
            <ul className="divide-y divide-line">
              {g.items.map((c) => {
                const enabled = !draft.disabled_categories.includes(c.slug);
                const vOnly = draft.verified_only_categories.includes(c.slug);
                return (
                  <li key={c.slug} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_110px_130px]">
                    <span className="flex min-w-0 items-center gap-3">
                      <CategoryIcon slug={c.slug} size={34} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-ink">{c.label}</span>
                        {c.isHighRisk && <span className="text-[11px] font-semibold text-amber-600">High-risk</span>}
                      </span>
                    </span>
                    <Switch label={`Enable ${c.label}`} checked={enabled} onChange={(v) => toggleList('disabled_categories', c.slug, !v)} />
                    <Switch label={`Verified only for ${c.label}`} checked={vOnly} disabled={!enabled} onChange={(v) => toggleList('verified_only_categories', c.slug, v)} />
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>

      <p className="text-xs text-ink-3">
        {settings.updated_at ? `Last changed ${formatDateTime(settings.updated_at)}. ` : ''}
        {CATEGORIES.length - draft.disabled_categories.length} of {CATEGORIES.length} categories enabled. These rules are enforced by the database, not just the app.
      </p>

      <div
        className={cn(
          'fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 py-3 pb-safe backdrop-blur-xl transition-transform lg:left-64',
          dirty ? 'translate-y-0' : 'translate-y-full'
        )}
      >
        <div className="mx-auto flex max-w-7xl items-center gap-3 lg:px-4">
          <p className="flex-1 text-sm font-semibold text-ink">You have unsaved changes</p>
          <button className="btn-ghost" onClick={() => setDraft(settings)} disabled={busy}>
            Discard
          </button>
          <button className="btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Result of the automatic check of the typed CNIC number against the number read from the card photo. */
function PhotoCheckRow({ check, reveal }: { check: VerificationRequest['photo_check']; reveal: boolean }) {
  const c = check?.check;
  const read = check?.read;
  const shown = read ? (reveal ? `${read.slice(0, 5)}-${read.slice(5, 12)}-${read.slice(12)}` : maskCnic(read)) : null;
  const [tone, text] =
    c === 'match'
      ? ['text-success-600', 'Number on card matches']
      : c === 'near'
        ? ['text-warning-600', `Card reads ${shown} — ${check?.diff} digit${check?.diff === 1 ? '' : 's'} differ. Compare carefully`]
        : c === 'unreadable'
          ? ['text-warning-600', 'Number not readable on the photo — compare by eye']
          : ['text-ink-3', 'Not checked (older app version)'];
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-ink-3">Photo check</dt>
      <dd className={cn('text-right text-xs font-semibold', tone)}>{text}</dd>
    </div>
  );
}
