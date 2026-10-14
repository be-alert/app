import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { PageBody, PageHeader } from '@/components/layout/Page';
import { useToast } from '@/components/ui';
import { useAuth } from '@/lib/auth';

const UPDATED = '13 October 2026';
/** Public support address shown on the legal pages (set VITE_SUPPORT_EMAIL at build time). */
const SUPPORT_EMAIL = (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined)?.trim() || '';

function Doc({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <PageHeader title={title} subtitle={`Last updated ${UPDATED}`} back="/" />
      <PageBody narrow className="pb-16">
        <article className="card space-y-5 p-5 text-[15px] leading-relaxed text-ink-2 lg:p-8 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1">
          {children}
        </article>
      </PageBody>
    </>
  );
}

function Contact() {
  return (
    <p>
      Questions or requests:{' '}
      {SUPPORT_EMAIL ? (
        <a className="font-semibold text-primary-600 underline" href={`mailto:${SUPPORT_EMAIL}`}>
          {SUPPORT_EMAIL}
        </a>
      ) : (
        'use “Report” on any post, or contact the Be Alert team through the app'
      )}
      . Website:{' '}
      <a className="font-semibold text-primary-600 underline" href="https://bealert.online" target="_blank" rel="noreferrer">
        bealert.online
      </a>
    </p>
  );
}

/** Where Be Alert is offered — the same service, one account. */
function WhereWeAre() {
  return (
    <p>
      Be Alert is offered on the website <strong>bealert.online</strong>, as a web app at <strong>app.bealert.online</strong> and as an Android app. They are
      one service with one account, and this document applies to all of them.
    </p>
  );
}

