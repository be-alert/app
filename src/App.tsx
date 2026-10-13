import { lazy, Suspense, useEffect, useRef } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { onDeepLink, registerBackButton, closeExternal } from '@/lib/native';
import { BackendProvider, useApi } from '@/data';
import { AuthProvider, useAuth } from '@/lib/auth';
import { SettingsProvider } from '@/lib/settings';
import { ThemeProvider } from '@/lib/theme';
import { LocationProvider } from '@/lib/location-context';
import { ToastProvider, useToast } from '@/components/ui';
import { PwaProvider } from '@/lib/pwa';
import { AppShell, PageLoader } from '@/components/layout/AppShell';
import { AuthSheet } from '@/components/AuthSheet';
import { LogoMark } from '@/components/layout/Logo';
import { HomeFeed } from '@/screens/HomeFeed';
import { LocationGate } from '@/components/radar/LocationGate';
import { AdminRoute } from '@/screens/admin/AdminRoute';

const named = <K extends string>(loader: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  lazy(() => loader().then((m) => ({ default: m[name] })));

const MapView = named(() => import('@/screens/MapView'), 'MapView');
const CreatePost = named(() => import('@/screens/CreatePost'), 'CreatePost');
const PostDetail = named(() => import('@/screens/PostDetail'), 'PostDetail');
const SearchScreen = named(() => import('@/screens/SearchScreen'), 'SearchScreen');
const MyPosts = named(() => import('@/screens/MyPosts'), 'MyPosts');
const Saved = named(() => import('@/screens/Saved'), 'Saved');
const Profile = named(() => import('@/screens/Profile'), 'Profile');
const Emergency = named(() => import('@/screens/Emergency'), 'Emergency');
const Onboarding = named(() => import('@/screens/Onboarding'), 'Onboarding');
const NotFound = named(() => import('@/screens/NotFound'), 'NotFound');
const PrivacyPolicy = named(() => import('@/screens/Legal'), 'PrivacyPolicy');
const TermsOfUse = named(() => import('@/screens/Legal'), 'TermsOfUse');
const DeleteAccount = named(() => import('@/screens/Legal'), 'DeleteAccount');
const AdminLogin = named(() => import('@/screens/admin/AdminLogin'), 'AdminLogin');
const AdminDashboard = named(() => import('@/screens/admin/AdminDashboard'), 'AdminDashboard');

/** Android back button → in-app navigation (no-op on the web). */
function NativeBridge() {
  const navigate = useNavigate();
  const location = useLocation();
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;
  useEffect(() => {
    let off = () => {};
    registerBackButton(
      () => navigate(-1),
      () => pathRef.current === '/'
    ).then((o) => (off = o));
    return () => off();
  }, [navigate]);
  return null;
}

/** Completes email-link sign-in when the link reopens the Android app. */
function DeepLinkAuth() {
  const api = useApi();
  const toast = useToast();
  const navigate = useNavigate();
  const { authPrompt, closeAuthPrompt } = useAuth();
  const promptOpen = useRef(authPrompt.open);
  promptOpen.current = authPrompt.open;
  useEffect(() => {
    if (api.mode !== 'live') return;
    let off = () => {};
    onDeepLink(async (url) => {
      const { completeAuthFromUrl } = await import('@/data/live');
      const res = await completeAuthFromUrl(url);
      await closeExternal(); // the Google sign-in tab, if one is open
      if (res.error) {
        toast.error('Sign-in link didn’t work', res.error);
        return;
      }
      if (url.includes('access_token') || url.includes('code=')) {
        if (promptOpen.current) closeAuthPrompt(true);
        toast.success('You’re signed in');
        navigate('/', { replace: true });
      }
    }).then((o) => (off = o));
    return () => off();
  }, [api.mode, toast, navigate, closeAuthPrompt]);
  return null;
}

function Splash() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg">
      <div className="relative">
        <span className="absolute inset-0 animate-ping-slow rounded-[20px] bg-primary-500/40" />
        <LogoMark size={64} className="relative" />
      </div>
      <p className="text-sm font-semibold text-ink-3">Tuning your radar…</p>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || undefined}>
      <NativeBridge />
      <ToastProvider>
        <PwaProvider>
        <BackendProvider fallback={<Splash />}>
          <AuthProvider>
            <SettingsProvider>
            <ThemeProvider>
              <LocationProvider>
                <Suspense fallback={<PageLoader />}>
                  <Routes>
                    <Route path="/onboarding" element={<Onboarding />} />
                    <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
                    <Route path="/admin/login" element={<AdminLogin />} />
                    <Route
                      path="/admin/dashboard"
                      element={
                        <AdminRoute>
                          <AdminDashboard />
                        </AdminRoute>
                      }
                    />
                    <Route element={<AppShell />}>
                      <Route index element={<LocationGate><HomeFeed /></LocationGate>} />
                      <Route path="map" element={<LocationGate><MapView /></LocationGate>} />
                      <Route path="search" element={<LocationGate><SearchScreen /></LocationGate>} />
                      <Route path="create" element={<LocationGate><CreatePost /></LocationGate>} />
                      <Route path="edit/:id" element={<CreatePost />} />
                      <Route path="post/:id" element={<PostDetail />} />
                      <Route path="my-posts" element={<MyPosts />} />
                      <Route path="saved" element={<Saved />} />
                      <Route path="profile" element={<Profile />} />
                      <Route path="emergency" element={<Emergency />} />
                      <Route path="privacy" element={<PrivacyPolicy />} />
                      <Route path="terms" element={<TermsOfUse />} />
                      <Route path="delete-account" element={<DeleteAccount />} />
                      <Route path="*" element={<NotFound />} />
                    </Route>
                  </Routes>
                </Suspense>
                <AuthSheet />
                <DeepLinkAuth />
              </LocationProvider>
            </ThemeProvider>
            </SettingsProvider>
          </AuthProvider>
        </BackendProvider>
        </PwaProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
