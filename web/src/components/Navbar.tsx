import {
  ClipboardCheck,
  LayoutDashboard,
  List,
  PieChart,
  Plus,
  RefreshCw,
  Settings,
  Wallet,
  Wifi,
  WifiOff,
} from "lucide-react";
import { formatDate } from "../utils/formatters";

export type TabKey =
  | "dashboard"
  | "transactions"
  | "add"
  | "review"
  | "analytics";

interface NavbarProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  pendingReviewCount: number;
  isOnline: boolean;
  syncing?: boolean;
  onSync: () => void;
  lastSyncedAt?: string | null;
  onOpenSettings?: () => void;
}

const tabs = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "transactions", label: "Transactions", icon: List },
  { key: "add", label: "Add", icon: Plus },
  { key: "review", label: "UPI Review", icon: ClipboardCheck },
  { key: "analytics", label: "Analytics", icon: PieChart },
] as const;

function SyncControls({
  isOnline,
  syncing,
  onSync,
  lastSyncedAt,
  onOpenSettings,
}: Pick<
  NavbarProps,
  "isOnline" | "syncing" | "onSync" | "lastSyncedAt" | "onOpenSettings"
>) {
  return (
    <>
      <span className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
        <span
          className={`h-2 w-2 rounded-full ${
            isOnline ? "bg-emerald-500" : "bg-rose-500"
          }`}
        />
        {isOnline ? "Online" : "Offline"}
      </span>
      <button
        type="button"
        onClick={onSync}
        disabled={syncing || !isOnline}
        className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        title={
          lastSyncedAt ? `Last synced ${formatDate(lastSyncedAt)}` : "Sync now"
        }
      >
        <RefreshCw
          className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`}
        />
        {syncing ? "Syncing..." : "Sync"}
      </button>
      {onOpenSettings && (
        <button
          type="button"
          onClick={onOpenSettings}
          className="rounded-full border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          title="Cloud Sync & Settings"
          aria-label="Settings"
        >
          <Settings className="h-4 w-4" />
        </button>
      )}
    </>
  );
}

export function Navbar({
  activeTab,
  onTabChange,
  pendingReviewCount,
  isOnline,
  syncing = false,
  onSync,
  lastSyncedAt,
  onOpenSettings,
}: NavbarProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-600 text-white shadow-sm">
              <Wallet className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold tracking-tight text-slate-900">
                RupeeTrack
              </p>
              <p className="text-[11px] text-slate-500">
                Offline-first expense tracker
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 lg:hidden">
            <SyncControls
              isOnline={isOnline}
              syncing={syncing}
              onSync={onSync}
              lastSyncedAt={lastSyncedAt}
              onOpenSettings={onOpenSettings}
            />
          </div>
        </div>

        <nav className="order-3 flex items-center gap-1 overflow-x-auto pb-1 lg:order-none lg:mx-0 lg:pb-0">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => onTabChange(tab.key)}
                className={`relative inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
                {tab.key === "review" && pendingReviewCount > 0 && (
                  <span className="ml-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-amber-950">
                    {pendingReviewCount > 99 ? "99+" : pendingReviewCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          {isOnline ? (
            <Wifi className="h-4 w-4 text-emerald-500" />
          ) : (
            <WifiOff className="h-4 w-4 text-rose-500" />
          )}
          <SyncControls
            isOnline={isOnline}
            syncing={syncing}
            onSync={onSync}
            lastSyncedAt={lastSyncedAt}
            onOpenSettings={onOpenSettings}
          />
        </div>
      </div>
    </header>
  );
}

export default Navbar;
