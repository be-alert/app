import { memo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowBigDown,
  ArrowBigUp,
  Bookmark,
  CalendarDays,
  CheckCircle2,
  Clock,
  MapPin,
  MessageCircle,
  Share2,
  Sparkles,
  UserRound,
  Users,
  CarFront,
} from 'lucide-react';
import { Avatar, CategoryBadge, SmartImage, VerifiedBadge } from '@/components/ui';
import { usePostActions } from './usePostActions';
import { getCategory, headlineValue } from '@/lib/categories';
import { formatDistance, isExpired } from '@/lib/location';
import { cn, formatDate, timeAgo, timeUntil } from '@/lib/format';
import type { PostWithRelations } from '@/lib/types';

interface Props {
  post: PostWithRelations;
  onChange(p: PostWithRelations): void;
  compact?: boolean;
}

function PostCardImpl({ post, onChange, compact }: Props) {
  const navigate = useNavigate();
  const cat = getCategory(post.category);
  const actions = usePostActions(post, onChange);
  const headline = headlineValue(post.category, post.metadata);
  const score = post.upvotes - post.downvotes;
  const closed = post.status === 'resolved' || isExpired(post);
  const href = `/post/${post.id}`;
  const authorName = post.author?.display_name || 'Neighbour';

  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    fn();
  };

  return (
    <article
      onClick={() => navigate(href)}
      className={cn(
        'card group relative cursor-pointer overflow-hidden transition-all hover:border-ink-3/30 hover:shadow-lift',
        cat.isUrgent && !closed && 'border-l-[3px]'
      )}
      style={cat.isUrgent && !closed ? { borderLeftColor: cat.color } : undefined}
    >
      {post.is_featured && !closed && (
        <div className="flex items-center gap-1.5 border-b border-line bg-gradient-to-r from-amber-500/10 to-transparent px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">
          <Sparkles className="h-3.5 w-3.5" /> Featured
        </div>
      )}

      <div className="p-4">
        {/* Author row */}
        <div className="flex items-center gap-3">
          <Avatar name={authorName} src={post.author?.avatar_url} size={38} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <span className="truncate text-[14px] font-semibold text-ink">{authorName}</span>
              <VerifiedBadge profile={post.author} size={15} />
              {post.category === 'ride_share' && post.author?.driver_verified && (
                <span className="ml-1 inline-flex shrink-0 items-center gap-1 rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-bold text-sky-700 dark:text-sky-300">
                  <CarFront className="h-3 w-3" /> Verified driver
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-ink-3">
              <span>{timeAgo(post.created_at)}</span>
              {post.distance_km !== undefined && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-0.5">
                    <MapPin className="h-3 w-3" />
                    {formatDistance(post.distance_km)}
                  </span>
                </>
              )}
            </div>
          </div>
          <CategoryBadge slug={post.category} />
        </div>

        {/* Body */}
        <Link to={href} onClick={(e) => e.stopPropagation()} className="mt-3 block">
          <h3 className={cn('text-[16px] font-bold leading-snug tracking-tight text-ink text-balance', closed && 'text-ink-2')}>{post.title}</h3>
        </Link>
        {post.description && !compact && <p className="mt-1.5 line-clamp-2 text-[14px] leading-relaxed text-ink-2">{post.description}</p>}

        {/* Facts */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {headline && (
            <span className="inline-flex items-center rounded-lg px-2 py-1 text-[13px] font-bold" style={{ background: `${cat.color}14`, color: cat.color }}>
              {headline}
            </span>
          )}
          {post.category === 'local_event' && typeof post.metadata.event_date === 'string' && (
            <Fact icon={CalendarDays}>
              {formatDate(post.metadata.event_date, { weekday: 'short', day: 'numeric', month: 'short' })}
              {post.metadata.event_time ? ` · ${post.metadata.event_time}` : ''}
            </Fact>
          )}
          {post.women_only && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-pink-500/10 px-2 py-1 text-xs font-semibold text-pink-600 dark:text-pink-400">
              <UserRound className="h-3.5 w-3.5" /> Women only
            </span>
          )}
          {post.location_label && <Fact icon={MapPin}>{post.location_label}</Fact>}
          {closed ? (
            <span className="inline-flex items-center gap-1 rounded-lg bg-success-500/10 px-2 py-1 text-xs font-semibold text-success-600">
              <CheckCircle2 className="h-3.5 w-3.5" /> {post.status === 'resolved' ? 'Resolved' : 'Expired'}
            </span>
          ) : (
            post.expires_at && cat.isUrgent && <Fact icon={Clock}>{timeUntil(post.expires_at)}</Fact>
          )}
        </div>

        {/* Media */}
        {post.image_urls.length > 0 && !compact && (
          <div className={cn('mt-3 grid gap-1.5 overflow-hidden rounded-xl', post.image_urls.length > 1 && 'grid-cols-2')}>
            {post.image_urls.slice(0, 2).map((src, i) => (
              <div key={src + i} className="relative">
                <SmartImage src={src} alt="" category={post.category} className={cn('w-full object-cover', post.image_urls.length > 1 ? 'aspect-square' : 'aspect-[16/9]')} />
                {i === 1 && post.image_urls.length > 2 && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-lg font-bold text-white">+{post.image_urls.length - 2}</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Poll preview */}
        {post.poll_options && post.poll_options.length > 0 && <PollPreview post={post} />}

        {/* Event attendance */}
        {post.rsvp_count && (post.rsvp_count.going > 0 || post.rsvp_count.interested > 0) && (
          <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-2">
            <Users className="h-4 w-4 text-cyan-600" />
            {post.rsvp_count.going} going · {post.rsvp_count.interested} interested
          </p>
        )}

        {/* Crowd confirmation */}
        {cat.supportsConfirm && !closed && (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-surface-2 p-1.5">
            <span className="pl-1.5 text-xs font-semibold text-ink-2">Still happening?</span>
            <div className="ml-auto flex gap-1.5">
              <button
                onClick={stop(() => actions.confirm('confirm'))}
                className={cn(
                  'h-8 rounded-lg px-2.5 text-xs font-bold transition',
                  post.user_confirmation === 'confirm' ? 'bg-danger-600 text-white' : 'bg-surface text-ink-2 hover:text-ink'
                )}
              >
                Yes · {post.confirm_count}
              </button>
              <button
                onClick={stop(() => actions.confirm('resolve'))}
                className={cn(
                  'h-8 rounded-lg px-2.5 text-xs font-bold transition',
                  post.user_confirmation === 'resolve' ? 'bg-success-600 text-white' : 'bg-surface text-ink-2 hover:text-ink'
                )}
              >
                Resolved · {post.resolve_count}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-1 border-t border-line px-2 py-1.5">
        <div className="flex items-center rounded-xl bg-surface-2">
          <button
            aria-label="Upvote"
            aria-pressed={post.user_vote === 'up'}
            onClick={stop(() => actions.vote('up'))}
            className={cn('flex h-9 w-9 items-center justify-center rounded-xl transition', post.user_vote === 'up' ? 'text-primary-600' : 'text-ink-3 hover:text-ink')}
          >
            <ArrowBigUp className={cn('h-5 w-5', post.user_vote === 'up' && 'fill-current')} />
          </button>
          <span className={cn('min-w-[1.5rem] text-center text-[13px] font-bold tabular-nums', post.user_vote === 'up' ? 'text-primary-600' : post.user_vote === 'down' ? 'text-danger-600' : 'text-ink')}>
            {score}
          </span>
          <button
            aria-label="Downvote"
            aria-pressed={post.user_vote === 'down'}
            onClick={stop(() => actions.vote('down'))}
            className={cn('flex h-9 w-9 items-center justify-center rounded-xl transition', post.user_vote === 'down' ? 'text-danger-600' : 'text-ink-3 hover:text-ink')}
          >
            <ArrowBigDown className={cn('h-5 w-5', post.user_vote === 'down' && 'fill-current')} />
          </button>
        </div>
        <Link to={`${href}#comments`} onClick={(e) => e.stopPropagation()} className="btn-ghost btn-sm gap-1.5 px-2.5">
          <MessageCircle className="h-[18px] w-[18px]" />
          <span className="tabular-nums">{post.comment_count ?? 0}</span>
        </Link>
        <div className="ml-auto flex items-center">
          <button aria-label="Share" onClick={stop(actions.share)} className="icon-btn h-9 w-9">
            <Share2 className="h-[18px] w-[18px]" />
          </button>
          <button
            aria-label={post.is_bookmarked ? 'Remove bookmark' : 'Save post'}
            aria-pressed={post.is_bookmarked}
            onClick={stop(actions.bookmark)}
            className={cn('icon-btn h-9 w-9', post.is_bookmarked && 'text-primary-600')}
          >
            <Bookmark className={cn('h-[18px] w-[18px]', post.is_bookmarked && 'fill-current')} />
          </button>
        </div>
      </div>
    </article>
  );
}

function Fact({ icon: Icon, children }: { icon: typeof MapPin; children: React.ReactNode }) {
  return (
    <span className="inline-flex max-w-[14rem] items-center gap-1 truncate rounded-lg bg-surface-2 px-2 py-1 text-xs font-medium text-ink-2">
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{children}</span>
    </span>
  );
}

function PollPreview({ post }: { post: PostWithRelations }) {
  const opts = post.poll_options!;
  const total = opts.reduce((s, o) => s + o.vote_count, 0);
  return (
    <div className="mt-3 space-y-1.5">
      {opts.slice(0, 3).map((o) => {
        const pct = total ? Math.round((o.vote_count / total) * 100) : 0;
        const mine = post.user_poll_vote === o.id;
        return (
          <div key={o.id} className="relative overflow-hidden rounded-lg bg-surface-2 px-3 py-2 text-[13px]">
            <div className={cn('absolute inset-y-0 left-0 rounded-lg', mine ? 'bg-violet-500/25' : 'bg-violet-500/10')} style={{ width: `${pct}%` }} />
            <div className="relative flex justify-between gap-3 font-medium text-ink">
              <span className="truncate">{o.option_text}</span>
              <span className="font-bold tabular-nums text-ink-2">{pct}%</span>
            </div>
          </div>
        );
      })}
      <p className="text-xs text-ink-3">
        {total} vote{total === 1 ? '' : 's'}
        {opts.length > 3 ? ` · ${opts.length - 3} more option${opts.length - 3 === 1 ? '' : 's'}` : ''} · tap to vote
      </p>
    </div>
  );
}

export const PostCard = memo(PostCardImpl);
