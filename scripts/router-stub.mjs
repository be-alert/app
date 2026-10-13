// Minimal stand-in for react-router-dom while prerendering static legal pages (scripts/prerender-legal.mjs):
// links become plain <a href>, navigation is a no-op. Never used by the app itself.
import { createElement } from 'react';

export function Link({ to, children, ...rest }) {
  return createElement('a', { ...rest, href: typeof to === 'string' ? to : '/' }, children);
}
export const NavLink = Link;
export const useNavigate = () => () => {};
export const useLocation = () => ({ pathname: '/', search: '', hash: '', state: null });
