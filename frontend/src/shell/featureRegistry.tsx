import type { ReactNode } from 'react';
import type { Role } from '../api/types';

export interface FeatureRoute {
  path: string;
  element: ReactNode;
  roles?: Role[];
  public?: boolean;
}

export interface FeatureNavItem {
  label: string;
  path: string;
  icon?: 'dashboard' | 'obligations' | 'register' | 'bank' | 'release' | 'audit' | 'verify';
  section?: 'institute' | 'support' | 'release' | 'finance';
  roles?: Role[];
}

interface RouteModule {
  routes?: FeatureRoute[];
}

interface NavModule {
  navItems?: FeatureNavItem[];
}

const routeModules = import.meta.glob<RouteModule>('../features/*/routes.tsx', { eager: true });
const navModules = import.meta.glob<NavModule>('../features/*/nav.ts', { eager: true });

export const featureRoutes = Object.values(routeModules).flatMap((module) => module.routes ?? []);
export const featureNavItems = Object.values(navModules).flatMap((module) => module.navItems ?? []);