export function PrivacyPolicy() {
  return (
    <Doc title="Privacy Policy">
      <p>
        Be Alert (“we”, “the app”) is a neighbourhood app that shows posts, alerts and services near you. This policy explains what we collect, why, and the
        choices you have. We do <strong>not</strong> sell your data and we do <strong>not</strong> show third-party ads.
      </p>
      <WhereWeAre />

      <section>
        <h2>What we collect</h2>
        <ul>
          <li><strong>Account:</strong> your email address (used to sign in with your password or a one-time email code) and the display name you choose. If you
            use “Continue with Google”, Google shares your name and email address with us — nothing else.</li>
          <li><strong>Location:</strong> with your permission, your device location is used to show posts within the radius you pick (1–50 km) and to place
            posts you create on the map. You can instead choose a city manually. We do not track your location in the background.</li>
          <li><strong>Content you post:</strong> posts, photos, comments, votes, RSVPs, bookmarks and business listings.</li>
          <li><strong>CNIC verification (required only to offer services):</strong> to post services, tutoring, domestic help, rentals, jobs
            or shop deals, or to get a verified badge, your CNIC number, a photo of your CNIC (front) and a selfie
            holding it. They are stored privately and visible only to the app owner and admins for checking, never to other users. The photos are
            deleted as soon as your request is approved or rejected; we keep your CNIC number (to stop one CNIC verifying several accounts) and the
            decision. Photos are resized on your device before upload, which removes hidden location data. To catch mistakes and misuse, the app
            reads the number printed on your CNIC photo <strong>on your own device</strong> (the photo is not sent to any other company for this)
            and compares it with the number you typed; if they clearly don’t match, the request is rejected automatically.</li>
          <li><strong>Driving licence (only to offer rides):</strong> your licence number, its expiry date, a photo of the licence and a selfie
            holding it. Handled exactly like CNIC verification: private, seen only by the owner and admins, photos deleted once reviewed. Riders only
            see a “Verified driver” badge — never your licence details.</li>
          <li><strong>Safety & moderation:</strong> reports you make, and actions taken by admins, are logged to keep the community safe.</li>
          <li><strong>Notifications (optional):</strong> a device token, only if you turn notifications on.</li>
        </ul>
      </section>

      <section>
        <h2>How we use it</h2>
        <ul>
          <li>To run the app: sign you in, show nearby posts, and let neighbours see what you share.</li>
          <li>To keep the community safe: moderate reported content and suspend abusive accounts.</li>
          <li>To improve reliability and fix problems.</li>
        </ul>
      </section>

      <section>
        <h2>What other people can see</h2>
        <p>
          Your display name, profile picture, trust score, verified badge and the posts you publish are visible to other users. Your email address, phone
          number and CNIC are never shown to other users.
        </p>
      </section>

      <section>
        <h2>Google user data</h2>
        <p>If you choose “Continue with Google”, Be Alert receives the following from your Google Account, and nothing else:</p>
        <ul>
          <li><strong>What we access:</strong> your name, email address and a Google account ID (from Google’s sign-in token). We do not ask for
            access to your contacts, Gmail, Drive, calendar or any other Google data.</li>
          <li><strong>How we use it:</strong> only to create your Be Alert account and sign you in, and to suggest your display name the first time.
            Your email address is never shown to other users.</li>
          <li><strong>Sharing:</strong> we do not sell, rent or share Google user data with anyone, and we do not use it for advertising.</li>
          <li><strong>Storage and protection:</strong> it is stored with your account in our Supabase database over encrypted connections, protected
            by access rules so only you (and the app owner/admins, for safety) can read it.</li>
          <li><strong>Deletion:</strong> delete your account in Profile → Privacy &amp; data → Delete my account and this data is removed straight away.
            You can also remove Be Alert’s access at any time in your Google Account under Security → Third-party connections.</li>
        </ul>
      </section>

      <section>
        <h2>Services we use</h2>
        <ul>
          <li><strong>Supabase</strong> — secure database, file storage and sign-in.</li>
          <li><strong>OpenStreetMap / Nominatim</strong> — maps and city search (your search text is sent to look up places).</li>
          <li><strong>Google Sign-In</strong> — only if you choose “Continue with Google”.</li>
          <li><strong>Cloudflare Turnstile</strong> — a bot check on the sign-in screen; it reads technical browser signals, not your content.</li>
          <li><strong>Email delivery</strong> — your sign-in and password-reset codes are sent through our email provider.</li>
          <li><strong>Firebase Cloud Messaging</strong> — push notifications, only if enabled.</li>
          <li><strong>GitHub Pages</strong> — hosting of bealert.online and app.bealert.online.</li>
        </ul>
        <p>Data is sent over encrypted connections (HTTPS). Access to the database is restricted by row-level security rules.</p>
      </section>

      <section>
        <h2>Your choices and rights</h2>
        <ul>
          <li><strong>Download your data:</strong> Profile → Privacy &amp; data → Export.</li>
          <li><strong>Delete your account:</strong> Profile → Privacy &amp; data → Delete my account, or on the web at{' '}
            <Link to="/delete-account" className="font-semibold text-primary-600 underline">app.bealert.online/delete-account</Link>. This permanently removes your account, posts, comments,
            photos and listings straight away.</li>
          <li>You can turn off location permission and notifications at any time in your phone settings.</li>
        </ul>
      </section>

      <section>
        <h2>Data retention</h2>
        <p>
          We keep your data while your account exists, except verification photos, which are deleted once reviewed. When you delete your account,
          your personal data and content (including any verification photos still waiting for review) are deleted. Records of admin
          moderation actions are kept without your personal details.
        </p>
      </section>

      <section>
        <h2>Children</h2>
        <p>Be Alert is not intended for children under 13, and we do not knowingly collect their data.</p>
      </section>

      <section>
        <h2>Changes</h2>
        <p>If we change this policy we will update the date above and, for important changes, tell you in the app.</p>
        <Contact />
      </section>
      <p className="text-sm">
        See also our <Link to="/terms" className="font-semibold text-primary-600 underline">Terms of Use</Link>.
      </p>
    </Doc>
  );
}

export function TermsOfUse() {
  return (
    <Doc title="Terms of Use">
      <p>By using Be Alert you agree to these terms. If you do not agree, please do not use the app.</p>
      <WhereWeAre />

      <section>
        <h2>Your account</h2>
        <ul>
          <li>You must be at least 13 years old.</li>
          <li>Use your own email and keep access to it secure. You are responsible for activity on your account.</li>
          <li>Verified badges are given after checks and can be removed if information turns out to be false.</li>
          <li>To post services, tutoring, domestic help, rentals, jobs or shop deals you must first verify your CNIC; to offer rides you must add a valid
            driving licence. Submitting someone else’s documents is not allowed and leads to removal. Requests where the typed CNIC number doesn’t
            match the card are rejected automatically, and repeated rejected attempts are paused for 24 hours.</li>
        </ul>
      </section>

      <section>
        <h2>What you may not post</h2>
        <ul>
          <li>False alerts, scams, spam or misleading offers.</li>
          <li>Harassment, hate speech, threats, or content that targets a person.</li>
          <li>Other people’s private information (phone numbers, addresses, ID documents) without their consent.</li>
          <li>Sexual, violent or illegal content, or anything that breaks the law of your country.</li>
        </ul>
      </section>

      <section>
        <h2>Moderation</h2>
        <p>
          The Be Alert team may hide or remove content and suspend or remove accounts that break these terms or put others at risk, with or without
          notice. You can report any post you think breaks the rules.
        </p>
      </section>

      <section>
        <h2>Emergencies</h2>
        <p>
          Be Alert is not an emergency service. In an emergency, always call your local emergency number first. Information posted by users may be
          wrong or out of date.
        </p>
      </section>

      <section>
        <h2>Your content</h2>
        <p>
          You own what you post. By posting, you allow Be Alert to display it to other users of the app. You can delete your posts or your whole account
          at any time.
        </p>
      </section>

      <section>
        <h2>Deals between users</h2>
        <p>
          Listings, rides, help offers and sales are between users. Be Alert is not a party to these arrangements and is not responsible for them.
          Meet in safe places and use your judgement.
        </p>
      </section>

      <section>
        <h2>Changes and contact</h2>
        <p>We may update these terms; continuing to use the app means you accept the updated terms. These terms are governed by the laws of Pakistan.</p>
        <Contact />
      </section>
      <p className="text-sm">
        See also our <Link to="/privacy" className="font-semibold text-primary-600 underline">Privacy Policy</Link>.
      </p>
    </Doc>
  );
}

