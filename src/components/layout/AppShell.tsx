import { Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { GetAndroidAppButton, WebsiteLink } from '@/lib/pwa';
import {
  Ban,
  Briefcase,
  Crown,
  CarFront,
  Droplet,
  Home,
  LogIn,
  LogOut,
  Megaphone,
  Moon,
  X,
  Plus,
  ShieldCheck,
  Sun,
  Wrench,
  Zap,
} from 'lucide-react';
import { Logo } from './Logo';
import { MOBILE_NAV, PERSONAL_NAV, PRIMARY_NAV, type NavItem } from './nav';
import { Avatar, Badge, Sheet, Spinner, VerifiedBadge } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useAppSettings } from '@/lib/settings';
import { useLocalStorage } from '@/lib/hooks';
import { useTheme } from '@/lib/theme';
import { useBackend } from '@/data';
import { cn } from '@/lib/format';
import { withTimeout } from '@/lib/timeout';

const ONBOARDED_KEY = 'sr_onboarded_v1';

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);

  // First-run onboarding (only when landing on the feed, never on deep links).
  useEffect(() => {
    try {
      if (location.pathname === '/' && !localStorage.getItem(ONBOARDED_KEY)) navigate('/onboarding', { replace: true });
    } catch {
      /* ignore */
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    setMoreOpen(false);
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  const fullBleed = location.pathname === '/map';

  return (
    <div className="min-h-dvh bg-bg">
      <Sidebar />
      <div className="lg:pl-[272px]">
        <main className={cn(fullBleed ? '' : 'pb-28 lg:pb-12')}>
          <SuspendedBanner />
          <AnnouncementBanner />
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <BottomNav onMore={() => setMoreOpen(true)} />
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
      <NamePrompt />
    </div>
  );
}

/** Big, unmissable entry to the Owner / Admin console (only for those roles). */
export function ConsoleButton({ className }: { className?: string }) {
  const { isAdmin, isOwner } = useAuth();
  if (!isAdmin) return null;
  return (
    <Link
      to="/admin/dashboard"
      className={cn(
        'btn w-full',
        isOwner ? 'bg-amber-400 text-[#3a2600] shadow-[0_8px_24px_-8px_rgba(245,158,11,0.7)] hover:bg-amber-300' : 'bg-ink text-bg hover:opacity-90',
        className
      )}
    >
      {isOwner ? <Crown className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
      {isOwner ? 'Owner Console' : 'Admin Console'}
    </Link>
  );
}

/** Users who signed in via an email link haven't picked a display name yet. */
function NamePrompt() {
  const { user, profile, updateProfile } = useAuth();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const open = Boolean(user && profile && !profile.display_name?.trim());
  return (
    <Sheet open={open} onClose={() => {}} title="Welcome to Be Alert! 👋" description="What should neighbours call you? This name appears on your posts and comments." size="sm">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (name.trim().length < 2) return;
          setBusy(true);
          setError(false);
          try {
            await withTimeout(updateProfile({ display_name: name.trim() }), 15000);
          } catch {
            setError(true);
          } finally {
            setBusy(false);
          }
        }}
      >
        <input data-autofocus className="input" placeholder="e.g., Ayesha Khan" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        {error && <p className="mt-2 text-sm font-medium text-danger-600">Could not save your name. Check your internet connection and try again.</p>}
        <button className="btn-primary mt-4 w-full" disabled={busy || name.trim().length < 2}>
          {busy ? 'Saving…' : 'Continue'}
        </button>
      </form>
    </Sheet>
  );
}

/** Owner-set announcement shown to everyone (dismissible per message). */
function AnnouncementBanner() {
  const { announcement, announcement_tone: tone } = useAppSettings();
  const [dismissed, setDismissed] = useLocalStorage<string>('sr_announcement_dismissed', '');
  if (!announcement || dismissed === announcement) return null;
  const tones = {
    info: 'bg-primary-600 text-white',
    warning: 'bg-warning-500 text-[#3a2600]',
    success: 'bg-success-600 text-white',
  };
  return (
    <div role="status" className={cn('flex items-start gap-2.5 px-4 py-2.5 text-[13px] font-semibold lg:px-8', tones[tone])}>
      <Megaphone className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="flex-1">{announcement}</p>
      <button onClick={() => setDismissed(announcement)} aria-label="Dismiss announcement" className="-m-1 rounded-lg p-1 opacity-80 hover:opacity-100">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function SuspendedBanner() {
  const { profile } = useAuth();
  if (!profile?.is_banned) return null;
  return (
    <div role="alert" className="flex items-start gap-2.5 bg-danger-600 px-4 py-2.5 text-[13px] font-medium text-white lg:px-8">
      <Ban className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        <b>Your account is suspended.</b> You can browse, but posting, comments and votes are disabled.
        {profile.banned_reason ? ` Reason: ${profile.banned_reason}` : ''}
      </p>
    </div>
  );
}

export function markOnboarded() {
  try {
    localStorage.setItem(ONBOARDED_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function PageLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Spinner className="h-6 w-6" />
    </div>
  );
}

// ── Desktop sidebar ─────────────────────────────────────────────────────────

function SideLink({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cn(
          'group flex h-11 items-center gap-3 rounded-xl px-3 text-[14px] font-semibold transition-colors',
          isActive ? 'bg-primary-600/10 text-primary-700 dark:text-primary-300' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={cn('h-[19px] w-[19px]', isActive ? 'text-primary-600 dark:text-primary-400' : 'text-ink-3 group-hover:text-ink-2')} />
          {item.label}
          {item.to === '/emergency' && <span className="ml-auto h-2 w-2 rounded-full bg-danger-500" />}
        </>
      )}
    </NavLink>
  );
}

function Sidebar() {
  const { user, profile, requireAuth, signOut } = useAuth();
  const { resolved, toggle } = useTheme();
  const { demoReason } = useBackend();
  const navigate = useNavigate();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[272px] flex-col border-r border-line bg-surface/70 backdrop-blur-xl lg:flex">
      <div className="flex h-[72px] items-center px-5">
        <Logo />
      </div>
      <div className="space-y-2 px-4">
        <Link to="/create" className="btn-primary w-full">
          <Plus className="h-5 w-5" /> New post
        </Link>
        <ConsoleButton />
        <GetAndroidAppButton />
        <WebsiteLink />
      </div>
      <nav className="mt-5 flex-1 space-y-6 overflow-y-auto px-3 no-scrollbar" aria-label="Main">
        <div className="space-y-0.5">
          {PRIMARY_NAV.map((i) => (
            <SideLink key={i.to} item={i} />
          ))}
        </div>
        <div>
          <p className="eyebrow mb-2 px-3">You</p>
          <div className="space-y-0.5">
            {PERSONAL_NAV.map((i) => (
              <SideLink key={i.to} item={i} />
            ))}
          </div>
        </div>
        <QuickPostLinks />
      </nav>

      <div className="space-y-3 border-t border-line p-4">
        {demoReason && (
          <div className="rounded-xl bg-warning-50 px-3 py-2 text-xs font-medium text-warning-700 dark:bg-warning-500/10 dark:text-warning-500">
            <b>Demo mode</b> — data is stored in this browser only.
          </div>
        )}
        <div className="flex items-center gap-2">
          {user && profile ? (
            <button onClick={() => navigate('/profile')} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl p-1.5 text-left hover:bg-surface-2">
              <Avatar name={profile.display_name || 'You'} src={profile.avatar_url} size={36} />
              <div className="min-w-0">
                <p className="flex items-center gap-1 truncate text-sm font-semibold text-ink">
                  <span className="truncate">{profile.display_name || 'Your profile'}</span>
                  <VerifiedBadge profile={profile} size={14} />
                </p>
                <p className="truncate text-xs text-ink-3">Trust score {profile.trust_score}</p>
              </div>
            </button>
          ) : (
            <button onClick={() => requireAuth()} className="btn-outline flex-1">
              <LogIn className="h-4 w-4" /> Sign in
            </button>
          )}
          <button onClick={toggle} className="icon-btn" aria-label={`Switch to ${resolved === 'dark' ? 'light' : 'dark'} mode`}>
            {resolved === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          {user && (
            <button onClick={signOut} className="icon-btn" aria-label="Sign out" title="Sign out">
              <LogOut className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}

const QUICK_POSTS = [
  { label: 'Blood request', short: 'Blood', icon: Droplet, slug: 'urgent_blood', color: '#dc2626' },
  { label: 'Report outage', short: 'Outage', icon: Zap, slug: 'utility_outage', color: '#f97316' },
  { label: 'Post a job', short: 'Job', icon: Briefcase, slug: 'jobs_internships', color: '#4f46e5' },
  { label: 'List a rental', short: 'Rental', icon: Home, slug: 'property_rent', color: '#16a34a' },
  { label: 'Offer a service', short: 'Service', icon: Wrench, slug: 'home_services', color: '#d97706' },
  { label: 'Offer a ride', short: 'Ride', icon: CarFront, slug: 'ride_share', color: '#0284c7' },
];

function QuickPostLinks() {
  return (
    <div>
      <p className="eyebrow mb-2 px-3">Quick post</p>
      <div className="grid grid-cols-2 gap-1.5 px-1">
        {QUICK_POSTS.map((q) => (
          <Link
            key={q.slug}
            to={`/create?category=${q.slug}`}
            title={q.label}
            className="flex items-center gap-2 rounded-xl border border-line bg-surface px-2.5 py-2 text-xs font-semibold text-ink-2 transition hover:border-ink-3/40 hover:text-ink"
          >
            <q.icon className="h-4 w-4 shrink-0" style={{ color: q.color }} />
            <span className="truncate">{q.short}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Mobile bottom nav ───────────────────────────────────────────────────────

function BottomNav({ onMore }: { onMore(): void }) {
  const location = useLocation();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/90 pb-safe backdrop-blur-xl lg:hidden"
    >
      <div className="mx-auto flex h-16 max-w-lg items-stretch justify-around px-1">
        {MOBILE_NAV.map((item) => {
          if ('action' in item && item.action) {
            return (
              <Link key={item.to} to={item.to} aria-label="Create post" className="flex flex-1 items-center justify-center">
                <span className="-mt-7 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-600 text-white shadow-glow ring-4 ring-bg transition active:scale-95">
                  <Plus className="h-7 w-7" strokeWidth={2.5} />
                </span>
              </Link>
            );
          }
          const Icon = item.icon!;
          if ('more' in item && item.more) {
            return (
              <button key={item.to} onClick={onMore} className="flex flex-1 flex-col items-center justify-center gap-1 text-ink-3">
                <Icon className="h-[22px] w-[22px]" />
                <span className="text-[10.5px] font-semibold">{item.label}</span>
              </button>
            );
          }
          const active = 'end' in item && item.end ? location.pathname === item.to : location.pathname.startsWith(item.to);
          return (
            <NavLink key={item.to} to={item.to} end={'end' in item ? item.end : undefined} className="relative flex flex-1 flex-col items-center justify-center gap-1">
              {active && <span className="absolute top-0 h-[3px] w-8 rounded-b-full bg-primary-600" />}
              <Icon className={cn('h-[22px] w-[22px]', active ? 'text-primary-600' : 'text-ink-3')} strokeWidth={active ? 2.4 : 2} />
              <span className={cn('whitespace-nowrap text-[10.5px] font-semibold', active ? 'text-primary-600' : 'text-ink-3')}>{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}

function MoreSheet({ open, onClose }: { open: boolean; onClose(): void }) {
  const { user, profile, requireAuth, signOut } = useAuth();
  const { resolved, toggle } = useTheme();
  const { demoReason } = useBackend();
  const links: NavItem[] = [...PRIMARY_NAV.slice(2), ...PERSONAL_NAV];

  return (
    <Sheet open={open} onClose={onClose} title="More" size="sm">
      <ConsoleButton className="mb-4 h-12" />
      <GetAndroidAppButton className="btn-secondary mb-4 h-12 w-full" />
      <WebsiteLink className="mb-4 flex items-center justify-center gap-1.5 text-sm font-semibold text-ink-2 hover:text-ink" />
      {user && profile ? (
        <Link to="/profile" className="mb-4 flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
          <Avatar name={profile.display_name || 'You'} src={profile.avatar_url} size={44} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 truncate font-semibold text-ink">
              {profile.display_name || 'Your profile'} <VerifiedBadge profile={profile} size={15} />
            </p>
            <p className="text-xs text-ink-3">Trust score {profile.trust_score} · View profile</p>
          </div>
        </Link>
      ) : (
        <button
          onClick={() => {
            onClose();
            requireAuth();
          }}
          className="btn-primary mb-4 w-full"
        >
          <LogIn className="h-4 w-4" /> Sign in
        </button>
      )}

      <p className="eyebrow mb-2">Quick post</p>
      <div className="grid grid-cols-3 gap-2">
        {QUICK_POSTS.map((q) => (
          <Link key={q.slug} to={`/create?category=${q.slug}`} className="flex flex-col items-center gap-1.5 rounded-2xl border border-line p-3 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: `${q.color}17`, color: q.color }}>
              <q.icon className="h-5 w-5" />
            </span>
            <span className="text-[11.5px] font-semibold leading-tight text-ink-2">{q.label}</span>
          </Link>
        ))}
      </div>

      <div className="mt-5 divide-y divide-line overflow-hidden rounded-2xl border border-line">
        {links.map((l) => (
          <Link key={l.to} to={l.to} className="flex h-12 items-center gap-3 px-4 text-[14px] font-semibold text-ink hover:bg-surface-2">
            <l.icon className="h-5 w-5 text-ink-3" />
            {l.label}
          </Link>
        ))}
        <button onClick={toggle} className="flex h-12 w-full items-center gap-3 px-4 text-[14px] font-semibold text-ink hover:bg-surface-2">
          {resolved === 'dark' ? <Sun className="h-5 w-5 text-ink-3" /> : <Moon className="h-5 w-5 text-ink-3" />}
          {resolved === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
        {user && (
          <button onClick={signOut} className="flex h-12 w-full items-center gap-3 px-4 text-[14px] font-semibold text-danger-600 hover:bg-surface-2">
            <LogOut className="h-5 w-5" /> Sign out
          </button>
        )}
      </div>
      {demoReason && (
        <p className="mt-4 text-center">
          <Badge tone="warning">Demo mode · data stays in this browser</Badge>
        </p>
      )}
    </Sheet>
  );
}
