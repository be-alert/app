import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation as useRouterLocation, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowBigDown,
  ArrowBigUp,
  Bookmark,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  EyeOff,
  Flag,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Navigation,
  Pencil,
  Phone,
  Send,
  Share2,
  ShieldCheck,
  Star,
  Trash2,
  UserRound,
  Users,
  X,
  CarFront,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/Page';
import { usePostActions } from '@/components/post/usePostActions';
import {
  Avatar,
  Badge,
  CategoryBadge,
  ConfirmDialog,
  EmptyState,
  Sheet,
  SmartImage,
  Spinner,
  TrustRing,
  VerifiedBadge,
  useToast,
  verificationState,
} from '@/components/ui';
import { useApi } from '@/data';
import { useAuth } from '@/lib/auth';
import { useQuery } from '@/lib/hooks';
import { useRadar } from '@/lib/location-context';
import { formatExpiryRule, formatPKR, getCategory, headlineValue } from '@/lib/categories';
import { formatDistance, googleMapsLink, haversineKm, isExpired } from '@/lib/location';
import { cn, formatDate, formatDateTime, telLink, timeAgo, timeUntil, whatsappLink } from '@/lib/format';
import type { CategoryField } from '@/lib/categories';
import type { Comment, PostWithRelations } from '@/lib/types';

const MiniMap = lazy(() => import('@/components/map/MiniMap').then((m) => ({ default: m.MiniMap })));

const REPORT_REASONS = ['Scam or fraud', 'Spam or advertising', 'Offensive or inappropriate', 'Wrong category', 'Misleading or outdated', 'Something else'];

export function PostDetail() {
  const { id } = useParams<{ id: string }>();
  const api = useApi();
  const { user } = useAuth();
  const { data: post, loading, error, setData } = useQuery(() => api.getPost(id!, user?.id), [api, id, user?.id], { scopes: ['posts', 'rsvps'] });

  if (loading) {
    return (
      <>
        <PageHeader title="Post" back />
        <div className="flex min-h-[50vh] items-center justify-center">
          <Spinner className="h-6 w-6" />
        </div>
      </>
    );
  }
  if (error || !post) {
    return (
      <>
        <PageHeader title="Post" back />
        <EmptyState
          icon={EyeOff}
          title="This post isn’t available"
          body={error ?? 'It may have been removed by its author or hidden by moderators.'}
          action={
            <Link to="/" className="btn-primary">
              Back to feed
            </Link>
          }
        />
      </>
    );
  }
  return <PostView post={post} onChange={(p) => setData(p)} />;
}

