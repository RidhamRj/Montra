import { useEffect, useState, useCallback } from "react";
import { Navbar, type TabKey } from "./components/Navbar";
import { Dashboard } from "./components/Dashboard";
import { TransactionList } from "./components/TransactionList";
import { AddTransactionModal } from "./components/AddTransactionModal";
import { UpiReviewView } from "./components/UpiReviewView";
import { AnalyticsView } from "./components/AnalyticsView";
import { SettingsModal } from "./components/SettingsModal";
import { db } from "./db/expenseDb";
import { syncNow, isOnline } from "./services/syncService";
import { ensureDefaultCategories } from "./services/categoryService";

const USER_ID = "local-user";

export function App() {
  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [onlineStatus, setOnlineStatus] = useState<boolean>(isOnline());
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await db.transactions
        .where("reviewStatus")
        .equals("pending")
        .filter((tx) => tx.deletedAt === null)
        .count();
      setPendingCount(count);
    } catch {
      // Ignore
    }
  }, []);

  const refreshSyncState = useCallback(async () => {
    try {
      const syncState = await db.syncState.get("last_successful_sync");
      if (syncState) {
        setLastSyncedAt(syncState.value);
      }
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    // 1. Ensure default Indian categories seeded in IndexedDB
    ensureDefaultCategories(USER_ID).catch(() => {});

    // 2. Fetch initial sync state & pending count
    refreshPendingCount();
    refreshSyncState();

    // 3. Online/Offline event listeners
    const handleOnline = () => {
      setOnlineStatus(true);
      // Auto-trigger sync when network reconnects
      handleSync();
    };
    const handleOffline = () => setOnlineStatus(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [refreshPendingCount, refreshSyncState]);

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      await syncNow();
      await refreshSyncState();
      await refreshPendingCount();
      setRefreshTrigger((prev) => prev + 1);
    } finally {
      setSyncing(false);
    }
  };

  const handleTabChange = (tab: TabKey) => {
    if (tab === "add") {
      setIsAddModalOpen(true);
    } else {
      setActiveTab(tab);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Navbar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        pendingReviewCount={pendingCount}
        isOnline={onlineStatus}
        syncing={syncing}
        onSync={handleSync}
        lastSyncedAt={lastSyncedAt}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6">
        {activeTab === "dashboard" && (
          <Dashboard
            key={refreshTrigger}
            userId={USER_ID}
            onReviewPending={() => setActiveTab("review")}
            onViewAllTransactions={() => setActiveTab("transactions")}
          />
        )}

        {activeTab === "transactions" && (
          <TransactionList
            key={refreshTrigger}
            userId={USER_ID}
            onAdd={() => setIsAddModalOpen(true)}
          />
        )}

        {activeTab === "review" && (
          <UpiReviewView
            key={refreshTrigger}
            userId={USER_ID}
            onReviewed={() => {
              refreshPendingCount();
              setRefreshTrigger((prev) => prev + 1);
            }}
          />
        )}

        {activeTab === "analytics" && (
          <AnalyticsView
            key={refreshTrigger}
            userId={USER_ID}
          />
        )}
      </main>

      <AddTransactionModal
        open={isAddModalOpen}
        userId={USER_ID}
        onClose={() => setIsAddModalOpen(false)}
        onCreated={() => {
          setIsAddModalOpen(false);
          refreshPendingCount();
          setRefreshTrigger((prev) => prev + 1);
        }}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSyncCompleted={handleSync}
      />
    </div>
  );
}

export default App;

