import { useMemo, useState, useEffect, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, BadgeCheck, BarChart3, BriefcaseBusiness,
  Building2, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Clock3,
  FileClock, Flag, Gauge, LifeBuoy, LockKeyhole, Megaphone, Package, RefreshCw, Search, Settings2,
  Shield, ShieldAlert, ShieldCheck, SlidersHorizontal, Star, Store, Users, X,
} from 'lucide-react';
import {
  getGetAdminAccessQueryKey, getGetAdminAnalyticsQueryKey, getGetAdminDashboardQueryKey,
  getGetAdminSettingsQueryKey, getGetAdminUserActivityQueryKey, getGetAdminUserQueryKey,
  getGetMyBusinessQueryKey, getGetMyServiceProviderQueryKey, getGetMyVerificationRequestsQueryKey,
  getGetProfileQueryKey, getGetVerificationHistoryQueryKey,
  getListAdminAuditLogsQueryKey, getListAdminRolesQueryKey, getListAdminUsersQueryKey,
  getListContentReportsQueryKey, getListModerationContentQueryKey, getListVerificationRequestsQueryKey,
  useAssignAdminRole, useBootstrapSuperAdmin, useCreateContentReport, useCreateNotificationAnnouncement,
  useCreateVerificationRequest, useGetAdminAccess, useGetAdminAnalytics, useGetAdminDashboard,
  useGetAdminSettings, useGetAdminUser, useGetAdminUserActivity, useGetMyVerificationRequests,
  useGetMyBusiness, useGetMyServiceProvider, useGetProfile, useGetVerificationHistory,
  useListAdminAuditLogs, useListAdminRoles, useListAdminUsers,
  useListContentReports, useListModerationContent, useListVerificationRequests, useModerateContent,
  useRemoveAdminRole, useResetUserVerification, useUpdateAdminSettings, useUpdateAdminUserStatus,
  useUpdateContentReport, useUpdateVerificationRequest,
  type AdminDashboard, type AdminPermission, type AdminRoleName, type AdminSettings, type AdminUserDetail, type AdminUserSummary,
  type CreateContentReportInputEntityType, type ListAdminAuditLogsParams, type ListAdminUsersParams,
  type ListContentReportsParams, type ListModerationContentParams, type ListVerificationRequestsParams,
  type VerificationRequestEntityType, type VerificationStatus,
} from '@workspace/api-client-react';

type Section = 'overview' | 'users' | 'verification' | 'reports' | 'moderation' | 'analytics' | 'audit' | 'roles' | 'settings';

const sections: { id: Section; label: string; icon: typeof Gauge; permission: AdminPermission }[] = [
  { id: 'overview', label: 'Overview', icon: Gauge, permission: 'dashboard.read' },
  { id: 'users', label: 'People', icon: Users, permission: 'users.read' },
  { id: 'verification', label: 'Verification', icon: BadgeCheck, permission: 'verification.read' },
  { id: 'reports', label: 'Reports', icon: Flag, permission: 'reports.read' },
  { id: 'moderation', label: 'Content review', icon: ShieldAlert, permission: 'moderation.manage' },
  { id: 'analytics', label: 'Signals', icon: BarChart3, permission: 'analytics.read' },
  { id: 'audit', label: 'Audit trail', icon: FileClock, permission: 'audit.read' },
  { id: 'roles', label: 'Steward access', icon: LockKeyhole, permission: 'roles.manage' },
  { id: 'settings', label: 'Platform settings', icon: Settings2, permission: 'settings.read' },
];

const panel = 'rounded-[22px] border border-[#e9e3d8] bg-white shadow-[0_8px_24px_rgba(16,72,50,.045)]';
const input = 'w-full rounded-xl border border-[#e4ded3] bg-[#fffefa] px-3 py-2.5 text-sm text-[#174d37] outline-none transition focus:border-[#087044] focus:ring-2 focus:ring-[#d9ecde]';
const primaryButton = 'focus-ring inline-flex items-center justify-center gap-2 rounded-xl bg-[#087044] px-3.5 py-2.5 text-xs font-bold text-white transition hover:bg-[#075d3e] disabled:cursor-not-allowed disabled:opacity-50';
const quietButton = 'focus-ring inline-flex items-center justify-center gap-2 rounded-xl border border-[#dfe7dc] bg-white px-3 py-2 text-xs font-bold text-[#276348] transition hover:bg-[#f4faf4] disabled:cursor-not-allowed disabled:opacity-50';
const eyebrow = 'text-[10px] font-bold uppercase tracking-[.16em] text-[#d96714]';
const heading = 'font-display text-[27px] font-extrabold tracking-[-.045em] text-[#164d38] md:text-[32px]';

function errorStatus(error: unknown) {
  if (!error || typeof error !== 'object') return undefined;
  const value = error as { status?: number; statusCode?: number; response?: { status?: number } };
  return value.status ?? value.statusCode ?? value.response?.status;
}

function useNotice() {
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const say = (text: string, error = false) => {
    setNotice({ text, error });
    window.setTimeout(() => setNotice(null), 4200);
  };
  return { notice, say };
}

function Notice({ notice }: { notice: { text: string; error?: boolean } | null }) {
  if (!notice) return null;
  return <p role={notice.error ? 'alert' : 'status'} className={`rounded-xl px-3.5 py-2.5 text-xs font-semibold ${notice.error ? 'bg-[#fff0ed] text-[#a24430]' : 'bg-[#e8f5ed] text-[#087044]'}`} data-testid={notice.error ? 'status-admin-error' : 'status-admin-success'}>{notice.text}</p>;
}

function Skeleton({ rows = 3 }: { rows?: number }) {
  return <div className="space-y-3" aria-label="Loading workspace" data-testid="admin-loading-skeleton">{Array.from({ length: rows }, (_, index) => <div key={index} className="skeleton h-[58px] rounded-xl" />)}</div>;
}

function EmptyState({ title, copy, icon: Icon = CircleHelp }: { title: string; copy: string; icon?: typeof CircleHelp }) {
  return <div className="px-5 py-11 text-center" data-testid="admin-empty-state"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e8f3e9] text-[#087044]"><Icon size={22} /></span><h3 className="mt-3 font-display text-base font-extrabold text-[#164d38]">{title}</h3><p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-[#7d8b80]">{copy}</p></div>;
}

function QueryProblem({ retry, denied = false }: { retry: () => void; denied?: boolean }) {
  if (denied) return <div className={`${panel} p-6`} role="alert"><div className="flex items-start gap-3"><span className="rounded-xl bg-[#fff0ed] p-2 text-[#a24430]"><LockKeyhole size={19} /></span><div><h3 className="font-display font-extrabold text-[#164d38]">Access is limited</h3><p className="mt-1 text-xs leading-relaxed text-[#718177]">Your current staff access does not include this information. Ask a ShopNear administrator if you believe that is unexpected.</p></div></div></div>;
  return <div className="rounded-2xl border border-[#f0d7cd] bg-[#fff7f2] p-4" role="alert"><p className="text-sm font-bold text-[#844631]">This view could not be loaded.</p><p className="mt-1 text-xs text-[#916e5c]">The workspace could not retrieve this information. Try again in a moment.</p><button type="button" onClick={retry} className={`${quietButton} mt-3`} data-testid="button-retry-admin-query"><RefreshCw size={14} />Retry</button></div>;
}

function PageControls({ page, limit, total, hasMore, onPageChange, testId }: { page: number; limit: number; total: number; hasMore: boolean; onPageChange: (page: number) => void; testId: string }) {
  const pageCount = Math.max(1, Math.ceil(total / limit));
  return <div className="flex items-center justify-between gap-3 border-t border-[#eee9df] px-4 py-3"><span className="text-[10px] text-[#879189]">{fmtNumber(total)} records · page {page} of {pageCount}</span><div className="flex gap-2"><button type="button" className={quietButton} disabled={page <= 1} onClick={() => onPageChange(Math.max(1, page - 1))} data-testid={`button-${testId}-previous`}><ChevronLeft size={14} />Previous</button><button type="button" className={quietButton} disabled={!hasMore} onClick={() => onPageChange(page + 1)} data-testid={`button-${testId}-next`}>Next<ChevronRight size={14} /></button></div></div>;
}

function StatusTag({ status }: { status: string }) {
  const tone = status === 'approved' || status === 'active' || status === 'resolved' || status === 'published'
    ? 'bg-[#e7f4e9] text-[#256544]'
    : status === 'rejected' || status === 'suspended' || status === 'deleted' || status === 'dismissed' || status === 'removed'
      ? 'bg-[#fff0ed] text-[#9b4937]'
      : status === 'under_review' || status === 'investigating'
        ? 'bg-[#fff3df] text-[#94601c]'
        : 'bg-[#f2f0e8] text-[#72776e]';
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ${tone}`} data-testid={`status-tag-${status}`}>{status.replaceAll('_', ' ')}</span>;
}

function StatTile({ label, value, detail, icon: Icon, tone = 'green' }: { label: string; value: string | number; detail?: string; icon: typeof Users; tone?: 'green' | 'orange' | 'sand' }) {
  return <article className={`${panel} p-4 md:p-5`}><div className="flex items-start justify-between gap-2"><span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone === 'orange' ? 'bg-[#fff0df] text-[#cc6316]' : tone === 'sand' ? 'bg-[#f4efe3] text-[#896b2e]' : 'bg-[#e6f3e8] text-[#087044]'}`}><Icon size={17} /></span>{detail && <span className="text-[10px] font-semibold text-[#809084]">{detail}</span>}</div><p className="mt-4 font-display text-[25px] font-extrabold tracking-[-.04em] text-[#174d37]">{value}</p><p className="mt-0.5 text-[11px] font-semibold text-[#77867c]">{label}</p></article>;
}

function SectionTitle({ kicker, title, description, action }: { kicker: string; title: string; description: string; action?: ReactNode }) {
  return <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className={eyebrow}>{kicker}</p><h2 className={`${heading} mt-1`}>{title}</h2><p className="mt-1 max-w-2xl text-sm leading-relaxed text-[#77867c]">{description}</p></div>{action}</div>;
}

