import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Bell, Building2, Check, Crosshair, Globe2, HeartHandshake, Loader2, ShieldCheck, Tag } from 'lucide-react';
import { CityPicker, RadiusPicker } from '@/components/radar/Pickers';
import { LogoMark } from '@/components/layout/Logo';
import { markOnboarded } from '@/components/layout/AppShell';
import { RadarScope } from '@/components/RadarScope';
import { useRadar } from '@/lib/location-context';
import { useAuth } from '@/lib/auth';
import { useLocalStorage } from '@/lib/hooks';
import { CATEGORIES } from '@/lib/categories';
import { cn } from '@/lib/format';

const HIGHLIGHTS = [
  { icon: Bell, title: 'Live alerts', body: 'Blood requests, outages and traffic — the moment they happen.' },
  { icon: Tag, title: 'Deals, jobs & rentals', body: 'Local offers and opportunities within walking distance.' },
  { icon: HeartHandshake, title: 'Trusted neighbours', body: 'CNIC-verified providers, safety tips and community moderation.' },
];

export function Onboarding() {
  const navigate = useNavigate();
  const radar = useRadar();
  const { profile, updateProfile } = useAuth();
  const [step, setStep] = useState(0);
  const [pinned, setPinned] = useLocalStorage<string[]>('sr_pinned', ['urgent_blood', 'local_event', 'home_services', 'second_hand']);
  const [radius, setRadius] = useState(radar.radiusKm);
  const [cityOpen, setCityOpen] = useState(false);

  const finish = () => {
    setPinned(pinned); // persist the defaults even if the user never toggled one
    radar.setRadiusKm(radius);
    if (profile) updateProfile({ pinned_categories: pinned }).catch(() => {});
    markOnboarded();
    navigate('/', { replace: true });
  };

  const toggle = (slug: string) => setPinned(pinned.includes(slug) ? pinned.filter((s) => s !== slug) : [...pinned, slug]);

  return (
    <div className="flex min-h-dvh flex-col bg-bg lg:items-center lg:justify-center lg:p-8">
      <div className="flex w-full flex-1 flex-col lg:max-w-[980px] lg:flex-none lg:flex-row lg:overflow-hidden lg:rounded-[32px] lg:border lg:border-line lg:bg-surface lg:shadow-lift">
        {/* Visual panel */}
        <div className="relative flex flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-primary-600 via-primary-700 to-[#131a4a] px-6 pb-10 pt-[max(env(safe-area-inset-top),2.5rem)] text-white lg:w-[46%] lg:py-14">
          <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(circle_at_center,white_1px,transparent_1px)] [background-size:16px_16px]" />
          <div className="relative flex items-center gap-2.5 self-start lg:absolute lg:left-8 lg:top-8">
            <LogoMark size={34} />
            <span className="text-[17px] font-extrabold tracking-tight">Be Alert</span>
          </div>
          {/* On shorter phones the illustration is dropped so the steps and buttons fit without scrolling. */}
          <div className="relative mt-8 lg:mt-0 max-lg:[@media(max-height:860px)]:hidden">
            <RadarScope center={radar.coords} radiusKm={3} posts={[]} size={210} />
            {[
              [22, 30, '#dc2626'],
              [70, 24, '#14d1b0'],
              [64, 70, '#f59e0b'],
              [30, 66, '#8b5cf6'],
            ].map(([x, y, c]) => (
              <span key={`${x}${y}`} className="absolute h-3 w-3 rounded-full ring-2 ring-white/80" style={{ left: `${x}%`, top: `${y}%`, background: c as string }} />
            ))}
          </div>
          <p className="relative mt-8 text-center text-2xl font-extrabold tracking-tight max-lg:[@media(max-height:860px)]:mt-5 lg:text-[28px]">Your Neighbourhood, One App</p>
          <p className="relative mt-2 max-w-xs text-center text-sm text-white/75">Everything happening within 1–50 km of you — in one place.</p>
        </div>

        {/* Steps */}
        <div className="flex flex-1 flex-col px-6 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-7 max-lg:pb-0 lg:px-10 lg:py-10">
          <div className="mb-6 flex gap-1.5" role="img" aria-label={`Step ${step + 1} of 3`}>
            {[0, 1, 2].map((i) => (
              <span key={i} className={cn('h-1.5 flex-1 rounded-full transition-colors', i <= step ? 'bg-primary-600' : 'bg-line')} />
            ))}
          </div>

          {step === 0 && (
            <div className="flex-1 animate-fade-in">
              <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-ink">Welcome to Be Alert</h1>
              <p className="mt-2 text-[15px] text-ink-2">A hyperlocal community for alerts, deals, services, transport and neighbours you can trust.</p>
              <ul className="mt-7 space-y-4">
                {HIGHLIGHTS.map((h) => (
                  <li key={h.title} className="flex gap-3.5">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-600/10 text-primary-600">
                      <h.icon className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="font-bold text-ink">{h.title}</p>
                      <p className="text-sm text-ink-2">{h.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {step === 1 && (
            <div className="flex-1 animate-fade-in">
              <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-ink">Where should your radar look?</h1>
              <p className="mt-2 text-[15px] text-ink-2">Use your location, or pick any city or country. Your exact position is never shown to others.</p>
              <button
                onClick={radar.requestLocation}
                disabled={radar.gpsStatus === 'locating' || radar.gpsStatus === 'granted'}
                className={cn(
                  'mt-7 flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition',
                  radar.gpsStatus === 'granted' ? 'border-success-500 bg-success-500/5' : 'border-line hover:border-primary-500'
                )}
              >
                <span
                  className={cn(
                    'flex h-12 w-12 items-center justify-center rounded-2xl text-white',
                    radar.gpsStatus === 'granted' ? 'bg-success-600' : 'bg-primary-600'
                  )}
                >
                  {radar.gpsStatus === 'locating' ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : radar.gpsStatus === 'granted' ? (
                    <Check className="h-6 w-6" />
                  ) : (
                    <Crosshair className="h-6 w-6" />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="font-bold text-ink">
                    {radar.gpsStatus === 'granted' ? 'Location enabled' : radar.gpsStatus === 'locating' ? 'Finding you…' : 'Use my current location'}
                  </p>
                  <p className="truncate text-sm text-ink-2">
                    {radar.gpsStatus === 'granted'
                      ? radar.areaLabel
                      : radar.gpsStatus === 'denied'
                        ? radar.gpsError
                        : 'Recommended for the best experience'}
                  </p>
                </div>
              </button>
              {radar.gpsStatus === 'denied' && <p className="mt-3 text-sm text-ink-2">No problem — choose your city or country below instead.</p>}

              <div className="my-5 flex items-center gap-3 text-xs font-bold uppercase tracking-wider text-ink-3">
                <span className="h-px flex-1 bg-line" /> or choose a city / country <span className="h-px flex-1 bg-line" />
              </div>

              {radar.area.kind === 'city' && !cityOpen ? (
                <button
                  onClick={() => setCityOpen(true)}
                  className="flex w-full items-center gap-4 rounded-2xl border border-success-500 bg-success-500/5 p-4 text-left"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-success-600 text-white">
                    <Building2 className="h-6 w-6" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-ink">{radar.area.label}</p>
                    <p className="text-sm text-ink-2">Tap to change</p>
                  </div>
                </button>
              ) : cityOpen ? (
                <div className="rounded-2xl border border-line p-4">
                  <CityPicker
                    onPick={(p) => {
                      radar.selectArea({ lat: p.lat, lng: p.lng }, { kind: 'city', label: p.label, city: p.city, country: p.country, countryCode: p.countryCode });
                      setCityOpen(false);
                    }}
                  />
                </div>
              ) : (
                <button onClick={() => setCityOpen(true)} className="flex w-full items-center gap-4 rounded-2xl border border-line p-4 text-left transition hover:border-primary-500">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2 text-primary-600">
                    <Globe2 className="h-6 w-6" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-bold text-ink">Choose city or country</p>
                    <p className="text-sm text-ink-2">Pakistan, UAE, Saudi Arabia, UK, USA and more</p>
                  </div>
                </button>
              )}

              <div className="mt-7">
                <p className="label">How far should your radar scan?</p>
                <RadiusPicker value={radius} onChange={setRadius} compact />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="flex-1 animate-fade-in">
              <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-ink">What do you care about?</h1>
              <p className="mt-2 text-[15px] text-ink-2">We’ll pin these to the top of your feed. You can change them any time.</p>
              <div className="mt-6 flex flex-wrap gap-2">
                {CATEGORIES.map((c) => {
                  const on = pinned.includes(c.slug);
                  return (
                    <button
                      key={c.slug}
                      onClick={() => toggle(c.slug)}
                      aria-pressed={on}
                      className={cn('chip h-10', on ? 'border-transparent text-white' : 'border-line bg-surface text-ink-2')}
                      style={on ? { background: c.color } : undefined}
                    >
                      <c.icon className="h-4 w-4" style={on ? undefined : { color: c.color }} />
                      {c.short}
                      {on && <Check className="h-3.5 w-3.5" />}
                    </button>
                  );
                })}
              </div>
              <p className="mt-6 flex items-start gap-2 rounded-2xl bg-surface-2 p-3.5 text-[13px] text-ink-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success-600" />
                Browsing is open to everyone. You’ll only need your phone number or email to post, vote or comment.
              </p>
            </div>
          )}

          {/* Phones: buttons stay pinned to the bottom of the screen; desktop: normal flow. */}
          <div className="sticky bottom-0 -mx-6 mt-8 flex items-center gap-3 border-t border-line/60 bg-bg/95 px-6 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
            {step > 0 ? (
              <button className="btn-ghost" onClick={() => setStep(step - 1)}>
                Back
              </button>
            ) : (
              <button className="btn-ghost" onClick={finish}>
                Skip
              </button>
            )}
            <button className="btn-primary ml-auto min-w-[150px]" onClick={() => (step < 2 ? setStep(step + 1) : finish())}>
              {step < 2 ? 'Continue' : 'Start exploring'} <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