function PostView({ post, onChange }: { post: PostWithRelations; onChange(p: PostWithRelations): void }) {
  const api = useApi();
  const toast = useToast();
  const navigate = useNavigate();
  const routerLoc = useRouterLocation();
  const { user, requireAuth } = useAuth();
  const radar = useRadar();
  const actions = usePostActions(post, onChange);
  const cat = getCategory(post.category);
  const isOwner = user?.id === post.user_id;
  const closed = post.status === 'resolved' || isExpired(post);
  const distance = radar.located || radar.gpsCoords ? haversineKm(radar.gpsCoords ?? radar.coords, post) : null;
  const headline = headlineValue(post.category, post.metadata);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (routerLoc.hash === '#comments') setTimeout(() => document.getElementById('comments')?.scrollIntoView({ behavior: 'smooth' }), 200);
  }, [routerLoc.hash]);

  const contactPhone = useMemo(() => {
    const f = cat.fields.find((x) => x.type === 'phone' && post.metadata[x.key]);
    return f ? String(post.metadata[f.key]) : null;
  }, [cat.fields, post.metadata]);
  // Contact numbers are only sent to signed-in users (the database strips them for visitors).
  const phoneHidden = !user && cat.fields.some((x) => x.type === 'phone');

  async function ownerAction(label: string, fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      toast.success(label);
    } catch (e) {
      toast.error('Something went wrong', (e as Error).message);
    } finally {
      setBusy(false);
      setMenuOpen(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={cat.short}
        back
        actions={
          <>
            <button onClick={actions.share} className="icon-btn hidden sm:inline-flex" aria-label="Share">
              <Share2 className="h-5 w-5" />
            </button>
            <button onClick={actions.bookmark} className={cn('icon-btn', post.is_bookmarked && 'text-primary-600')} aria-label="Save">
              <Bookmark className={cn('h-5 w-5', post.is_bookmarked && 'fill-current')} />
            </button>
            <button onClick={() => setMenuOpen(true)} className="icon-btn" aria-label="More actions">
              <MoreHorizontal className="h-5 w-5" />
            </button>
          </>
        }
      />

      <div className="mx-auto grid grid-cols-1 max-w-6xl gap-6 px-4 pt-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8 lg:px-8 lg:pt-6">
        <div className="min-w-0">
          {post.status === 'hidden' && (
            <Banner tone="danger" icon={EyeOff}>
              This post is hidden from the public feed after community reports. {isOwner ? 'Contact support if you think this is a mistake.' : ''}
            </Banner>
          )}
          {closed && post.status !== 'hidden' && (
            <Banner tone="success" icon={CheckCircle2}>
              {post.status === 'resolved' ? 'Marked as resolved.' : 'This post has expired.'} It no longer appears in the live feed.
            </Banner>
          )}

          {post.image_urls.length > 0 && <Gallery urls={post.image_urls} category={post.category} />}

          <article className={cn('card p-5 lg:p-7', post.image_urls.length > 0 && 'mt-4')}>
            <div className="flex flex-wrap items-center gap-2">
              <CategoryBadge slug={post.category} />
              {post.is_featured && (
                <Badge tone="warning">
                  <Star className="h-3 w-3 fill-current" /> Featured
                </Badge>
              )}
              {post.women_only && (
                <Badge className="bg-pink-500/10 text-pink-600 dark:text-pink-400">
                  <UserRound className="h-3 w-3" /> Women only
                </Badge>
              )}
              {post.reposted_from_id && <Badge>Reposted</Badge>}
              <span className="ml-auto text-xs text-ink-3">{timeAgo(post.created_at)}</span>
            </div>

            <h1 className="mt-3 text-[22px] font-extrabold leading-tight tracking-tight text-ink text-balance lg:text-[28px]">{post.title}</h1>
            {headline && (
              <p className="mt-2 text-xl font-extrabold" style={{ color: cat.color }}>
                {headline}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-ink-2">
              {post.location_label && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-4 w-4 text-ink-3" /> {post.location_label}
                </span>
              )}
              {distance !== null && (
                <span className="inline-flex items-center gap-1">
                  <Navigation className="h-4 w-4 text-ink-3" /> {formatDistance(distance)} away
                </span>
              )}
              {post.expires_at && !closed && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-4 w-4 text-ink-3" /> {timeUntil(post.expires_at)}
                </span>
              )}
            </div>

            {post.description && <p className="mt-5 whitespace-pre-line text-[15px] leading-relaxed text-ink">{post.description}</p>}

            <DetailsGrid fields={cat.fields} metadata={post.metadata} />

            {post.poll_options && <Poll post={post} onChange={onChange} />}
            {post.category === 'local_event' && <Rsvp post={post} onChange={onChange} />}

            {cat.supportsConfirm && !closed && (
              <div className="mt-6 rounded-2xl bg-surface-2 p-4">
                <p className="font-bold text-ink">Is this still happening?</p>
                <p className="mt-0.5 text-[13px] text-ink-2">Help neighbours with a quick confirmation. Alerts close automatically once enough people mark them resolved.</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => actions.confirm('confirm')}
                    className={cn('btn', post.user_confirmation === 'confirm' ? 'bg-danger-600 text-white' : 'bg-surface text-ink border border-line')}
                  >
                    <AlertTriangle className="h-4 w-4" /> Still happening · {post.confirm_count}
                  </button>
                  <button
                    onClick={() => actions.confirm('resolve')}
                    className={cn('btn', post.user_confirmation === 'resolve' ? 'bg-success-600 text-white' : 'bg-surface text-ink border border-line')}
                  >
                    <CheckCircle2 className="h-4 w-4" /> Resolved · {post.resolve_count}
                  </button>
                </div>
              </div>
            )}

            {/* Votes */}
            <div className="mt-6 flex items-center gap-2 border-t border-line pt-4">
              <div className="flex items-center rounded-xl bg-surface-2">
                <button
                  onClick={() => actions.vote('up')}
                  aria-label="Upvote"
                  className={cn('flex h-10 w-10 items-center justify-center rounded-xl', post.user_vote === 'up' ? 'text-primary-600' : 'text-ink-3 hover:text-ink')}
                >
                  <ArrowBigUp className={cn('h-6 w-6', post.user_vote === 'up' && 'fill-current')} />
                </button>
                <span className="min-w-[2rem] text-center font-bold tabular-nums text-ink">{post.upvotes - post.downvotes}</span>
                <button
                  onClick={() => actions.vote('down')}
                  aria-label="Downvote"
                  className={cn('flex h-10 w-10 items-center justify-center rounded-xl', post.user_vote === 'down' ? 'text-danger-600' : 'text-ink-3 hover:text-ink')}
                >
                  <ArrowBigDown className={cn('h-6 w-6', post.user_vote === 'down' && 'fill-current')} />
                </button>
              </div>
              <span className="text-[13px] text-ink-3">
                {post.upvotes} up · {post.downvotes} down
              </span>
              {!isOwner && (
                <button onClick={() => setReportOpen(true)} className="btn-ghost btn-sm ml-auto">
                  <Flag className="h-4 w-4" /> Report
                </button>
              )}
            </div>
          </article>

          <Comments postId={post.id} />
        </div>

        {/* Side column */}
        <aside className="space-y-4 lg:sticky lg:top-8 lg:self-start">
          <AuthorCard post={post} />

          {!isOwner && (contactPhone || post.category !== 'community_poll') && (
            <div className="card p-4">
              <p className="mb-3 font-bold text-ink">{contactPhone || phoneHidden ? 'Contact' : 'Get in touch'}</p>
              {phoneHidden ? (
                <button className="btn-primary w-full" onClick={() => requireAuth('Sign in to see the contact number.')}>
                  <Phone className="h-4 w-4" /> Sign in to see contact number
                </button>
              ) : contactPhone ? (
                <div className="grid grid-cols-2 gap-2">
                  <a href={telLink(contactPhone)} className="btn-primary">
                    <Phone className="h-4 w-4" /> Call
                  </a>
                  <a
                    href={whatsappLink(contactPhone, `Hi! I saw your post “${post.title}” on Be Alert.`)}
                    target="_blank"
                    rel="noreferrer"
                    className="btn bg-[#25D366] text-white hover:brightness-95"
                  >
                    <MessageCircle className="h-4 w-4" /> WhatsApp
                  </a>
                </div>
              ) : (
                <a href="#comments" className="btn-secondary w-full">
                  <MessageCircle className="h-4 w-4" /> Reply in comments
                </a>
              )}
            </div>
          )}

          {isOwner && (
            <div className="card p-4">
              <p className="mb-3 font-bold text-ink">Your post</p>
              <div className="grid grid-cols-2 gap-2">
                <button className="btn-secondary" onClick={() => navigate(`/edit/${post.id}`)} disabled={post.status === 'hidden'}>
                  <Pencil className="h-4 w-4" /> Edit
                </button>
                {post.status === 'active' && !isExpired(post) ? (
                  <button
                    className="btn-secondary"
                    disabled={busy}
                    onClick={() =>
                      ownerAction('Marked as resolved', async () => {
                        await api.updatePost(user!.id, post.id, { status: 'resolved' });
                        onChange({ ...post, status: 'resolved' });
                      })
                    }
                  >
                    <Check className="h-4 w-4" /> Resolve
                  </button>
                ) : (
                  <button className="btn-secondary" onClick={() => navigate(`/create?repost=${post.id}`)}>
                    Repost
                  </button>
                )}
              </div>
              <button className="btn-ghost mt-2 w-full text-danger-600" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="h-4 w-4" /> Delete post
              </button>
            </div>
          )}

          <div className="card overflow-hidden">
            <Suspense fallback={<div className="skeleton h-48 rounded-none" />}>
              <MiniMap center={post} category={post.category} you={radar.gpsCoords} zoom={15} className="h-48" interactive={false} />
            </Suspense>
            <div className="flex items-center justify-between gap-2 p-3.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{post.location_label || 'Approximate location'}</p>
                {distance !== null && <p className="text-xs text-ink-3">{formatDistance(distance)} from you</p>}
              </div>
              <a href={googleMapsLink(post)} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">
                Directions
              </a>
            </div>
          </div>

          {cat.safetyTips && (
            <div className="card border-amber-500/30 bg-amber-500/5 p-4">
              <p className="flex items-center gap-2 font-bold text-ink">
                <ShieldCheck className="h-4 w-4 text-amber-600" /> Stay safe
              </p>
              <ul className="mt-2.5 space-y-2">
                {cat.safetyTips.map((t) => (
                  <li key={t} className="flex gap-2 text-[13px] text-ink-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="px-1 text-xs text-ink-3">
            Posted {formatDateTime(post.created_at)} · {formatExpiryRule(cat.autoExpireMinutes)}
          </p>
        </aside>
      </div>

      {/* Menus */}
      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Post options" size="sm">
        <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
          <MenuRow icon={Share2} label="Share post" onClick={() => { setMenuOpen(false); actions.share(); }} />
          <MenuRow icon={Bookmark} label={post.is_bookmarked ? 'Remove from saved' : 'Save post'} onClick={() => { setMenuOpen(false); actions.bookmark(); }} />
          {isOwner ? (
            <>
              <MenuRow icon={Pencil} label="Edit post" onClick={() => navigate(`/edit/${post.id}`)} />
              <MenuRow icon={Trash2} label="Delete post" danger onClick={() => { setMenuOpen(false); setDeleteOpen(true); }} />
            </>
          ) : (
            <MenuRow icon={Flag} label="Report post" danger onClick={() => { setMenuOpen(false); setReportOpen(true); }} />
          )}
        </div>
      </Sheet>

      <ReportSheet open={reportOpen} onClose={() => setReportOpen(false)} onSubmit={(r) => actions.report(r).then(() => setReportOpen(false))} busy={actions.busy} />

      <ConfirmDialog
        open={deleteOpen}
        title="Delete this post?"
        body="It will be removed for everyone, along with comments and votes."
        confirmLabel="Delete"
        tone="danger"
        busy={busy}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() =>
          ownerAction('Post deleted', async () => {
            await api.deletePost(user!.id, post.id);
            navigate('/my-posts', { replace: true });
          })
        }
      />
    </div>
  );
}

function Banner({ tone, icon: Icon, children }: { tone: 'danger' | 'success'; icon: typeof EyeOff; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'mb-4 flex items-start gap-2.5 rounded-2xl p-3.5 text-[13px] font-medium',
        tone === 'danger' ? 'bg-danger-50 text-danger-700 dark:bg-danger-500/10 dark:text-danger-400' : 'bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-500'
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{children}</p>
    </div>
  );
}

function MenuRow({ icon: Icon, label, onClick, danger }: { icon: typeof Flag; label: string; onClick(): void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={cn('flex h-12 w-full items-center gap-3 px-4 text-left text-[14px] font-semibold hover:bg-surface-2', danger ? 'text-danger-600' : 'text-ink')}>
      <Icon className="h-5 w-5 opacity-70" /> {label}
    </button>
  );
}

function Gallery({ urls, category }: { urls: string[]; category: string }) {
  const [i, setI] = useState(0);
  const [full, setFull] = useState(false);
  const go = (d: number) => setI((x) => (x + d + urls.length) % urls.length);
  return (
    <>
      <div className="group relative overflow-hidden rounded-3xl bg-surface-2">
        <button className="block w-full" onClick={() => setFull(true)} aria-label="View full image">
          <SmartImage src={urls[i]} alt="" category={category} className="aspect-[4/3] w-full object-cover lg:aspect-[16/9]" />
        </button>
        {urls.length > 1 && (
          <>
            <button onClick={() => go(-1)} aria-label="Previous image" className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button onClick={() => go(1)} aria-label="Next image" className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur">
              <ChevronRight className="h-5 w-5" />
            </button>
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
              {urls.map((u, k) => (
                <span key={u + k} className={cn('h-1.5 rounded-full bg-white transition-all', k === i ? 'w-5' : 'w-1.5 opacity-60')} />
              ))}
            </div>
          </>
        )}
      </div>
      {full && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/95 animate-fade-in" onClick={() => setFull(false)}>
          <img src={urls[i]} alt="" className="max-h-full max-w-full object-contain" />
          <button className="absolute right-4 top-[max(env(safe-area-inset-top),16px)] flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white" aria-label="Close">
            <X className="h-6 w-6" />
          </button>
        </div>
      )}
    </>
  );
}

function formatValue(f: CategoryField, v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null;
  if (f.type === 'toggle') return v ? 'Yes' : null;
  if (f.type === 'price') return `Rs ${formatPKR(v)}`;
  if (f.type === 'date') return formatDate(String(v), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  return String(v);
}

function DetailsGrid({ fields, metadata }: { fields: CategoryField[]; metadata: Record<string, unknown> }) {
  const rows = fields
    .filter((f) => f.type !== 'poll_options' && f.type !== 'phone')
    .map((f) => ({ f, v: formatValue(f, metadata[f.key]) }))
    .filter((r): r is { f: CategoryField; v: string } => Boolean(r.v));
  if (!rows.length) return null;
  return (
    <dl className="mt-6 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
      {rows.map(({ f, v }) => (
        <div key={f.key} className="bg-surface p-3.5 sm:[&:last-child:nth-child(odd)]:col-span-2">
          <dt className="text-xs font-semibold text-ink-3">{f.label}</dt>
          <dd className="mt-0.5 text-[15px] font-semibold text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Poll({ post, onChange }: { post: PostWithRelations; onChange(p: PostWithRelations): void }) {
  const api = useApi();
  const toast = useToast();
  const { user, requireAuth } = useAuth();
  const opts = post.poll_options ?? [];
  const total = opts.reduce((s, o) => s + o.vote_count, 0);
  const voted = Boolean(post.user_poll_vote);

  async function vote(optionId: string) {
    const ok = user ? true : await requireAuth('Sign in to vote in polls');
    if (!ok) return;
    const session = user ?? (await api.auth.getSession());
    if (!session) return;
    const prev = post;
    const was = prev.user_poll_vote;
    const next = was === optionId ? null : optionId;
    onChange({
      ...prev,
      user_poll_vote: next,
      poll_options: opts.map((o) => ({ ...o, vote_count: o.vote_count - (o.id === was ? 1 : 0) + (o.id === next ? 1 : 0) })),
    });
    try {
      await api.votePoll(session.id, prev.id, optionId);
    } catch (e) {
      onChange(prev);
      toast.error('Could not record your vote', (e as Error).message);
    }
  }

  return (
    <div className="mt-6">
      <p className="mb-3 font-bold text-ink">{voted ? 'Results' : 'Cast your vote'}</p>
      <div className="space-y-2">
        {opts.map((o) => {
          const pct = total ? Math.round((o.vote_count / total) * 100) : 0;
          const mine = post.user_poll_vote === o.id;
          return (
            <button
              key={o.id}
              onClick={() => vote(o.id)}
              className={cn('relative w-full overflow-hidden rounded-xl border px-4 py-3 text-left transition', mine ? 'border-violet-500' : 'border-line hover:border-ink-3/40')}
            >
              {voted && <div className={cn('absolute inset-y-0 left-0 transition-all', mine ? 'bg-violet-500/20' : 'bg-surface-2')} style={{ width: `${pct}%` }} />}
              <div className="relative flex items-center justify-between gap-3 text-[14px] font-semibold text-ink">
                <span className="flex items-center gap-2">
                  {mine && <Check className="h-4 w-4 text-violet-600" />}
                  {o.option_text}
                </span>
                {voted && <span className="tabular-nums text-ink-2">{pct}%</span>}
              </div>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-ink-3">
        {total} vote{total === 1 ? '' : 's'}
        {voted ? ' · tap your choice again to undo' : ''}
      </p>
    </div>
  );
}

function Rsvp({ post, onChange }: { post: PostWithRelations; onChange(p: PostWithRelations): void }) {
  const api = useApi();
  const toast = useToast();
  const { user, requireAuth } = useAuth();
  const { data: attendees } = useQuery(() => api.listRsvps(post.id), [api, post.id], { scopes: ['rsvps'] });
  const counts = post.rsvp_count ?? { going: 0, interested: 0 };

  async function set(status: 'going' | 'interested') {
    const ok = user ? true : await requireAuth('Sign in to RSVP to events');
    if (!ok) return;
    const session = user ?? (await api.auth.getSession());
    if (!session) return;
    const prev = post;
    const was = prev.user_rsvp;
    const next = was === status ? null : status;
    onChange({
      ...prev,
      user_rsvp: next,
      rsvp_count: {
        going: counts.going - (was === 'going' ? 1 : 0) + (next === 'going' ? 1 : 0),
        interested: counts.interested - (was === 'interested' ? 1 : 0) + (next === 'interested' ? 1 : 0),
      },
    });
    try {
      await api.setRsvp(session.id, prev.id, next);
      if (next) toast.success(next === 'going' ? 'See you there! 🎉' : 'Marked as interested');
    } catch (e) {
      onChange(prev);
      toast.error('Could not save RSVP', (e as Error).message);
    }
  }

  const going = (attendees ?? []).filter((a) => a.status === 'going');

  return (
    <div className="mt-6 rounded-2xl bg-cyan-500/5 p-4 ring-1 ring-cyan-500/20">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-bold text-ink">
            <CalendarDays className="h-4 w-4 text-cyan-600" /> Are you going?
          </p>
          <p className="mt-0.5 text-[13px] text-ink-2">
            {counts.going} going · {counts.interested} interested
          </p>
        </div>
        {going.length > 0 && (
          <div className="flex -space-x-2">
            {going.slice(0, 5).map((a) => (
              <Avatar key={a.id} name={a.author?.display_name ?? '?'} src={a.author?.avatar_url} size={30} ring />
            ))}
          </div>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button onClick={() => set('going')} className={cn('btn', post.user_rsvp === 'going' ? 'bg-cyan-600 text-white' : 'border border-line bg-surface text-ink')}>
          <Users className="h-4 w-4" /> Going
        </button>
        <button onClick={() => set('interested')} className={cn('btn', post.user_rsvp === 'interested' ? 'bg-cyan-600 text-white' : 'border border-line bg-surface text-ink')}>
          <Star className="h-4 w-4" /> Interested
        </button>
      </div>
    </div>
  );
}

function AuthorCard({ post }: { post: PostWithRelations }) {
  const a = post.author;
  const v = verificationState(a);
  const name = a?.display_name || 'Neighbour';
  return (
    <div className="card p-4">
      <div className="flex items-center gap-3">
        <Avatar name={name} src={a?.avatar_url} size={48} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 truncate font-bold text-ink">
            {name} <VerifiedBadge profile={a} size={16} />
          </p>
          <p className="text-xs text-ink-3">{a?.is_business ? 'Business / service provider' : 'Neighbour'}</p>
          {post.category === 'ride_share' && (
            <p className={cn('mt-1 inline-flex items-center gap-1 text-xs font-semibold', a?.driver_verified ? 'text-sky-700 dark:text-sky-300' : 'text-ink-3')}>
              <CarFront className="h-3.5 w-3.5" /> {a?.driver_verified ? 'Verified driver · licence checked' : 'Driving licence not checked'}
            </p>
          )}
        </div>
        {a && <TrustRing score={a.trust_score} size={48} />}
      </div>
      <div className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-xs text-ink-2">
        {v === 'valid' && '✅ CNIC verified by Be Alert moderators.'}
        {v === 'due_soon' && '✅ CNIC verified — renewal due soon.'}
        {v === 'expired' && '⚠️ Verification has expired.'}
        {!v && 'Not CNIC verified yet — follow the safety tips when dealing in person.'}
      </div>
    </div>
  );
}

function ReportSheet({ open, onClose, onSubmit, busy }: { open: boolean; onClose(): void; onSubmit(reason: string): void; busy: boolean }) {
  const [reason, setReason] = useState(REPORT_REASONS[0]);
  const [details, setDetails] = useState('');
  return (
    <Sheet open={open} onClose={onClose} title="Report this post" description="Reports are anonymous. Posts with 3 or more reports are hidden until reviewed." size="sm">
      <div className="space-y-2">
        {REPORT_REASONS.map((r) => (
          <label key={r} className={cn('flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 text-sm font-semibold', reason === r ? 'border-primary-500 bg-primary-600/5 text-ink' : 'border-line text-ink-2')}>
            <input type="radio" name="reason" className="accent-primary-600" checked={reason === r} onChange={() => setReason(r)} />
            {r}
          </label>
        ))}
      </div>
      <textarea className="input mt-3" rows={3} placeholder="Add details (optional)" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={300} />
      <button className="btn-danger mt-4 w-full" disabled={busy} onClick={() => onSubmit(details.trim() ? `${reason}: ${details.trim()}` : reason)}>
        {busy ? 'Sending…' : 'Submit report'}
      </button>
    </Sheet>
  );
}

function Comments({ postId }: { postId: string }) {
  const api = useApi();
  const toast = useToast();
  const { user, profile, requireAuth } = useAuth();
  const { data, loading, setData } = useQuery(() => api.listComments(postId), [api, postId], { scopes: ['comments'] });
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const send = useCallback(async () => {
    const text = body.trim();
    if (!text) return;
    const ok = user ? true : await requireAuth('Sign in to join the conversation');
    if (!ok) return;
    const session = user ?? (await api.auth.getSession());
    if (!session) return;
    setSending(true);
    try {
      const c = await api.addComment(session.id, postId, text);
      setData((l) => [...(l ?? []), c]);
      setBody('');
    } catch (e) {
      toast.error('Could not post comment', (e as Error).message);
    } finally {
      setSending(false);
    }
  }, [body, user, requireAuth, api, postId, setData, toast]);

  async function remove(c: Comment) {
    if (!user) return;
    setData((l) => (l ?? []).filter((x) => x.id !== c.id));
    try {
      await api.deleteComment(user.id, c.id);
    } catch (e) {
      toast.error('Could not delete comment', (e as Error).message);
    }
  }

  return (
    <section id="comments" className="card mt-4 scroll-mt-20 p-5 lg:p-7">
      <h2 className="flex items-center gap-2 text-[17px] font-bold text-ink">
        <MessageCircle className="h-5 w-5 text-primary-600" /> Comments {data ? <span className="text-ink-3">{data.length}</span> : null}
      </h2>

      <div className="mt-4 flex items-start gap-3">
        <Avatar name={profile?.display_name || 'You'} src={profile?.avatar_url} size={36} />
        <div className="flex-1">
          <textarea
            className="input min-h-[44px] resize-none"
            rows={body ? 3 : 1}
            placeholder={user ? 'Write a helpful reply…' : 'Sign in to reply…'}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onFocus={() => !user && requireAuth('Sign in to join the conversation')}
            maxLength={1000}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send();
            }}
          />
          {body.trim() && (
            <div className="mt-2 flex justify-end">
              <button className="btn-primary btn-sm" onClick={send} disabled={sending}>
                <Send className="h-4 w-4" /> {sending ? 'Posting…' : 'Post'}
              </button>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <Spinner className="mx-auto mt-6" />
      ) : !data?.length ? (
        <p className="mt-6 text-center text-sm text-ink-3">No comments yet — start the conversation.</p>
      ) : (
        <ul className="mt-5 space-y-4">
          {data.map((c) => (
            <li key={c.id} className="group flex gap-3">
              <Avatar name={c.author?.display_name || 'Neighbour'} src={c.author?.avatar_url} size={36} />
              <div className="min-w-0 flex-1">
                <div className="rounded-2xl rounded-tl-md bg-surface-2 px-3.5 py-2.5">
                  <p className="flex items-center gap-1 text-[13px] font-bold text-ink">
                    {c.author?.display_name || 'Neighbour'} <VerifiedBadge profile={c.author} size={13} />
                  </p>
                  <p className="mt-0.5 whitespace-pre-line text-[14px] leading-relaxed text-ink">{c.body}</p>
                </div>
                <div className="mt-1 flex items-center gap-3 px-1 text-xs text-ink-3">
                  <span>{timeAgo(c.created_at)}</span>
                  {user?.id === c.user_id && (
                    <button className="font-semibold hover:text-danger-600" onClick={() => remove(c)}>
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
