import { useState } from "react";
import {
  AlertCircle,
  Check,
  Cloud,
  Key,
  RefreshCw,
  Save,
  Sparkles,
  X,
} from "lucide-react";
import {
  getStoredSupabaseConfig,
  saveStoredSupabaseConfig,
} from "../lib/supabase";
import {
  getStoredGeminiApiKey,
  saveStoredGeminiApiKey,
} from "../services/geminiService";
import { syncNow, type SyncResult } from "../services/syncService";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSyncCompleted?: () => void;
}

export function SettingsModal({
  isOpen,
  onClose,
  onSyncCompleted,
}: SettingsModalProps) {
  const currentSupabase = getStoredSupabaseConfig();
  const [supabaseUrl, setSupabaseUrl] = useState(currentSupabase.url);
  const [supabaseKey, setSupabaseKey] = useState(currentSupabase.key);
  const [geminiKey, setGeminiKey] = useState(getStoredGeminiApiKey());

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  if (!isOpen) return null;

  function handleSave() {
    setSaving(true);
    saveStoredSupabaseConfig(supabaseUrl, supabaseKey);
    saveStoredGeminiApiKey(geminiKey);
    setSaving(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  }

  async function handleTestSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      // Save credentials first
      saveStoredSupabaseConfig(supabaseUrl, supabaseKey);
      const res = await syncNow();
      setSyncResult(res);
      onSyncCompleted?.();
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-100 text-emerald-600">
              <Cloud className="h-4 w-4" />
            </span>
            <h2 className="text-lg font-bold text-slate-900">
              Settings & Cloud Sync
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-5 max-h-[75vh] overflow-y-auto pr-1">
          {/* Supabase Sync Section */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Cloud className="h-4 w-4 text-emerald-600" />
              <h3 className="text-sm font-semibold text-slate-900">
                Supabase Cloud Sync
              </h3>
            </div>
            <p className="text-xs text-slate-500">
              Connect to your Supabase project to sync transactions across your
              Android phone companion app and this web dashboard.
            </p>

            <div>
              <label className="block text-xs font-medium text-slate-700">
                Supabase Project URL
              </label>
              <input
                type="text"
                value={supabaseUrl}
                onChange={(e) => setSupabaseUrl(e.target.value)}
                placeholder="https://your-project.supabase.co"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-emerald-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">
                Supabase Anon Key (Public Key)
              </label>
              <input
                type="password"
                value={supabaseKey}
                onChange={(e) => setSupabaseKey(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono text-slate-900 focus:border-emerald-500 focus:outline-hidden"
              />
            </div>

            <div className="pt-2 flex flex-wrap gap-2 items-center">
              <button
                type="button"
                onClick={handleTestSync}
                disabled={syncing}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`}
                />
                {syncing ? "Testing Sync..." : "Test Connection & Sync Now"}
              </button>
            </div>

            {/* Sync Feedback */}
            {syncResult && (
              <div
                className={`mt-2 rounded-lg p-3 text-xs ${
                  syncResult.error
                    ? "bg-rose-50 text-rose-700 border border-rose-200"
                    : "bg-emerald-50 text-emerald-800 border border-emerald-200"
                }`}
              >
                {syncResult.error ? (
                  <div className="flex items-start gap-1.5">
                    <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
                    <span>Sync failed: {syncResult.error}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                    <span>
                      Sync successful! Pulled {syncResult.pulled} remote
                      transactions, pushed {syncResult.pushed}.
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Gemini AI Auto-Categorization Section */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-600" />
              <h3 className="text-sm font-semibold text-slate-900">
                Gemini AI Auto-Categorization
              </h3>
            </div>
            <p className="text-xs text-slate-500">
              Provide a Google Gemini API Key to automatically clean raw bank SMS
              and classify transactions into accurate categories. If left blank,
              Montra uses high-accuracy local heuristics!
            </p>

            <div>
              <label className="block text-xs font-medium text-slate-700">
                Gemini API Key
              </label>
              <div className="relative mt-1">
                <input
                  type="password"
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pr-9 text-xs font-mono text-slate-900 focus:border-purple-500 focus:outline-hidden"
                />
                <Key className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400" />
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                Keys are stored locally in your browser's localStorage and never
                sent to any third party.
              </p>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
          <div>
            {saveSuccess && (
              <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
                <Check className="h-3.5 w-3.5" /> Settings saved!
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