function DataTable({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[660px] border-collapse text-left">{children}</table></div>;
}

function Th({ children }: { children: ReactNode }) {
  return <th scope="col" className="whitespace-nowrap border-b border-[#eee9df] bg-[#fbfaf6] px-4 py-3 text-[10px] font-bold uppercase tracking-[.1em] text-[#879189]">{children}</th>;
}

function Td({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <td className={`border-b border-[#f1eee7] px-4 py-3.5 align-middle text-xs text-[#486050] last:border-0 ${className}`}>{children}</td>;
}

function MetricBars({ values, label }: { values: number[]; label: string }) {
  const max = Math.max(...values, 1);
  return <div className="flex h-24 items-end gap-1.5" role="img" aria-label={label}>{values.map((value, index) => <div key={index} className="group relative flex h-full flex-1 items-end justify-center"><div className="w-full rounded-t-md bg-[#55a175] transition-all group-hover:bg-[#087044]" style={{ height: `${Math.max(value / max * 100, 4)}%` }} title={`${value}`} /></div>)}</div>;
}

const fmtDate = (value: string) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const fmtTime = (value: string) => new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const fmtNumber = (value: number) => new Intl.NumberFormat().format(value);

export function AdminDashboardPage({ initialSection }: { initialSection?: string } = {}) {
  const queryClient = useQueryClient();
  const access = useGetAdminAccess({ query: { queryKey: getGetAdminAccessQueryKey(), retry: false } });
  const dashboard = useGetAdminDashboard({ query: { queryKey: getGetAdminDashboardQueryKey(), enabled: Boolean(access.data?.permissions.includes('dashboard.read')), retry: false } });
  const [section, setSection] = useState<Section>(() => {
    const candidate = initialSection === 'moderation' ? 'moderation' : initialSection;
    return sections.some((item) => item.id === candidate) ? candidate as Section : 'overview';
  });
  const { notice, say } = useNotice();
  const bootstrap = useBootstrapSuperAdmin();
  const permissions = access.data?.permissions ?? [];
  const can = (permission: AdminPermission) => permissions.includes(permission);
  const dashboardData = dashboard.data as AdminDashboard | undefined;
  const denied = (error: unknown) => errorStatus(error) === 401 || errorStatus(error) === 403;
  const refreshDashboard = () => { void queryClient.invalidateQueries({ queryKey: getGetAdminDashboardQueryKey() }); };

  if (access.isLoading) return <main className="min-h-[100dvh] bg-[#f5f1e9] px-4 py-8 md:px-8"><div className="mx-auto max-w-7xl"><div className="skeleton h-10 w-64 rounded-xl" /><div className="mt-7 grid gap-4 md:grid-cols-[220px_1fr]"><div className="skeleton h-[520px] rounded-[22px]" /><div className="skeleton h-[520px] rounded-[22px]" /></div></div></main>;
  if (access.isError && denied(access.error)) return <AccessDenied />;
  if (access.isError) return <main className="min-h-[100dvh] bg-[#f5f1e9] px-5 py-14"><div className="mx-auto max-w-2xl"><QueryProblem retry={() => void access.refetch()} /></div></main>;
  if (!access.data) return <AccessDenied />;
  if (access.data.role === null) {
    return <main className="min-h-[100dvh] bg-[#f5f1e9] px-5 py-12"><section className={`${panel} mx-auto max-w-xl overflow-hidden`}><div className="h-2 bg-[#f47716]" /><div className="p-7 md:p-10"><p className={eyebrow}>ShopNear steward desk</p><div className="mt-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e6f3e8] text-[#087044]"><ShieldCheck size={28} /></div><h1 className="mt-5 font-display text-3xl font-extrabold tracking-[-.05em] text-[#164d38]">A careful start.</h1><p className="mt-2 text-sm leading-relaxed text-[#758379]">No staff role is attached to this account. If this is the intended first administrator, initialize the workspace to establish the first steward.</p><Notice notice={notice} /><button type="button" onClick={() => bootstrap.mutate(undefined, { onSuccess: () => { say('The first administrator role is ready.'); void queryClient.invalidateQueries({ queryKey: getGetAdminAccessQueryKey() }); }, onError: () => say('The workspace could not be initialized. Please try again.', true) })} disabled={bootstrap.isPending} className={`${primaryButton} mt-5 w-full`} data-testid="button-bootstrap-admin"><ShieldCheck size={16} />{bootstrap.isPending ? 'Setting up access…' : 'Initialize first administrator'}</button><p className="mt-3 text-center text-[10px] text-[#9a9b8f]">This action is shown only when returned staff access is unassigned.</p></div></section></main>;
  }

  const visibleSections = sections.filter((item) => can(item.permission));
  const selected = visibleSections.find((item) => item.id === section) ?? visibleSections[0];
  const setSelected = (value: Section) => setSection(value);
  const sectionProps = { say, notice, refreshDashboard };
  const mainDenied = selected?.id === 'overview' && dashboard.isError && denied(dashboard.error);

  return <main className="min-h-[100dvh] bg-[#f5f1e9] text-[#174d37]">
    <div className="mx-auto max-w-[1440px] px-3 pb-10 pt-4 md:px-7 md:pt-7">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-[#e7e1d6] bg-[#fffdf9] px-4 py-4 shadow-[0_8px_26px_rgba(16,72,50,.04)] md:px-6">
        <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-[15px] bg-[#087044] text-white"><ShieldCheck size={22} /></span><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#d96714]">ShopNear · Steward desk</p><h1 className="font-display text-xl font-extrabold tracking-[-.04em] text-[#164d38] md:text-2xl">Keep nearby trustworthy.</h1></div></div>
        <div className="flex items-center gap-2"><span className="rounded-full border border-[#dce9dd] bg-[#f0f8f1] px-3 py-1.5 text-[10px] font-bold capitalize text-[#276348]" data-testid="text-admin-role">{access.data.role?.replaceAll('_', ' ')}</span><span className="hidden items-center gap-1.5 text-[10px] text-[#829087] sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-[#4a9a65]" />Access checked</span></div>
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-[228px_minmax(0,1fr)]">
        <nav aria-label="Staff workspace sections" className={`${panel} sticky top-3 flex gap-1 overflow-x-auto p-2 lg:flex-col lg:overflow-visible`} data-testid="nav-admin-sections">
          {visibleSections.map(({ id, label, icon: Icon }) => <button type="button" key={id} onClick={() => setSelected(id)} aria-current={section === id ? 'page' : undefined} className={`focus-ring flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${section === id ? 'bg-[#e8f3e9] text-[#087044]' : 'text-[#6e8073] hover:bg-[#faf9f4] hover:text-[#174d37]'}`} data-testid={`button-admin-section-${id}`}><Icon size={16} /><span>{label}</span>{id === 'verification' && dashboardData?.totals.pendingVerifications ? <span className="ml-auto rounded-full bg-[#fff0df] px-1.5 py-0.5 text-[9px] font-bold text-[#a25719]">{dashboardData.totals.pendingVerifications}</span> : null}{id === 'reports' && dashboardData?.totals.pendingReports ? <span className="ml-auto rounded-full bg-[#fff0df] px-1.5 py-0.5 text-[9px] font-bold text-[#a25719]">{dashboardData.totals.pendingReports}</span> : null}</button>)}
          <div className="mt-auto hidden border-t border-[#f0ece4] px-3 pb-1 pt-4 lg:block"><p className="text-[9px] leading-relaxed text-[#a0a59c]">Actions are recorded to support accountable decisions.</p></div>
        </nav>

        <div className="min-w-0 space-y-4">
          <Notice notice={notice} />
          {mainDenied ? <QueryProblem retry={() => void dashboard.refetch()} denied /> :
            selected?.id === 'overview' ? <Overview dashboard={dashboard} refresh={refreshDashboard} onSection={setSelected} /> :
            selected?.id === 'users' ? <PeopleSection {...sectionProps} canManage={can('users.manage')} canRoles={can('roles.manage')} /> :
            selected?.id === 'verification' ? <VerificationSection {...sectionProps} canReview={can('verification.review')} /> :
            selected?.id === 'reports' ? <ReportsSection {...sectionProps} canManage={can('reports.manage')} /> :
            selected?.id === 'moderation' ? <ModerationSection {...sectionProps} /> :
            selected?.id === 'analytics' ? <AnalyticsSection /> :
            selected?.id === 'audit' ? <AuditSection /> :
            selected?.id === 'roles' ? <RolesSection {...sectionProps} /> :
            selected?.id === 'settings' ? <SettingsSection {...sectionProps} canManage={can('settings.manage')} canAnnouncements={can('announcements.manage')} /> :
            <AccessDenied /> }
          <footer className="flex items-center justify-between px-2 pt-1 text-[10px] text-[#9aa198]"><span>Stewardship, close to home.</span><span>ShopNear staff workspace</span></footer>
        </div>
      </div>
    </div>
  </main>;
}

function AccessDenied() {
  return <main className="flex min-h-[100dvh] items-center justify-center bg-[#f5f1e9] px-5 py-12"><section className={`${panel} max-w-lg p-7 text-center md:p-9`}><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fff0ed] text-[#a24430]"><LockKeyhole size={25} /></span><p className={`${eyebrow} mt-5`}>Staff access required</p><h1 className="mt-1 font-display text-2xl font-extrabold text-[#164d38]">This workspace is not available.</h1><p className="mt-2 text-sm leading-relaxed text-[#77867c]">ShopNear could not confirm administrator access for this session. Sign in with an authorized staff account or contact your administrator.</p></section></main>;
}

function Overview({ dashboard, refresh, onSection }: { dashboard: ReturnType<typeof useGetAdminDashboard>; refresh: () => void; onSection: (value: Section) => void }) {
  if (dashboard.isLoading) return <section className={`${panel} p-5`}><Skeleton rows={5} /></section>;
  if (dashboard.isError) return <QueryProblem retry={() => void dashboard.refetch()} denied={errorStatus(dashboard.error) === 401 || errorStatus(dashboard.error) === 403} />;
  const data = dashboard.data as AdminDashboard | undefined;
  if (!data) return <QueryProblem retry={refresh} />;
  const { totals } = data;
  return <div className="space-y-4">
    <SectionTitle kicker="At a glance · last update live" title="A healthier local loop." description={`A ${data.windowDays}-day view of the people, places, and decisions moving through ShopNear.`} action={<button type="button" onClick={refresh} className={quietButton} data-testid="button-refresh-dashboard"><RefreshCw size={14} />Refresh figures</button>} />
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <StatTile label="People on ShopNear" value={fmtNumber(totals.users)} detail={`${totals.businesses} businesses`} icon={Users} />
      <StatTile label="Pending verification" value={fmtNumber(totals.pendingVerifications)} detail="Needs a careful look" icon={BadgeCheck} tone="orange" />
      <StatTile label="Open reports" value={fmtNumber(totals.pendingReports)} detail="Community signals" icon={Flag} tone="sand" />
      <StatTile label="Average rating" value={Number.isFinite(totals.averageRating) ? totals.averageRating.toFixed(1) : '—'} detail={`${fmtNumber(totals.ratings)} ratings`} icon={Star} tone="orange" />
    </div>
    <div className="grid gap-4 xl:grid-cols-[1.05fr_.95fr]">
      <section className={`${panel} overflow-hidden`}>
        <div className="flex items-center justify-between border-b border-[#eee9df] px-4 py-4 md:px-5"><div><p className={eyebrow}>New neighbors</p><h3 className="mt-1 font-display text-lg font-extrabold text-[#164d38]">Recent registrations</h3></div><button type="button" onClick={() => onSection('users')} className="text-xs font-bold text-[#087044] hover:underline" data-testid="button-overview-people">Browse people</button></div>
        {data.recentRegistrations.length ? <div>{data.recentRegistrations.slice(0, 6).map((item) => <div key={item.id} className="flex items-center gap-3 border-b border-[#f2efe8] px-4 py-3 last:border-0 md:px-5"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#e8f3e9] font-display text-xs font-extrabold text-[#087044]">{item.fullName.split(/\s+/).map((word) => word[0]).slice(0, 2).join('').toUpperCase()}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-[#315b43]">{item.fullName}</p><p className="mt-0.5 truncate text-[10px] capitalize text-[#8b958c]">{item.accountType.replaceAll('_', ' ')}{item.city ? ` · ${item.city}${item.state ? `, ${item.state}` : ''}` : ''}</p></div><div className="text-right"><StatusTag status={item.status} /><time className="mt-1 block text-[9px] text-[#9ba197]">{fmtDate(item.createdAt)}</time></div></div>)}</div> : <EmptyState title="No new registrations" copy="New ShopNear accounts will appear here as the neighborhood joins." icon={Users} />}
      </section>
      <section className={`${panel} overflow-hidden`}>
        <div className="border-b border-[#eee9df] px-4 py-4 md:px-5"><p className={eyebrow}>Recent decisions</p><h3 className="mt-1 font-display text-lg font-extrabold text-[#164d38]">Steward activity</h3></div>
        {data.recentActivity.length ? <ol className="divide-y divide-[#f2efe8]">{data.recentActivity.slice(0, 7).map((item) => <li key={item.id} className="flex gap-3 px-4 py-3 md:px-5"><span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#f5f3ed] text-[#728676]"><Activity size={15} /></span><div className="min-w-0 flex-1"><p className="text-xs font-semibold leading-relaxed text-[#45604e]">{item.actorName || 'ShopNear staff'} <span className="font-normal text-[#87938a]">{item.action.replaceAll('_', ' ')}</span></p><p className="mt-0.5 text-[10px] text-[#a0a59c]">{[item.entityType, item.entityId].filter(Boolean).join(' · ') || 'Platform activity'} · {fmtTime(item.createdAt)}</p></div></li>)}</ol> : <EmptyState title="No activity recorded" copy="Recent steward actions will be shown here." icon={Activity} />}
      </section>
    </div>
    <section className={`${panel} grid gap-4 p-4 sm:grid-cols-3 md:p-5`}>
      <div className="flex items-center gap-3"><span className="rounded-xl bg-[#f2f5ed] p-2.5 text-[#607d65]"><Store size={17} /></span><div><p className="text-[10px] text-[#859087]">Local storefronts</p><p className="text-sm font-bold text-[#315b43]">{fmtNumber(totals.businesses)} businesses · {fmtNumber(totals.serviceProviders)} providers</p></div></div>
      <div className="flex items-center gap-3"><span className="rounded-xl bg-[#fff1df] p-2.5 text-[#be651d]"><Package size={17} /></span><div><p className="text-[10px] text-[#859087]">Marketplace inventory</p><p className="text-sm font-bold text-[#315b43]">{fmtNumber(totals.products)} products · {fmtNumber(totals.services)} services</p></div></div>
      <div className="flex items-center gap-3"><span className="rounded-xl bg-[#e8f3e9] p-2.5 text-[#087044]"><LifeBuoy size={17} /></span><div><p className="text-[10px] text-[#859087]">Neighborhood pulse</p><p className="text-sm font-bold text-[#315b43]">{fmtNumber(totals.activeConversations)} active conversations</p></div></div>
    </section>
  </div>;
}

function PeopleSection({ say, notice, refreshDashboard, canManage, canRoles }: { say: (text: string, error?: boolean) => void; notice: { text: string; error?: boolean } | null; refreshDashboard: () => void; canManage: boolean; canRoles: boolean }) {
  const client = useQueryClient();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [accountType, setAccountType] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState('');
  useEffect(() => setPage(1), [query, status, accountType]);
  const params = useMemo<ListAdminUsersParams>(() => ({ query: query.trim() || undefined, status: status ? status as ListAdminUsersParams['status'] : undefined, accountType: accountType ? accountType as ListAdminUsersParams['accountType'] : undefined, page, limit: 30 }), [query, status, accountType, page]);
  const list = useListAdminUsers(params, { query: { queryKey: getListAdminUsersQueryKey(params) } });
  const detail = useGetAdminUser(selectedId, { query: { queryKey: getGetAdminUserQueryKey(selectedId), enabled: Boolean(selectedId) } });
  const activity = useGetAdminUserActivity(selectedId, { query: { queryKey: getGetAdminUserActivityQueryKey(selectedId), enabled: Boolean(selectedId) } });
  const updateStatus = useUpdateAdminUserStatus();
  const resetVerification = useResetUserVerification();
  const assignRole = useAssignAdminRole();
  const removeRole = useRemoveAdminRole();
  const [note, setNote] = useState('');
  const [roleChoice, setRoleChoice] = useState<AdminRoleName>('support');
  const rows = list.data?.users ?? [];
  const invalidateUsers = (id?: string) => {
    void client.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
    if (id) void client.invalidateQueries({ queryKey: getGetAdminUserQueryKey(id) });
    refreshDashboard();
  };
  const selectedDetail = detail.data;
  const setUserStatus = (user: AdminUserSummary, next: 'active' | 'suspended' | 'deleted') => updateStatus.mutate({ id: user.id, data: { status: next, note: note.trim() || undefined } }, { onSuccess: () => { say(`Account status updated to ${next.replaceAll('_', ' ')}.`); invalidateUsers(user.id); }, onError: () => say('Account status could not be updated.', true) });
  const reset = (user: AdminUserDetail, entityType: VerificationRequestEntityType) => {
    const id = entityType === 'business' ? user.business?.id : user.serviceProvider?.id;
    if (!id) return;
    resetVerification.mutate({ id, data: { entityType, note: note.trim() || undefined } }, { onSuccess: () => { say('Verification was returned to pending review.'); void client.invalidateQueries({ queryKey: getGetAdminUserQueryKey(user.user.id) }); void client.invalidateQueries({ queryKey: getListVerificationRequestsQueryKey() }); refreshDashboard(); }, onError: () => say('Verification could not be reset.', true) });
  };
  const updateRole = (user: AdminUserSummary, role: AdminRoleName | null) => {
    if (role) assignRole.mutate({ userId: user.id, data: { role } }, { onSuccess: () => { say('Administrator role assigned.'); void client.invalidateQueries({ queryKey: getListAdminUsersQueryKey() }); void client.invalidateQueries({ queryKey: getListAdminRolesQueryKey() }); }, onError: () => say('Administrator role could not be assigned.', true) });
    else removeRole.mutate({ userId: user.id }, { onSuccess: () => { say('Administrator role removed.'); void client.invalidateQueries({ queryKey: getListAdminUsersQueryKey() }); void client.invalidateQueries({ queryKey: getListAdminRolesQueryKey() }); }, onError: () => say('Administrator role could not be removed.', true) });
  };

  return <section>
    <SectionTitle kicker="People & accounts" title="Make room for the whole neighborhood." description="Find an account, review its ShopNear footprint, and take the smallest appropriate action." />
    <Notice notice={notice} />
    <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_350px]">
      <section className={`${panel} overflow-hidden`}>
        <div className="grid gap-2 border-b border-[#eee9df] bg-[#fffdf9] p-3 sm:grid-cols-[minmax(190px,1fr)_150px_170px]">
          <label className="relative"><span className="sr-only">Search people</span><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a978d]" /><input value={query} onChange={(event) => setQuery(event.target.value)} className={`${input} pl-9`} placeholder="Name, phone, or email" data-testid="input-admin-user-search" /></label>
          <label><span className="sr-only">Filter by account status</span><select value={status} onChange={(event) => setStatus(event.target.value)} className={input} data-testid="select-admin-user-status"><option value="">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="deleted">Deleted</option></select></label>
          <label><span className="sr-only">Filter by account type</span><select value={accountType} onChange={(event) => setAccountType(event.target.value)} className={input} data-testid="select-admin-user-type"><option value="">All account types</option><option value="customer">Customer</option><option value="business">Business owner</option><option value="service_provider">Service provider</option><option value="admin">Administrator account</option></select></label>
        </div>
        {list.isLoading ? <div className="p-4"><Skeleton /></div> : list.isError ? <div className="p-4"><QueryProblem retry={() => void list.refetch()} denied={errorStatus(list.error) === 401 || errorStatus(list.error) === 403} /></div> : !rows.length ? <EmptyState title="No accounts match" copy="Try a different name or widen the filters." icon={Users} /> : <>
          <DataTable><thead><tr><Th>Account</Th><Th>Type & location</Th><Th>Status</Th><Th>Joined</Th></tr></thead><tbody>{rows.map((user) => <tr key={user.id} className={`cursor-pointer transition hover:bg-[#fafbf7] ${selectedId === user.id ? 'bg-[#f1f8f1]' : ''}`} onClick={() => setSelectedId(user.id)} onKeyDown={(event) => event.key === 'Enter' && setSelectedId(user.id)} tabIndex={0} data-testid={`row-admin-user-${user.id}`}><Td><div className="flex items-center gap-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#e7f2e8] text-[10px] font-extrabold text-[#087044]">{user.fullName.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span><span className="min-w-0"><strong className="block truncate text-xs text-[#315b43]">{user.fullName}</strong><span className="mt-0.5 block truncate text-[10px] text-[#8c968d]">{user.email || user.phone}</span></span></div></Td><Td><span className="capitalize">{user.accountType.replaceAll('_', ' ')}</span><span className="mt-1 block text-[10px] text-[#90998f]">{[user.city, user.state].filter(Boolean).join(', ') || 'Location not listed'}</span></Td><Td><div className="flex flex-col items-start gap-1.5"><StatusTag status={user.status} />{user.adminRole && <span className="text-[9px] font-bold capitalize text-[#d46718]">{user.adminRole.replaceAll('_', ' ')}</span>}</div></Td><Td>{fmtDate(user.createdAt)}</Td></tr>)}</tbody></DataTable>
           {list.data && <PageControls page={list.data.page} limit={list.data.limit} total={list.data.total} hasMore={list.data.hasMore} onPageChange={setPage} testId="admin-users" />}
        </>}
      </section>
      <section className={`${panel} overflow-hidden`}>
        {!selectedId ? <EmptyState title="Choose an account" copy="A focused profile view keeps account history and decisions together." icon={Users} /> : detail.isLoading ? <div className="p-5"><Skeleton rows={4} /></div> : detail.isError ? <div className="p-4"><QueryProblem retry={() => void detail.refetch()} denied={errorStatus(detail.error) === 401 || errorStatus(detail.error) === 403} /></div> : selectedDetail ? <div>
          <header className="border-b border-[#eee9df] bg-[#fcfbf7] p-4"><div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#dff0e2] font-display font-extrabold text-[#087044]">{selectedDetail.user.fullName.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span><div className="min-w-0 flex-1"><h3 className="truncate font-display text-lg font-extrabold text-[#164d38]">{selectedDetail.user.fullName}</h3><p className="truncate text-xs text-[#7f8c82]">{selectedDetail.user.email || selectedDetail.user.phone}</p><div className="mt-2 flex flex-wrap gap-1.5"><StatusTag status={selectedDetail.user.status} />{selectedDetail.adminRole && <StatusTag status={selectedDetail.adminRole} />}</div></div><button type="button" onClick={() => setSelectedId('')} aria-label="Close account details" className="focus-ring rounded-lg p-1.5 text-[#849187] hover:bg-white" data-testid="button-close-user-detail"><X size={16} /></button></div></header>
          <div className="space-y-4 p-4">
            <div className="grid grid-cols-3 gap-2 text-center">{[['Reports', selectedDetail.activitySummary.reportsSubmitted], ['Reviews', selectedDetail.activitySummary.reviewsWritten], ['Staff actions', selectedDetail.activitySummary.auditActions]].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-[#f8f8f2] p-2.5"><strong className="block font-display text-lg text-[#315b43]">{value}</strong><span className="text-[9px] text-[#859087]">{label}</span></div>)}</div>
            <div><h4 className="text-[10px] font-bold uppercase tracking-[.1em] text-[#88948b]">Account details</h4><dl className="mt-2 space-y-2 text-xs"><div className="flex justify-between gap-3"><dt className="text-[#8b958c]">Account type</dt><dd className="capitalize text-[#45604e]">{selectedDetail.user.accountType.replaceAll('_', ' ')}</dd></div><div className="flex justify-between gap-3"><dt className="text-[#8b958c]">Location</dt><dd className="text-right text-[#45604e]">{[selectedDetail.user.city, selectedDetail.user.state].filter(Boolean).join(', ') || 'Not provided'}</dd></div><div className="flex justify-between gap-3"><dt className="text-[#8b958c]">Joined</dt><dd className="text-[#45604e]">{fmtDate(selectedDetail.user.createdAt)}</dd></div></dl></div>
            {(selectedDetail.business || selectedDetail.serviceProvider) && <div><h4 className="text-[10px] font-bold uppercase tracking-[.1em] text-[#88948b]">Owner listing</h4>{selectedDetail.business && <div className="mt-2 flex items-center justify-between rounded-xl bg-[#f8f8f2] p-3"><span className="text-xs font-semibold text-[#45604e]">{selectedDetail.business.businessName}</span><StatusTag status={selectedDetail.business.verificationStatus} /></div>}{selectedDetail.serviceProvider && <div className="mt-2 flex items-center justify-between rounded-xl bg-[#f8f8f2] p-3"><span className="text-xs font-semibold text-[#45604e]">{selectedDetail.serviceProvider.profession}</span><StatusTag status={selectedDetail.serviceProvider.verificationStatus} /></div>}</div>}
            {canManage && <div className="border-t border-[#eee9df] pt-3"><label className="mb-2 block text-[10px] font-bold uppercase tracking-[.1em] text-[#88948b]" htmlFor="admin-user-note">Decision note</label><textarea id="admin-user-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} rows={2} className={input} placeholder="Optional context for the account record" data-testid="input-admin-user-note" /><div className="mt-2 flex flex-wrap gap-2">{selectedDetail.user.status === 'active' ? <button type="button" className={`${quietButton} text-[#9b4937]`} disabled={updateStatus.isPending} onClick={() => setUserStatus(rows.find((user) => user.id === selectedId) ?? ({ id: selectedId } as AdminUserSummary), 'suspended')} data-testid="button-suspend-user">Suspend</button> : <button type="button" className={quietButton} disabled={updateStatus.isPending} onClick={() => setUserStatus(rows.find((user) => user.id === selectedId) ?? ({ id: selectedId } as AdminUserSummary), 'active')} data-testid="button-reactivate-user">Set active</button>}<button type="button" className={`${quietButton} text-[#9b4937]`} disabled={updateStatus.isPending || selectedDetail.user.status === 'deleted'} onClick={() => setUserStatus(rows.find((user) => user.id === selectedId) ?? ({ id: selectedId } as AdminUserSummary), 'deleted')} data-testid="button-delete-user">Mark deleted</button></div></div>}
            {canManage && (selectedDetail.business || selectedDetail.serviceProvider) && <div><h4 className="text-[10px] font-bold uppercase tracking-[.1em] text-[#88948b]">Verification</h4><div className="mt-2 flex flex-wrap gap-2">{selectedDetail.business && <button type="button" className={quietButton} disabled={resetVerification.isPending} onClick={() => reset(selectedDetail, 'business')} data-testid="button-reset-business-verification">Reset business review</button>}{selectedDetail.serviceProvider && <button type="button" className={quietButton} disabled={resetVerification.isPending} onClick={() => reset(selectedDetail, 'service_provider')} data-testid="button-reset-provider-verification">Reset provider review</button>}</div></div>}
            {canRoles && <div className="border-t border-[#eee9df] pt-3"><label htmlFor="admin-role-choice" className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.1em] text-[#88948b]">Staff role</label><div className="flex gap-2"><select id="admin-role-choice" value={roleChoice} onChange={(event) => setRoleChoice(event.target.value as AdminRoleName)} className={`${input} min-w-0`} data-testid="select-user-admin-role"><option value="super_admin">Super administrator</option><option value="moderator">Moderator</option><option value="support">Support</option></select><button type="button" className={primaryButton} disabled={assignRole.isPending || removeRole.isPending || selectedDetail.user.status === 'deleted'} onClick={() => updateRole(rows.find((user) => user.id === selectedId) ?? ({ id: selectedId } as AdminUserSummary), roleChoice)} data-testid="button-assign-admin-role">{assignRole.isPending ? 'Saving…' : 'Assign'}</button></div>{selectedDetail.adminRole && <button type="button" className="mt-2 text-[10px] font-semibold text-[#a24430] underline" disabled={removeRole.isPending} onClick={() => updateRole(rows.find((user) => user.id === selectedId) ?? ({ id: selectedId } as AdminUserSummary), null)} data-testid="button-remove-admin-role">Remove current staff role</button>}</div>}
            <div><h4 className="text-[10px] font-bold uppercase tracking-[.1em] text-[#88948b]">Recent account activity</h4>{activity.isLoading ? <div className="mt-2"><Skeleton rows={2} /></div> : activity.isError ? <p className="mt-2 text-xs text-[#a24430]">Activity could not be loaded.</p> : activity.data?.activities.length ? <ul className="mt-2 space-y-2">{activity.data.activities.slice(0, 5).map((item) => <li key={item.id} className="flex justify-between gap-3 text-[10px]"><span className="capitalize text-[#56705e]">{item.kind.replaceAll('_', ' ')}{item.entityType ? ` · ${item.entityType.replaceAll('_', ' ')}` : ''}</span><time className="shrink-0 text-[#9aa198]">{fmtDate(item.createdAt)}</time></li>)}</ul> : <p className="mt-2 text-xs text-[#89948c]">No activity to show.</p>}</div>
          </div>
        </div> : <EmptyState title="Account unavailable" copy="Choose another account or refresh the list." />}
      </section>
    </div>
  </section>;
}

function VerificationSection({ say, notice, refreshDashboard, canReview }: { say: (text: string, error?: boolean) => void; notice: { text: string; error?: boolean } | null; refreshDashboard: () => void; canReview: boolean }) {
  const client = useQueryClient();
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [filter]);
  const params = useMemo<ListVerificationRequestsParams>(() => ({ page, limit: 50, status: filter ? filter as ListVerificationRequestsParams['status'] : undefined }), [filter, page]);
  const queue = useListVerificationRequests(params, { query: { queryKey: getListVerificationRequestsQueryKey(params) } });
  const update = useUpdateVerificationRequest();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [historyTarget, setHistoryTarget] = useState<{ type: VerificationRequestEntityType; id: string } | null>(null);
  const history = useGetVerificationHistory(historyTarget?.type ?? 'business', historyTarget?.id ?? '', { query: { queryKey: getGetVerificationHistoryQueryKey(historyTarget?.type ?? 'business', historyTarget?.id ?? ''), enabled: Boolean(historyTarget) } });
  const refresh = () => { void client.invalidateQueries({ queryKey: getListVerificationRequestsQueryKey() }); refreshDashboard(); };
  const decide = (type: VerificationRequestEntityType, id: string, status: VerificationStatus) => update.mutate({ entityType: type, entityId: id, data: { status, adminNote: notes[id]?.trim() || undefined } }, { onSuccess: () => { say(`Verification marked ${status.replaceAll('_', ' ')}.`); refresh(); void client.invalidateQueries({ queryKey: getGetVerificationHistoryQueryKey(type, id) }); }, onError: () => say('The verification decision could not be saved.', true) });
  const rows = queue.data?.requests ?? [];
  return <section>
    <SectionTitle kicker="Trust & identity" title="Verification, with a clear trail." description="Review owner-submitted evidence notes and keep each decision attached to its listing." action={<label className="flex items-center gap-2 text-xs text-[#78867c]"><span className="sr-only">Filter verification requests</span><SlidersHorizontal size={14} /><select value={filter} onChange={(event) => setFilter(event.target.value)} className={`${input} w-auto min-w-[145px]`} data-testid="select-verification-status"><option value="">All cases</option><option value="pending">Pending</option><option value="under_review">Under review</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="suspended">Suspended</option></select></label>} />
    <Notice notice={notice} />
    {!canReview && <p className="mt-3 rounded-xl bg-[#fff3df] px-3 py-2.5 text-xs text-[#80551d]">Read access only. Your current permissions do not allow verification decisions.</p>}
    <section className={`${panel} mt-4 overflow-hidden`}>
      {queue.isLoading ? <div className="p-4"><Skeleton rows={4} /></div> : queue.isError ? <div className="p-4"><QueryProblem retry={() => void queue.refetch()} denied={errorStatus(queue.error) === 401 || errorStatus(queue.error) === 403} /></div> : !rows.length ? <EmptyState title="No cases in this view" copy="Verification requests will appear here when owners submit their business or provider details." icon={BadgeCheck} /> : <div className="divide-y divide-[#f0ece4]">{rows.map((item) => {
        const targetId = item.id;
        return <article key={`${item.entityType}-${item.id}`} className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_minmax(250px,.8fr)] md:p-5" data-testid={`card-verification-${item.id}`}>
          <div><div className="flex flex-wrap items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e8f3e9] text-[#087044]">{item.entityType === 'business' ? <Building2 size={17} /> : <BriefcaseBusiness size={17} />}</span><div className="min-w-0"><h3 className="truncate text-sm font-bold text-[#315b43]">{item.name}</h3><p className="text-[10px] capitalize text-[#89948c]">{item.entityType.replaceAll('_', ' ')} · Submitted {fmtDate(item.submittedAt)}</p></div><StatusTag status={item.status} /></div><div className="mt-3 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2"><p><span className="text-[#94a097]">Owner </span><strong className="font-semibold text-[#46604e]">{item.ownerName}</strong></p><p><span className="text-[#94a097]">Phone </span><a href={`tel:${item.ownerPhone}`} className="font-semibold text-[#087044] underline-offset-2 hover:underline">{item.ownerPhone}</a></p>{item.ownerEmail && <p className="sm:col-span-2"><span className="text-[#94a097]">Email </span>{item.ownerEmail}</p>}</div>{item.applicantNote && <blockquote className="mt-3 rounded-xl border-l-2 border-[#e8a45c] bg-[#fbf8f1] px-3 py-2 text-xs leading-relaxed text-[#657469]">“{item.applicantNote}”</blockquote>}{item.adminNote && <p className="mt-2 text-[10px] text-[#8b958c]">Last note: {item.adminNote}</p>}<button type="button" onClick={() => setHistoryTarget({ type: item.entityType, id: targetId })} className="mt-3 inline-flex items-center gap-1 text-[10px] font-bold text-[#087044] hover:underline" data-testid={`button-verification-history-${item.id}`}><Clock3 size={13} />Decision history</button></div>
          <div className="rounded-[17px] bg-[#faf9f4] p-3.5"><label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.1em] text-[#89948c]" htmlFor={`verification-note-${item.id}`}>Staff note</label><textarea id={`verification-note-${item.id}`} value={notes[item.id] ?? ''} maxLength={2000} rows={3} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))} disabled={!canReview || update.isPending} className={`${input} resize-y`} placeholder="Add context to the decision" data-testid={`input-verification-note-${item.id}`} />{canReview && <div className="mt-2 flex flex-wrap gap-2">{(['approved', 'rejected', 'under_review'] as VerificationStatus[]).map((status) => <button key={status} type="button" onClick={() => decide(item.entityType, targetId, status)} disabled={update.isPending} className={status === 'approved' ? primaryButton : quietButton} data-testid={`button-verification-${status}-${item.id}`}>{status === 'approved' ? <Check size={14} /> : null}{status === 'under_review' ? 'Mark reviewing' : status === 'approved' ? 'Approve' : 'Decline'}</button>)}</div>}</div>
        </article>;
      })}</div>}
      {queue.data && <PageControls page={queue.data.page} limit={queue.data.limit} total={queue.data.total} hasMore={queue.data.hasMore} onPageChange={setPage} testId="verification-queue" />}
    </section>
    {historyTarget && <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#123b2c]/35 p-0 backdrop-blur-[2px] md:items-center md:p-5" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setHistoryTarget(null)}><section role="dialog" aria-modal="true" aria-labelledby="verification-history-title" className="max-h-[80dvh] w-full max-w-xl overflow-y-auto rounded-t-[24px] bg-[#fffdf9] p-5 shadow-2xl md:rounded-[24px]" data-testid="dialog-verification-history"><header className="flex items-start justify-between"><div><p className={eyebrow}>Accountability</p><h3 id="verification-history-title" className="mt-1 font-display text-xl font-extrabold text-[#164d38]">Decision history</h3></div><button type="button" onClick={() => setHistoryTarget(null)} aria-label="Close verification history" className="focus-ring rounded-lg p-2 text-[#829087] hover:bg-[#f5f2ea]" data-testid="button-close-verification-history"><X size={17} /></button></header>{history.isLoading ? <div className="mt-4"><Skeleton /></div> : history.isError ? <div className="mt-4"><QueryProblem retry={() => void history.refetch()} denied={errorStatus(history.error) === 401 || errorStatus(history.error) === 403} /></div> : history.data?.history.length ? <ol className="mt-5 space-y-4">{history.data.history.map((entry) => <li key={entry.id} className="relative flex gap-3"><span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#e9852c]" /><div className="min-w-0 flex-1 border-b border-[#f0ece4] pb-3"><div className="flex flex-wrap items-center justify-between gap-2"><StatusTag status={entry.newStatus} /><time className="text-[10px] text-[#929b91]">{fmtTime(entry.createdAt)}</time></div><p className="mt-1 text-xs text-[#587061]">{entry.actorName || 'ShopNear staff'}{entry.previousStatus ? ` · from ${entry.previousStatus.replaceAll('_', ' ')}` : ''}</p>{entry.note && <p className="mt-1 text-xs leading-relaxed text-[#7c897f]">{entry.note}</p>}</div></li>)}</ol> : <EmptyState title="No decisions yet" copy="This listing has no recorded verification history." />}</section></div>}
  </section>;
}

function ReportsSection({ say, notice, refreshDashboard, canManage }: { say: (text: string, error?: boolean) => void; notice: { text: string; error?: boolean } | null; refreshDashboard: () => void; canManage: boolean }) {
  const client = useQueryClient();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [status]);
  const params = useMemo<ListContentReportsParams>(() => ({ page, limit: 30, status: status ? status as ListContentReportsParams['status'] : undefined }), [status, page]);
  const reports = useListContentReports(params, { query: { queryKey: getListContentReportsQueryKey(params) } });
  const update = useUpdateContentReport();
  const profile = useGetProfile({ query: { queryKey: getGetProfileQueryKey() } });
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});
  const rows = reports.data?.reports ?? [];
  const updateReport = (id: string, nextStatus: 'investigating' | 'resolved' | 'dismissed') => update.mutate({ id, data: { status: nextStatus, adminNote: draftNotes[id]?.trim() || undefined } }, { onSuccess: () => { say(`Report marked ${nextStatus}.`); void client.invalidateQueries({ queryKey: getListContentReportsQueryKey() }); refreshDashboard(); }, onError: () => say('The report decision could not be saved.', true) });
  const assignReport = (item: (typeof rows)[number]) => {
    const currentUserId = profile.data?.id;
    if (!currentUserId) return;
    const assignedToId = item.assignedToId === currentUserId ? null : currentUserId;
    update.mutate({ id: item.id, data: { status: item.status, assignedToId, adminNote: draftNotes[item.id]?.trim() || undefined } }, { onSuccess: () => { say(assignedToId ? 'Report assigned to you.' : 'Report assignment cleared.'); void client.invalidateQueries({ queryKey: getListContentReportsQueryKey() }); }, onError: () => say('The report assignment could not be saved.', true) });
  };
  return <section><SectionTitle kicker="Community signals" title="Reports deserve a considered response." description="Review concerns raised about listings, reviews, and conversations, assign reports to yourself, and leave a short staff note." action={<label><span className="sr-only">Filter reports</span><select value={status} onChange={(event) => setStatus(event.target.value)} className={`${input} w-auto min-w-[142px]`} data-testid="select-report-status"><option value="">All reports</option><option value="open">Open</option><option value="investigating">Investigating</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option></select></label>} /><Notice notice={notice} />{!canManage && <p className="mt-3 rounded-xl bg-[#fff3df] px-3 py-2.5 text-xs text-[#80551d]">Read access only. Report status and assignment cannot be changed with your current permissions.</p>}
    <section className={`${panel} mt-4 overflow-hidden`}>{reports.isLoading ? <div className="p-4"><Skeleton rows={4} /></div> : reports.isError ? <div className="p-4"><QueryProblem retry={() => void reports.refetch()} denied={errorStatus(reports.error) === 401 || errorStatus(reports.error) === 403} /></div> : !rows.length ? <EmptyState title="No reports in this view" copy="Reports from customers and neighbors will appear here for review." icon={Flag} /> : <div className="divide-y divide-[#f0ece4]">{rows.map((item) => <article key={item.id} className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_minmax(250px,.8fr)] md:p-5" data-testid={`card-content-report-${item.id}`}><div><div className="flex flex-wrap items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#fff0df] text-[#c96718]"><Flag size={15} /></span><h3 className="text-sm font-bold text-[#315b43]">{item.reason}</h3><StatusTag status={item.status} /></div><p className="mt-2 text-xs text-[#687a6e]"><span className="font-semibold text-[#45604e]">{item.reporterName || 'ShopNear neighbor'}</span>{item.reporterPhone ? ` · ${item.reporterPhone}` : ''} · {fmtTime(item.createdAt)}</p><p className="mt-2 text-[10px] capitalize text-[#8b958c]">About {item.entityType.replaceAll('_', ' ')} · reference {item.entityId}</p>{item.assignedToId && <p className="mt-2 text-[10px] text-[#45604e]">Assigned {item.assignedToId === profile.data?.id ? 'to you' : 'to another administrator'}</p>}{item.details && <p className="mt-3 rounded-xl bg-[#faf9f4] p-3 text-xs leading-relaxed text-[#67766c]">{item.details}</p>}</div><div className="rounded-[17px] bg-[#faf9f4] p-3.5"><label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.1em] text-[#89948c]" htmlFor={`report-note-${item.id}`}>Staff note</label><textarea id={`report-note-${item.id}`} rows={3} maxLength={2000} value={draftNotes[item.id] ?? item.adminNote ?? ''} onChange={(event) => setDraftNotes((current) => ({ ...current, [item.id]: event.target.value }))} disabled={!canManage || update.isPending} className={`${input} resize-y`} placeholder="Document the review outcome" data-testid={`input-report-note-${item.id}`} />{canManage && <div className="mt-2 flex flex-wrap gap-2">{profile.data?.id && <button type="button" disabled={update.isPending} onClick={() => assignReport(item)} className={quietButton} data-testid={`button-report-assignment-${item.id}`}>{item.assignedToId === profile.data.id ? 'Release assignment' : 'Assign to me'}</button>}{(['investigating', 'resolved', 'dismissed'] as const).map((value) => <button key={value} type="button" disabled={update.isPending || item.status === value} onClick={() => updateReport(item.id, value)} className={value === 'resolved' ? primaryButton : quietButton} data-testid={`button-report-${value}-${item.id}`}>{value === 'investigating' ? 'Investigate' : value === 'resolved' ? 'Resolve' : 'Dismiss'}</button>)}</div>}</div></article>)}</div>}{reports.data?.hasMore && <div className="border-t border-[#eee9df] p-3 text-center text-[10px] text-[#8a958b]">More reports are available beyond this page.</div>}</section>
    {reports.data && <PageControls page={reports.data.page} limit={reports.data.limit} total={reports.data.total} hasMore={reports.data.hasMore} onPageChange={setPage} testId="content-reports" />}
  </section>;
}

function ModerationSection({ say, notice, refreshDashboard }: { say: (text: string, error?: boolean) => void; notice: { text: string; error?: boolean } | null; refreshDashboard: () => void }) {
  const client = useQueryClient();
  const [query, setQuery] = useState('');
  const [entityType, setEntityType] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [query, entityType]);
  const params = useMemo<ListModerationContentParams>(() => ({ page, limit: 30, query: query.trim() || undefined, entityType: entityType ? entityType as ListModerationContentParams['entityType'] : undefined }), [query, entityType, page]);
  const content = useListModerationContent(params, { query: { queryKey: getListModerationContentQueryKey(params) } });
  const moderate = useModerateContent();
  const [actions, setActions] = useState<Record<string, 'hide' | 'restore' | 'remove' | 'suspend' | 'unsuspend'>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const actionOptions = ['hide', 'restore', 'remove', 'suspend', 'unsuspend'] as const;
  const actionsForEntity = (type: string) => type === 'business' || type === 'service_provider' ? ['suspend', 'unsuspend', 'remove'] as const : ['hide', 'restore', 'remove'] as const;
  const onModerate = (item: NonNullable<typeof content.data>['results'][number]) => {
    const action = actions[item.id] || (item.entityType === 'business' || item.entityType === 'service_provider' ? 'suspend' : 'hide');
    const reason = reasons[item.id]?.trim() || 'Policy review';
    moderate.mutate({ entityType: item.entityType, entityId: item.id, data: { action, reason } }, { onSuccess: () => { say(`Content action recorded: ${action}.`); void client.invalidateQueries({ queryKey: getListModerationContentQueryKey() }); void client.invalidateQueries({ queryKey: getListContentReportsQueryKey() }); refreshDashboard(); }, onError: () => say('The moderation action could not be recorded.', true) });
  };
  return <section><SectionTitle kicker="Listing integrity" title="Review content in context." description="Take an explicit action and include the reason that makes the decision understandable later." action={<div className="flex gap-2"><label className="relative"><span className="sr-only">Search moderated content</span><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a978d]" /><input value={query} onChange={(event) => setQuery(event.target.value)} className={`${input} w-[180px] pl-8 sm:w-[220px]`} placeholder="Search content" data-testid="input-moderation-search" /></label><label><span className="sr-only">Filter content type</span><select value={entityType} onChange={(event) => setEntityType(event.target.value)} className={`${input} w-auto min-w-[115px]`} data-testid="select-moderation-type"><option value="">All types</option><option value="business">Business</option><option value="service_provider">Provider</option><option value="product">Product</option><option value="service">Service</option><option value="review">Review</option><option value="chat_message">Message</option></select></label></div>} /><Notice notice={notice} /><section className={`${panel} mt-4 overflow-hidden`}>{content.isLoading ? <div className="p-4"><Skeleton rows={4} /></div> : content.isError ? <div className="p-4"><QueryProblem retry={() => void content.refetch()} denied={errorStatus(content.error) === 401 || errorStatus(content.error) === 403} /></div> : !content.data?.results.length ? <EmptyState title="Nothing to review here" copy="Use search or choose another content type. ShopNear content that matches this view will appear here." icon={Shield} /> : <div className="divide-y divide-[#f0ece4]">{content.data.results.map((item) => <article key={`${item.entityType}-${item.id}`} className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_minmax(280px,.8fr)] md:p-5" data-testid={`card-moderation-${item.id}`}><div><div className="flex flex-wrap items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#e8f3e9] text-[#087044]"><Shield size={15} /></span><h3 className="text-sm font-bold text-[#315b43]">{item.title}</h3><StatusTag status={item.status} /></div><p className="mt-2 text-[10px] capitalize text-[#8b958c]">{item.entityType.replaceAll('_', ' ')} · {item.ownerName || 'Owner not listed'} · {fmtDate(item.createdAt)}</p>{item.preview && <p className="mt-3 rounded-xl border border-[#f0ece4] bg-[#fcfbf7] p-3 text-xs leading-relaxed text-[#66756b]">{item.preview}</p>}</div><div className="rounded-[17px] bg-[#faf9f4] p-3.5"><label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.1em] text-[#89948c]" htmlFor={`moderation-reason-${item.id}`}>Reason for action</label><textarea id={`moderation-reason-${item.id}`} rows={2} maxLength={1000} minLength={2} value={reasons[item.id] ?? ''} onChange={(event) => setReasons((current) => ({ ...current, [item.id]: event.target.value }))} disabled={moderate.isPending} className={`${input} resize-y`} placeholder="Describe the policy concern" data-testid={`input-moderation-reason-${item.id}`} /><div className="mt-2 flex gap-2"><label className="min-w-0 flex-1"><span className="sr-only">Choose moderation action</span><select value={actions[item.id] || (item.entityType === 'business' || item.entityType === 'service_provider' ? 'suspend' : 'hide')} onChange={(event) => setActions((current) => ({ ...current, [item.id]: event.target.value as typeof actionOptions[number] }))} className={input} disabled={moderate.isPending} data-testid={`select-moderation-action-${item.id}`}>{actionsForEntity(item.entityType).map((action) => <option value={action} key={action}>{action.charAt(0).toUpperCase() + action.slice(1)}</option>)}</select></label><button type="button" onClick={() => onModerate(item)} disabled={moderate.isPending || (reasons[item.id]?.trim().length ?? 0) < 2} className={primaryButton} data-testid={`button-submit-moderation-${item.id}`}>{moderate.isPending ? 'Saving…' : 'Record'}</button></div></div></article>)}</div>}{content.data?.hasMore && <div className="border-t border-[#eee9df] p-3 text-center text-[10px] text-[#8a958b]">More results are available beyond this page.</div>}</section>{content.data && <PageControls page={content.data.page} limit={content.data.limit} total={content.data.total} hasMore={content.data.hasMore} onPageChange={setPage} testId="moderation-queue" />}</section>;
}

function AnalyticsSection() {
  const [days, setDays] = useState(30);
  const params = useMemo(() => ({ days }), [days]);
  const analytics = useGetAdminAnalytics(params, { query: { queryKey: getGetAdminAnalyticsQueryKey(params) } });
  const dashboard = useGetAdminDashboard({ query: { queryKey: getGetAdminDashboardQueryKey() } });
  const data = analytics.data;
  const active = data?.days.map((day) => day.dailyActiveUsers) ?? [];
  const discovery = data?.days.map((day) => day.searches) ?? [];
  return <section><SectionTitle kicker="Signals, not shortcuts" title="Read the neighborhood’s rhythm." description={data?.privacy || 'Aggregate usage and marketplace signals only; patterns are not individual behavior.'} action={<label><span className="sr-only">Analytics time window</span><select value={days} onChange={(event) => setDays(Number(event.target.value))} className={`${input} w-auto`} data-testid="select-analytics-window"><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select></label>} />
    {analytics.isLoading ? <section className={`${panel} p-5`}><Skeleton rows={4} /></section> : analytics.isError ? <QueryProblem retry={() => void analytics.refetch()} denied={errorStatus(analytics.error) === 401 || errorStatus(analytics.error) === 403} /> : data ? <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4"><StatTile label="Daily active users · latest day" value={fmtNumber(data.days.at(-1)?.dailyActiveUsers ?? 0)} icon={Users} /><StatTile label="Searches · period" value={fmtNumber(data.days.reduce((sum, day) => sum + day.searches, 0))} icon={Search} tone="orange" /><StatTile label="New registrations · period" value={fmtNumber(data.days.reduce((sum, day) => sum + day.registrations, 0))} icon={ArrowUpRight} /><StatTile label="Conversations · period" value={fmtNumber(data.days.reduce((sum, day) => sum + day.chats, 0))} icon={Activity} tone="sand" /></div>
      <div className="grid gap-4 lg:grid-cols-2"><section className={`${panel} p-4 md:p-5`}><div className="flex items-center justify-between"><div><p className={eyebrow}>Reach</p><h3 className="mt-1 font-display text-lg font-extrabold text-[#164d38]">Daily active neighbors</h3></div><span className="rounded-full bg-[#e8f3e9] px-2.5 py-1 text-[9px] font-bold text-[#087044]">{data.windowDays} day view</span></div><div className="mt-5"><MetricBars values={active} label={`Daily active users for ${data.windowDays} days`} /></div><div className="mt-2 flex justify-between text-[9px] text-[#99a198]"><span>{data.days[0] ? fmtDate(data.days[0].date) : ''}</span><span>{data.days.at(-1) ? fmtDate(data.days.at(-1)!.date) : ''}</span></div></section>
      <section className={`${panel} p-4 md:p-5`}><div className="flex items-center justify-between"><div><p className={eyebrow}>Discovery</p><h3 className="mt-1 font-display text-lg font-extrabold text-[#164d38]">Searches over time</h3></div><span className="rounded-full bg-[#fff0df] px-2.5 py-1 text-[9px] font-bold text-[#a25719]">All search types</span></div><div className="mt-5"><MetricBars values={discovery} label={`Marketplace searches for ${data.windowDays} days`} /></div><div className="mt-2 flex justify-between text-[9px] text-[#99a198]"><span>{data.days[0] ? fmtDate(data.days[0].date) : ''}</span><span>{data.days.at(-1) ? fmtDate(data.days.at(-1)!.date) : ''}</span></div></section></div>
      <div className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]"><section className={`${panel} overflow-hidden`}><div className="border-b border-[#eee9df] px-4 py-4"><p className={eyebrow}>What’s useful nearby</p><h3 className="mt-1 font-display text-lg font-extrabold text-[#164d38]">Category interest</h3></div>{data.categoryPopularity.length ? <DataTable><thead><tr><Th>Category</Th><Th>Type</Th><Th>Activity</Th></tr></thead><tbody>{data.categoryPopularity.slice(0, 10).map((item, index) => <tr key={`${item.type}-${item.category}`}><Td><div className="flex items-center gap-2"><span className="font-mono text-[10px] text-[#a1a79f]">0{index + 1}</span><strong className="text-[#315b43]">{item.category}</strong></div></Td><Td className="capitalize">{item.type}</Td><Td><div className="flex items-center gap-2"><div className="h-1.5 min-w-[56px] flex-1 overflow-hidden rounded-full bg-[#edf0e8]"><span className="block h-full rounded-full bg-[#5a9a70]" style={{ width: `${Math.max(item.count / Math.max(...data.categoryPopularity.map((row) => row.count), 1) * 100, 3)}%` }} /></div><span className="min-w-8 text-right font-semibold">{fmtNumber(item.count)}</span></div></Td></tr>)}</tbody></DataTable> : <EmptyState title="Category patterns are still forming" copy="Category activity will become available as the marketplace grows." icon={Package} />}</section>
        <section className={`${panel} overflow-hidden`}><div className="border-b border-[#eee9df] px-4 py-4"><p className={eyebrow}>Community trust</p><h3 className="mt-1 font-display text-lg font-extrabold text-[#164d38]">Ratings at a glance</h3></div>{data.ratingDistribution.length ? <div className="space-y-3 p-4">{[...data.ratingDistribution].sort((a, b) => b.rating - a.rating).map((item) => { const max = Math.max(...data.ratingDistribution.map((row) => row.count), 1); return <div key={item.rating} className="flex items-center gap-2 text-xs"><span className="flex w-8 items-center gap-1 font-bold text-[#765e2f]">{item.rating}<Star size={12} fill="#eeb03e" className="text-[#eeb03e]" /></span><div className="h-2 flex-1 overflow-hidden rounded-full bg-[#f0eee6]"><div className="h-full rounded-full bg-[#e6ae3e]" style={{ width: `${item.count / max * 100}%` }} /></div><span className="w-9 text-right text-[10px] text-[#768579]">{fmtNumber(item.count)}</span></div>; })}</div> : <EmptyState title="No ratings yet" copy="Ratings will appear when neighbors share their experience." icon={Star} />}</section></div>
    </div> : <QueryProblem retry={() => void analytics.refetch()} />}
    {dashboard.data && <p className="mt-4 text-[10px] text-[#9aa198]">Current platform totals include {fmtNumber(dashboard.data.totals.reviews)} reviews and {fmtNumber(dashboard.data.totals.products + dashboard.data.totals.services)} active marketplace entries.</p>}
  </section>;
}

function AuditSection() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const params = useMemo<ListAdminAuditLogsParams>(() => ({ page, limit: 30, action: action.trim() || undefined }), [page, action]);
  const logs = useListAdminAuditLogs(params, { query: { queryKey: getListAdminAuditLogsQueryKey(params) } });
  return <section><SectionTitle kicker="Accountability by design" title="A record of steward actions." description="A read-only history helps the team understand what changed, by whom, and when." action={<label className="relative"><span className="sr-only">Filter audit actions</span><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a978d]" /><input value={action} onChange={(event) => { setAction(event.target.value); setPage(1); }} className={`${input} w-[190px] pl-8`} maxLength={100} placeholder="Filter action" data-testid="input-audit-filter" /></label>} />
    <section className={`${panel} overflow-hidden`}>{logs.isLoading ? <div className="p-4"><Skeleton rows={5} /></div> : logs.isError ? <div className="p-4"><QueryProblem retry={() => void logs.refetch()} denied={errorStatus(logs.error) === 401 || errorStatus(logs.error) === 403} /></div> : !logs.data?.logs.length ? <EmptyState title="No matching history" copy="Staff decisions and important changes will be captured here." icon={FileClock} /> : <><DataTable><thead><tr><Th>Action</Th><Th>Steward</Th><Th>Record</Th><Th>Time</Th></tr></thead><tbody>{logs.data.logs.map((entry) => <tr key={entry.id} data-testid={`row-audit-log-${entry.id}`}><Td><span className="inline-flex items-center gap-2 font-semibold capitalize text-[#315b43]"><span className="h-1.5 w-1.5 rounded-full bg-[#df852e]" />{entry.action.replaceAll('_', ' ')}</span></Td><Td>{entry.actorName || 'System action'}{entry.actorUserId && <span className="mt-1 block font-mono text-[9px] text-[#a0a79f]">{entry.actorUserId}</span>}</Td><Td>{entry.entityType ? <span className="capitalize">{entry.entityType.replaceAll('_', ' ')}{entry.entityId ? ` · ${entry.entityId}` : ''}</span> : 'Platform'}</Td><Td><time>{fmtTime(entry.createdAt)}</time>{entry.metadata && <details className="mt-1"><summary className="cursor-pointer text-[9px] font-semibold text-[#087044]" data-testid={`button-audit-metadata-${entry.id}`}>Record details</summary><pre className="mt-2 max-w-[250px] overflow-auto rounded-lg bg-[#f8f7f2] p-2 text-[9px] leading-relaxed text-[#69776c]">{JSON.stringify(entry.metadata, null, 2)}</pre></details>}</Td></tr>)}</tbody></DataTable><div className="flex items-center justify-between border-t border-[#eee9df] px-4 py-3"><span className="text-[10px] text-[#879189]">{fmtNumber(logs.data.total)} audit records</span><div className="flex gap-2"><button type="button" className={quietButton} disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} data-testid="button-audit-previous"><ChevronLeft size={14} />Previous</button><button type="button" className={quietButton} disabled={!logs.data.hasMore} onClick={() => setPage((value) => value + 1)} data-testid="button-audit-next">Next<ChevronRight size={14} /></button></div></div></>}</section>
  </section>;
}

function RolesSection({ say, notice }: { say: (text: string, error?: boolean) => void; notice: { text: string; error?: boolean } | null }) {
  const client = useQueryClient();
  const roles = useListAdminRoles({ query: { queryKey: getListAdminRolesQueryKey() } });
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<AdminRoleName>('support');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState('');
  useEffect(() => setPage(1), [search]);
  const params = useMemo<ListAdminUsersParams>(() => ({ query: search.trim() || undefined, accountType: 'admin', page, limit: 30 }), [search, page]);
  const users = useListAdminUsers(params, { query: { queryKey: getListAdminUsersQueryKey(params) } });
  const assign = useAssignAdminRole();
  const remove = useRemoveAdminRole();
  const assignTo = (id: string, nextRole: AdminRoleName) => assign.mutate({ userId: id, data: { role: nextRole } }, { onSuccess: () => { say('Steward role updated.'); void client.invalidateQueries({ queryKey: getListAdminRolesQueryKey() }); void client.invalidateQueries({ queryKey: getListAdminUsersQueryKey() }); }, onError: () => say('The steward role could not be updated.', true) });
  const removeFrom = (id: string) => remove.mutate({ userId: id }, { onSuccess: () => { say('Steward access removed.'); void client.invalidateQueries({ queryKey: getListAdminRolesQueryKey() }); void client.invalidateQueries({ queryKey: getListAdminUsersQueryKey() }); }, onError: () => say('Steward access could not be removed.', true) });
  const administrators = roles.data?.administrators ?? [];
  return <section><SectionTitle kicker="People entrusted with the keys" title="Steward access stays specific." description="Roles and permissions come from ShopNear’s current access policy. Account type alone never grants administrative authority." /><Notice notice={notice} />
    <section className={`${panel} mt-4 overflow-hidden`}><div className="flex items-center justify-between border-b border-[#eee9df] px-4 py-4 md:px-5"><div><p className={eyebrow}>Assigned access</p><h3 className="mt-1 font-display text-lg font-extrabold text-[#164d38]">Stewards</h3></div><span className="rounded-full bg-[#e8f3e9] px-2.5 py-1 text-[10px] font-bold text-[#276348]">{administrators.length} assigned</span></div>{roles.isLoading ? <div className="p-4"><Skeleton rows={3} /></div> : roles.isError ? <div className="p-4"><QueryProblem retry={() => void roles.refetch()} denied={errorStatus(roles.error) === 401 || errorStatus(roles.error) === 403} /></div> : !administrators.length ? <EmptyState title="No assigned stewards" copy="Authorized ShopNear administrators will appear here." icon={LockKeyhole} /> : <DataTable><thead><tr><Th>Steward</Th><Th>Role</Th><Th>Since</Th><Th>Action</Th></tr></thead><tbody>{administrators.map((person) => <tr key={person.userId}><Td><strong className="block text-[#315b43]">{person.fullName}</strong><span className="text-[10px] text-[#929b91]">{person.email || person.phone}</span></Td><Td><StatusTag status={person.role} /></Td><Td>{fmtDate(person.assignedAt)}</Td><Td><button type="button" className={`${quietButton} text-[#a24430]`} disabled={remove.isPending} onClick={() => removeFrom(person.userId)} data-testid={`button-remove-steward-${person.userId}`}>Remove access</button></Td></tr>)}</tbody></DataTable>}</section>
    <section className={`${panel} mt-4 p-4 md:p-5`}><div className="flex items-center gap-2"><Users size={16} className="text-[#087044]" /><h3 className="font-display text-lg font-extrabold text-[#164d38]">Assign a role to an administrator account</h3></div><p className="mt-1 text-xs leading-relaxed text-[#77867c]">Search existing administrator accounts. Assignment is an explicit staff-access change.</p><div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px_130px]"><label className="relative"><span className="sr-only">Find administrator account</span><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a978d]" /><input value={search} onChange={(event) => setSearch(event.target.value)} className={`${input} pl-8`} placeholder="Find by name, phone, or email" data-testid="input-role-search" /></label><label><span className="sr-only">New staff role</span><select value={role} onChange={(event) => setRole(event.target.value as AdminRoleName)} className={input} data-testid="select-new-admin-role"><option value="super_admin">Super administrator</option><option value="moderator">Moderator</option><option value="support">Support</option></select></label><button type="button" className={primaryButton} disabled={!selectedId || assign.isPending} onClick={() => assignTo(selectedId, role)} data-testid="button-assign-steward">Assign role</button></div>{users.isLoading ? <div className="mt-4"><Skeleton rows={2} /></div> : users.isError ? <p className="mt-3 text-xs text-[#a24430]" role="alert">Administrator accounts could not be loaded.</p> : users.data?.users.length ? <div className="mt-3 divide-y divide-[#f1eee7] rounded-xl border border-[#eee9df]">{users.data.users.map((user) => <button type="button" key={user.id} onClick={() => setSelectedId(user.id)} className={`focus-ring flex w-full items-center gap-3 px-3 py-3 text-left ${selectedId === user.id ? 'bg-[#f1f8f1]' : 'hover:bg-[#fcfbf7]'}`} data-testid={`button-select-steward-${user.id}`}><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#e8f3e9] text-[10px] font-bold text-[#087044]">{user.fullName.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span><span className="min-w-0 flex-1"><strong className="block truncate text-xs text-[#315b43]">{user.fullName}</strong><span className="text-[10px] text-[#8c968d]">{user.email || user.phone}</span></span>{user.adminRole ? <StatusTag status={user.adminRole} /> : <span className="text-[10px] text-[#9aa198]">No role assigned</span>}</button>)}</div> : <EmptyState title="No administrator accounts found" copy="Search results are limited to accounts returned by ShopNear." icon={Users} />}{users.data && <PageControls page={users.data.page} limit={users.data.limit} total={users.data.total} hasMore={users.data.hasMore} onPageChange={setPage} testId="admin-role-search" />}</section>
    <div className="mt-4 grid gap-3 md:grid-cols-3">{(['super_admin', 'moderator', 'support'] as AdminRoleName[]).map((name) => <article key={name} className={`${panel} p-4`}><span className="rounded-full bg-[#e8f3e9] px-2.5 py-1 text-[10px] font-bold capitalize text-[#276348]">{name.replaceAll('_', ' ')}</span><p className="mt-3 text-xs leading-relaxed text-[#77867c]">{name === 'super_admin' ? 'Full access is defined by the server-returned permission set.' : name === 'moderator' ? 'Content and trust responsibilities are bounded by assigned permissions.' : 'Support access is limited to the permissions returned for the role.'}</p></article>)}</div>
  </section>;
}

function SettingsSection({ say, notice, canManage, canAnnouncements }: { say: (text: string, error?: boolean) => void; notice: { text: string; error?: boolean } | null; canManage: boolean; canAnnouncements: boolean }) {
  const client = useQueryClient();
  const settingsQuery = useGetAdminSettings({ query: { queryKey: getGetAdminSettingsQueryKey() } });
  const saveSettings = useUpdateAdminSettings();
  const announce = useCreateNotificationAnnouncement();
  const [values, setValues] = useState<AdminSettings['settings'] | null>(null);
  const [announcement, setAnnouncement] = useState({ title: '', message: '' });
  useEffect(() => { if (settingsQuery.data && !values) setValues(settingsQuery.data.settings); }, [settingsQuery.data, values]);
  const keys: { key: keyof AdminSettings['settings']; label: string; description: string }[] = [
    { key: 'maintenanceMode', label: 'Maintenance mode', description: 'Configuration flag for a future maintenance flow.' },
    { key: 'customerRegistrationEnabled', label: 'Customer registration', description: 'Saved configuration for customer sign-up availability.' },
    { key: 'businessRegistrationEnabled', label: 'Business registration', description: 'Saved configuration for business owner onboarding.' },
    { key: 'providerRegistrationEnabled', label: 'Provider registration', description: 'Saved configuration for service provider onboarding.' },
    { key: 'requireVerificationToPublish', label: 'Verification before publishing', description: 'Saved requirement flag for listing publication.' },
    { key: 'announcementsEnabled', label: 'Announcements', description: 'Saved configuration for ShopNear announcements.' },
    { key: 'aiSearchEnabled', label: 'AI search', description: 'Saved configuration for AI-assisted marketplace discovery.' },
  ];
  const updateToggle = (key: keyof AdminSettings['settings'], checked: boolean) => setValues((current) => current ? { ...current, [key]: checked } : current);
  const submitSettings = (event: FormEvent) => {
    event.preventDefault();
    if (!values || !canManage) return;
    saveSettings.mutate({ data: values }, { onSuccess: () => { say('Configuration saved. Runtime behavior is not yet wired to these settings.'); void client.invalidateQueries({ queryKey: getGetAdminSettingsQueryKey() }); }, onError: () => say('Platform configuration could not be saved.', true) });
  };
  const submitAnnouncement = (event: FormEvent) => {
    event.preventDefault();
    if (!announcement.title.trim() || !announcement.message.trim()) return;
    announce.mutate({ data: { title: announcement.title.trim(), message: announcement.message.trim() } }, { onSuccess: () => { say('Announcement sent.'); setAnnouncement({ title: '', message: '' }); void client.invalidateQueries({ queryKey: getGetAdminDashboardQueryKey() }); }, onError: () => say('Announcement could not be sent.', true) });
  };
  return <section><SectionTitle kicker="Configuration, not enforcement" title="Settings with the future in view." description="The service stores these platform values. Saving them does not currently change runtime behavior." /><Notice notice={notice} />
    <section className={`${panel} mt-4 overflow-hidden`}><header className="border-b border-[#eee9df] px-4 py-4 md:px-5"><p className={eyebrow}>Saved values</p><h3 className="mt-1 font-display text-lg font-extrabold text-[#164d38]">Platform configuration</h3><p className="mt-1 text-xs text-[#879189]">Values are stored as administrative configuration only. Runtime wiring is not yet available.</p></header>
      {settingsQuery.isLoading ? <div className="space-y-3 p-4"><Skeleton rows={4} /></div> : settingsQuery.isError ? <div className="p-4"><QueryProblem retry={() => void settingsQuery.refetch()} denied={errorStatus(settingsQuery.error) === 401 || errorStatus(settingsQuery.error) === 403} /></div> : values ? <form onSubmit={submitSettings} className="p-4 md:p-5"><div className="divide-y divide-[#f0ece4]">{keys.map(({ key, label, description }) => <label key={key} className="flex cursor-pointer items-center justify-between gap-4 py-3.5"><span><span className="block text-xs font-bold text-[#45604e]">{label}</span><span className="mt-0.5 block text-[10px] leading-relaxed text-[#8b958c]">{description}</span></span><input type="checkbox" checked={values[key] as boolean} onChange={(event) => updateToggle(key, event.target.checked)} disabled={!canManage || saveSettings.isPending} className="h-4 w-4 shrink-0 accent-[#087044]" data-testid={`toggle-setting-${key}`} /></label>)}</div><div className="mt-3 border-t border-[#eee9df] pt-4"><label htmlFor="support-email" className="mb-1.5 block text-xs font-bold text-[#45604e]">Support contact email</label><input id="support-email" type="email" value={values.supportContactEmail} onChange={(event) => setValues((current) => current ? { ...current, supportContactEmail: event.target.value } : current)} disabled={!canManage || saveSettings.isPending} className={input} data-testid="input-support-contact-email" /><p className="mt-1 text-[10px] text-[#8b958c]">Saved for future platform support flows.</p></div>{!canManage && <p className="mt-3 rounded-xl bg-[#fff3df] px-3 py-2 text-xs text-[#80551d]">Read access only. Configuration edits are disabled for your current permissions.</p>}<div className="mt-4 flex flex-wrap items-center justify-between gap-3"><span className="text-[10px] text-[#9aa198]">{settingsQuery.data?.updatedAt ? `Last saved ${fmtTime(settingsQuery.data.updatedAt)}` : 'No saved timestamp available'}</span><button type="submit" disabled={!canManage || saveSettings.isPending || !values} className={primaryButton} data-testid="button-save-admin-settings"><Check size={14} />{saveSettings.isPending ? 'Saving…' : 'Save configuration'}</button></div></form> : <EmptyState title="Settings unavailable" copy="No saved platform configuration was returned." icon={Settings2} />}
    </section>
    {canAnnouncements && <section className={`${panel} mt-4 p-4 md:p-5`}><div className="flex items-center gap-2"><span className="rounded-xl bg-[#fff0df] p-2 text-[#c96718]"><Megaphone size={17} /></span><div><p className={eyebrow}>Community update</p><h3 className="font-display text-lg font-extrabold text-[#164d38]">Send an announcement</h3></div></div><p className="mt-1 text-xs text-[#77867c]">Create an announcement using the ShopNear staff announcement action.</p><form onSubmit={submitAnnouncement} className="mt-4 grid gap-3"><label className="text-[10px] font-bold text-[#6d7f73]">Title<input required maxLength={160} value={announcement.title} onChange={(event) => setAnnouncement((current) => ({ ...current, title: event.target.value }))} className={`${input} mt-1 font-normal`} data-testid="input-announcement-title" /></label><label className="text-[10px] font-bold text-[#6d7f73]">Message<textarea required maxLength={2000} rows={3} value={announcement.message} onChange={(event) => setAnnouncement((current) => ({ ...current, message: event.target.value }))} className={`${input} mt-1 resize-y font-normal`} data-testid="input-announcement-message" /></label><div><button type="submit" className={primaryButton} disabled={announce.isPending || !announcement.title.trim() || !announcement.message.trim()} data-testid="button-send-announcement"><Megaphone size={14} />{announce.isPending ? 'Sending…' : 'Send announcement'}</button></div></form></section>}
  </section>;
}

export function VerificationRequestPanel({ entityType, entityId, currentStatus }: { entityType: VerificationRequestEntityType; entityId: string; currentStatus: string }) {
  const client = useQueryClient();
  const profile = useGetProfile({ query: { queryKey: getGetProfileQueryKey(), retry: false } });
  const requests = useGetMyVerificationRequests({ query: { queryKey: getGetMyVerificationRequestsQueryKey(), enabled: Boolean(profile.data?.id) } });
  const businessProfile = useGetMyBusiness({ query: { queryKey: getGetMyBusinessQueryKey(), enabled: entityType === 'business' && Boolean(profile.data?.id), retry: false } });
  const providerProfile = useGetMyServiceProvider({ query: { queryKey: getGetMyServiceProviderQueryKey(), enabled: entityType === 'service_provider' && Boolean(profile.data?.id), retry: false } });
  const actualStatus = (entityType === 'business' ? businessProfile.data?.verificationStatus : providerProfile.data?.verificationStatus) ?? currentStatus;
  const create = useCreateVerificationRequest();
  const [applicantNote, setApplicantNote] = useState('');
  const { notice, say } = useNotice();
  const ownRequests = requests.data?.requests.filter((request) => request.entityType === entityType && request.entityId === entityId) ?? [];
  const pending = ownRequests.some((request) => request.status === 'pending' || request.status === 'under_review');
  const canRequest = actualStatus === 'pending' || actualStatus === 'rejected';
  const entityLabel = entityType === 'business' ? 'business' : 'service provider';
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (pending || !canRequest || !entityId) return;
    create.mutate({ data: { entityType, entityId, applicantNote: applicantNote.trim() || undefined } }, { onSuccess: () => { say('Your verification request has been submitted.'); setApplicantNote(''); void client.invalidateQueries({ queryKey: getGetMyVerificationRequestsQueryKey() }); void client.invalidateQueries({ queryKey: getGetVerificationHistoryQueryKey(entityType, entityId) }); void client.invalidateQueries({ queryKey: entityType === 'business' ? getGetMyBusinessQueryKey() : getGetMyServiceProviderQueryKey() }); }, onError: () => say('Your verification request could not be submitted. Please try again.', true) });
  };
  return <section className={`${panel} overflow-hidden`} data-testid="panel-owner-verification"><header className="flex items-start gap-3 border-b border-[#eee9df] bg-[#fcfbf7] p-4"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e6f3e8] text-[#087044]"><BadgeCheck size={19} /></span><div className="min-w-0 flex-1"><p className={eyebrow}>ShopNear trust</p><h3 className="mt-0.5 font-display text-lg font-extrabold text-[#164d38]">Verification</h3><p className="mt-1 text-xs leading-relaxed text-[#7d8b80]">A clear history helps neighbors recognize accountable local businesses and providers.</p></div><StatusTag status={actualStatus} /></header>
    <div className="p-4"><Notice notice={notice} />{profile.isLoading || requests.isLoading ? <div className="mt-3"><Skeleton rows={2} /></div> : profile.isError && (errorStatus(profile.error) === 401 || errorStatus(profile.error) === 403) ? <p className="mt-3 rounded-xl bg-[#fff3df] p-3 text-xs text-[#80551d]">Sign in to view or submit your verification history.</p> : requests.isError ? <div className="mt-3 flex items-center justify-between rounded-xl bg-[#fff0ed] p-3 text-xs text-[#a24430]" role="alert"><span>Verification history could not be loaded.</span><button type="button" onClick={() => void requests.refetch()} className="font-bold underline" data-testid="button-retry-my-verification">Retry</button></div> : ownRequests.length ? <ol className="space-y-2">{ownRequests.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#eee9df] bg-[#fffefa] p-3" data-testid={`my-verification-${item.id}`}><span><span className="block text-xs font-semibold text-[#45604e]">Request sent {fmtDate(item.createdAt)}</span>{item.adminNote && <span className="mt-1 block text-[10px] text-[#849087]">ShopNear note: {item.adminNote}</span>}</span><StatusTag status={item.status} /></li>)}</ol> : <p className="rounded-xl bg-[#faf9f4] p-3 text-xs text-[#7a887e]">No verification requests submitted for this {entityLabel} yet.</p>}
      {profile.data && !canRequest && <p className="mt-4 rounded-xl bg-[#f4f6f0] p-3 text-xs leading-relaxed text-[#687a6e]">This {entityLabel} is currently {actualStatus.replaceAll('_', ' ')} and cannot submit another request. Contact the ShopNear team if you need help.</p>}
      {profile.data && <form onSubmit={submit} className="mt-4 border-t border-[#eee9df] pt-4"><label htmlFor={`verification-applicant-note-${entityId}`} className="mb-1.5 block text-xs font-bold text-[#45604e]">Note for the ShopNear team <span className="font-normal text-[#9aa198]">(optional)</span></label><textarea id={`verification-applicant-note-${entityId}`} rows={3} maxLength={1000} value={applicantNote} onChange={(event) => setApplicantNote(event.target.value)} disabled={pending || !canRequest || create.isPending} className={input} placeholder="Share any context that may help the review." data-testid="input-applicant-verification-note" />{pending && <p className="mt-2 text-[10px] font-semibold text-[#8b641f]">A request is already under review for this listing.</p>}<button type="submit" disabled={pending || !canRequest || create.isPending || !entityId} className={`${primaryButton} mt-3`} data-testid="button-submit-verification-request"><BadgeCheck size={14} />{create.isPending ? 'Submitting…' : pending ? 'Request under review' : !canRequest ? 'Contact the ShopNear team' : 'Request verification'}</button></form>}
    </div>
  </section>;
}

export function ReportEntityButton({ entityType, entityId }: { entityType: CreateContentReportInputEntityType; entityId: string }) {
  const client = useQueryClient();
  const create = useCreateContentReport();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const { notice, say } = useNotice();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (reason.trim().length < 2 || !entityId) return;
    create.mutate({ data: { entityType, entityId, reason: reason.trim(), details: details.trim() || undefined } }, { onSuccess: () => { say('Thank you. Your report has been sent to the ShopNear team.'); setReason(''); setDetails(''); setOpen(false); void client.invalidateQueries({ queryKey: getListContentReportsQueryKey() }); }, onError: () => say('Your report could not be sent. Please try again.', true) });
  };
  return <div className="inline-flex flex-col items-start gap-2" data-testid={`report-entity-${entityType}-${entityId}`}><button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="focus-ring inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-[#776f60] transition hover:bg-[#f7f4ed] hover:text-[#a44f36]" data-testid={`button-report-entity-${entityType}-${entityId}`}><Flag size={14} />{open ? 'Cancel report' : 'Report this'}</button><Notice notice={notice} />{open && <form onSubmit={submit} className="w-[min(340px,calc(100vw-40px))] rounded-2xl border border-[#e8e1d4] bg-[#fffdf9] p-4 shadow-[0_12px_35px_rgba(16,72,50,.12)]"><div className="flex items-start justify-between gap-2"><div><p className={eyebrow}>Help keep ShopNear safe</p><h3 className="mt-1 font-display font-extrabold text-[#164d38]">What should we know?</h3></div><button type="button" onClick={() => setOpen(false)} aria-label="Close report form" className="focus-ring rounded-lg p-1 text-[#879189] hover:bg-[#f4f1e9]" data-testid={`button-close-report-${entityId}`}><X size={15} /></button></div><label className="mt-3 block text-[10px] font-bold text-[#6d7f73]">Reason<input required minLength={2} maxLength={80} value={reason} onChange={(event) => setReason(event.target.value)} className={`${input} mt-1 font-normal`} placeholder="A short reason" data-testid={`input-report-reason-${entityId}`} /></label><label className="mt-3 block text-[10px] font-bold text-[#6d7f73]">Details <span className="font-normal">(optional)</span><textarea maxLength={1000} rows={3} value={details} onChange={(event) => setDetails(event.target.value)} className={`${input} mt-1 resize-y font-normal`} placeholder="Add useful context" data-testid={`input-report-details-${entityId}`} /></label><button type="submit" disabled={create.isPending || reason.trim().length < 2 || !entityId} className={`${primaryButton} mt-3 w-full`} data-testid={`button-submit-report-${entityId}`}><Flag size={14} />{create.isPending ? 'Sending…' : 'Send report'}</button></form>}</div>;
}
