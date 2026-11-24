const base = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, 'aria-hidden': true } as const;

export const ClientsIcon = () => <svg {...base}><path d="M3 21V7l9-4 9 4v14M9 21v-6h6v6" /></svg>;
export const PlansIcon = () => <svg {...base}><path d="M4 6h16M4 12h16M4 18h10" /></svg>;
export const BillingIcon = () => <svg {...base}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /></svg>;
export const TemplatesIcon = () => <svg {...base}><rect x="4" y="4" width="7" height="7" /><rect x="13" y="4" width="7" height="7" /><rect x="4" y="13" width="7" height="7" /><rect x="13" y="13" width="7" height="7" /></svg>;
export const ShieldIcon = () => <svg {...base}><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" /></svg>;
export const PulseIcon = () => <svg {...base}><path d="M3 12h4l3-7 4 14 3-7h4" /></svg>;
export const AuditIcon = () => <svg {...base}><path d="M6 3h9l4 4v14H6z" /><path d="M9 12h7M9 16h7" /></svg>;
export const MegaphoneIcon = () => <svg {...base}><path d="M4 10v4h3l5 4V6L7 10z" /><path d="M16 9a4 4 0 0 1 0 6" /></svg>;
export const PlusIcon = () => <svg {...base} width={16} height={16} strokeWidth={2.5}><path d="M12 5v14M5 12h14" /></svg>;

export function LogoMark({ size = 28, fill = 'currentColor' }: { size?: number; fill?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <path d="M20 3l15 8.5v17L20 37 5 28.5v-17z" fill={fill} />
      <circle cx="20" cy="20" r="6" fill="var(--brand)" />
    </svg>
  );
}
export const UsersIcon = () => <svg {...base}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c1.8.7 3 2.5 3.5 5.2" /></svg>;
export const KeyIcon = () => <svg {...base}><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M17 6l3 3M15 8l2 2" /></svg>;
export const LockIcon = () => <svg {...base} width={14} height={14}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>;
export const ChevronIcon = () => <svg {...base} width={14} height={14}><path d="M6 9l6 6 6-6" /></svg>;