/**
 * Public account-deletion page (Google Play requires a web link for this).
 * The text is prerendered into dist/delete-account/ so it reads without JavaScript;
 * the sign-in / delete controls appear once the app has loaded.
 */
export function DeleteAccount() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <Doc title="Delete your Be Alert account">
      <p>
        You can permanently delete your Be Alert account and the data linked to it at any time, from the Android app or from this page. Deletion
        happens straight away — there is no waiting period.
      </p>

      <section>
        <h2>How to delete your account</h2>
        <ul>
          <li><strong>In the Android app or web app:</strong> open Profile → Privacy &amp; data → Delete my account, type DELETE and confirm.</li>
          <li><strong>On this page:</strong> sign in below and press “Delete my account”.</li>
          <li><strong>Forgot your password?</strong> Tap “Forgot password?” on the sign-in screen — we’ll email you a code to set a new one. If you joined with Google, just use “Continue with Google”.</li>
        </ul>
      </section>

      {mounted && <DeleteAccountActions />}

      <section>
        <h2>What is deleted</h2>
        <ul>
          <li>Your account, email address, display name, profile photo and settings.</li>
          <li>Your posts, photos, comments, votes, RSVPs, bookmarks, reports, trusted contacts and business listings.</li>
          <li>Your CNIC and driving-licence details, and any verification photos still waiting for review.</li>
          <li>If you signed in with Google, the name and email we received from Google.</li>
        </ul>
      </section>

      <section>
        <h2>What is kept</h2>
        <p>
          Records of moderation actions taken by Be Alert admins (for example, that a post was removed) are kept for safety, without your name,
          email or other personal details. Nothing else is kept.
        </p>
        <Contact />
      </section>
      <p className="text-sm">
        See also our <Link to="/privacy" className="font-semibold text-primary-600 underline">Privacy Policy</Link>.
      </p>
    </Doc>
  );
}

function DeleteAccountActions() {
  const { user, profile, requireAuth, deleteMyAccount } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  if (!user)
    return (
      <div className="rounded-2xl bg-surface-2 p-4">
        <p className="mb-3 text-sm text-ink-2">Sign in to the account you want to delete.</p>
        <button className="btn-primary" onClick={() => void requireAuth('Sign in to delete your account')}>
          Sign in
        </button>
      </div>
    );
  if (profile?.is_owner)
    return <p className="rounded-2xl bg-surface-2 p-4 text-sm text-ink-2">The owner account can’t be deleted from the app.</p>;

  async function remove() {
    if (text.trim().toUpperCase() !== 'DELETE') return toast.error('Type DELETE to confirm');
    setBusy(true);
    const { error } = await deleteMyAccount();
    setBusy(false);
    if (error) return toast.error('Could not delete account', error);
    toast.success('Your account has been deleted');
    navigate('/', { replace: true });
  }

  return (
    <div className="rounded-2xl bg-danger-50 p-4 dark:bg-danger-500/10">
      <p className="text-sm text-ink">
        Signed in as <b>{profile?.display_name || user.email || 'your account'}</b>. Type <b>DELETE</b> to confirm — this can’t be undone.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input className="input h-11 flex-1" value={text} onChange={(e) => setText(e.target.value)} placeholder="DELETE" aria-label="Type DELETE to confirm" />
        <button className="btn-primary h-11 bg-danger-600 hover:bg-danger-700" disabled={busy} onClick={() => void remove()}>
          <Trash2 className="h-4 w-4" /> {busy ? 'Deleting…' : 'Delete my account'}
        </button>
      </div>
    </div>
  );
}

