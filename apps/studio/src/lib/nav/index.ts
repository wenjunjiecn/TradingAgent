import { findNavItem } from './nav-items';
import type { NavItem } from './nav-items';
import type { CrumbDef, RouteHeaderHandle } from '@/lib/route-header';

export * from './nav-items';

type NavCrumbOverrides = Partial<Pick<CrumbDef, 'id' | 'label' | 'heading' | 'to' | 'icon'>>;

function getFallbackLabel(url: string) {
  const [segment = url] = url.replace(/^\//, '').split('/');
  return segment
    .split('-')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/** Crumb derived from the nav registry — guarantees icon/label parity with the sidebar. */
export function navCrumb(url: string, overrides?: NavCrumbOverrides): CrumbDef {
  const item = findNavItem(url);
  if (!item) return { id: `nav:${url}`, label: overrides?.label ?? getFallbackLabel(url), to: url, ...overrides };
  return { id: `nav:${url}`, label: item.name, icon: item.Icon, to: url, ...overrides };
}

/** Route handle for a leaf page whose breadcrumb is just its own nav entry. */
export function navHandle(url: string): RouteHeaderHandle {
  const item = findNavItem(url);
  if (!item) {
    return {
      crumbs: [{ id: `nav:${url}`, label: getFallbackLabel(url) }],
    };
  }
  return {
    crumbs: [{ id: `nav:${url}`, label: item.name, icon: item.Icon }],
    docs: item.docs,
  };
}

/** Route handle for a child page: declares parent crumbs then leaves. */
export function navHandleWithChildren(parentUrl: string, leaves: CrumbDef[]): RouteHeaderHandle {
  const parent = findNavItem(parentUrl);
  if (!parent) {
    return {
      crumbs: [{ id: `nav:${parentUrl}`, label: getFallbackLabel(parentUrl), to: parentUrl }, ...leaves],
    };
  }
  return {
    crumbs: [{ id: `nav:${parentUrl}`, label: parent.name, icon: parent.Icon, to: parentUrl }, ...leaves],
    docs: parent.docs,
  };
}

export type { NavItem };
