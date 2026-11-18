import type { AuthUser, UserRole } from '@pmrms/contracts';
import {
  Bell, ChartColumn, ClipboardList, LayoutDashboard, ScrollText, ShieldUser, Stethoscope, UserCog, UserRound, Users,
  type LucideIcon,
} from 'lucide-react';

export const ROLE_LABEL: Record<UserRole, string> = { ADMIN: 'Administrator', DOCTOR: 'Doctor', PATIENT: 'Patient' };
export const HOME_BY_ROLE: Record<UserRole, string> = { ADMIN: '/admin', DOCTOR: '/doctor', PATIENT: '/patient' };

export interface NavItem { label: string; href: string; icon: LucideIcon; ready: boolean; clinical?: boolean }

// Mirrors docs/07 section 4. Admin has no clinical entries at all. Set `ready: true` when a page ships.
export const NAV_BY_ROLE: Record<UserRole, NavItem[]> = {
  ADMIN: [
    { label: 'Overview', href: '/admin', icon: LayoutDashboard, ready: true },
    { label: 'Users', href: '/admin/users', icon: Users, ready: false },
    { label: 'Doctor approvals', href: '/admin/doctors', icon: ShieldUser, ready: false },
    { label: 'Assignments', href: '/admin/assignments', icon: Stethoscope, ready: false },
    { label: 'Audit logs', href: '/admin/audit-logs', icon: ScrollText, ready: false },
    { label: 'Notifications', href: '/admin/notifications', icon: Bell, ready: false },
    { label: 'Account', href: '/admin/profile', icon: UserCog, ready: true },
  ],
  DOCTOR: [
    { label: 'Overview', href: '/doctor', icon: LayoutDashboard, ready: true },
    { label: 'Patients', href: '/doctor/patients', icon: UserRound, ready: false, clinical: true },
    { label: 'Records', href: '/doctor/records', icon: ClipboardList, ready: false, clinical: true },
    { label: 'Analytics', href: '/doctor/analytics', icon: ChartColumn, ready: false, clinical: true },
    { label: 'Notifications', href: '/doctor/notifications', icon: Bell, ready: false },
    { label: 'Account', href: '/doctor/profile', icon: UserCog, ready: true },
  ],
  PATIENT: [
    { label: 'Overview', href: '/patient', icon: LayoutDashboard, ready: true },
    { label: 'Medical history', href: '/patient/records', icon: ClipboardList, ready: false },
    { label: 'Notifications', href: '/patient/notifications', icon: Bell, ready: false },
    { label: 'Account', href: '/patient/profile', icon: UserCog, ready: true },
  ],
};

export function isAwaitingApproval(user: AuthUser): boolean {
  return user.role === 'DOCTOR' && (user.status !== 'ACTIVE' || user.doctorVerification !== 'APPROVED');
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('');
}

export function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}
