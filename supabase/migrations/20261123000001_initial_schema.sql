-- Migration: 20261123000001_initial_schema.sql
-- Offline-First Expense & Income Tracker with UPI Integration

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT,
    currency TEXT NOT NULL DEFAULT 'INR',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Categories Table
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('expense', 'income')),
    icon TEXT NOT NULL DEFAULT 'tag',
    color TEXT NOT NULL DEFAULT '#6366f1',
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- 4. Transactions Table (Integer paise for financial precision)
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY, -- Client-generated UUID
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    amount BIGINT NOT NULL, -- Stored in paise: e.g. ₹150.50 = 15050 paise
    type TEXT NOT NULL CHECK (type IN ('expense', 'income')),
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    description TEXT,
    party_name TEXT, -- Merchant, recipient, or sender name
    payment_method TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'upi', 'card', 'bank_transfer', 'other')),
    source TEXT NOT NULL DEFAULT 'manual', -- 'manual', 'phonepe', 'gpay', 'paytm', 'bank'
    external_reference TEXT, -- UPI UTR or payment reference ID
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    review_status TEXT NOT NULL DEFAULT 'confirmed' CHECK (review_status IN ('pending', 'confirmed', 'rejected')),
    client_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    client_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ -- Tombstone for offline sync deletes
);

-- 5. Registered Devices Table
CREATE TABLE IF NOT EXISTS public.registered_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    device_name TEXT NOT NULL,
    platform TEXT NOT NULL CHECK (platform IN ('web', 'android', 'ios')),
    device_fingerprint TEXT,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Sync Metadata Table
CREATE TABLE IF NOT EXISTS public.sync_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES public.registered_devices(id) ON DELETE CASCADE,
    last_successful_sync TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_device UNIQUE (user_id, device_id)
);

-- 7. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_transactions_user_occurred ON public.transactions(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user_updated ON public.transactions(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_ext_ref ON public.transactions(user_id, external_reference) WHERE external_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_review ON public.transactions(user_id, review_status) WHERE review_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_categories_user ON public.categories(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_registered_devices_user ON public.registered_devices(user_id);

-- 8. Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registered_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_metadata ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Categories Policies
CREATE POLICY "Users can select own or default categories" ON public.categories
    FOR SELECT USING (user_id = auth.uid() OR is_default = TRUE);
CREATE POLICY "Users can insert own categories" ON public.categories
    FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own categories" ON public.categories
    FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can delete own categories" ON public.categories
    FOR DELETE USING (user_id = auth.uid());

-- Transactions Policies
CREATE POLICY "Users can view own transactions" ON public.transactions
    FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert own transactions" ON public.transactions
    FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own transactions" ON public.transactions
    FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can delete own transactions" ON public.transactions
    FOR DELETE USING (user_id = auth.uid());

-- Devices & Sync Policies
CREATE POLICY "Users manage own devices" ON public.registered_devices
    FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users manage own sync metadata" ON public.sync_metadata
    FOR ALL USING (user_id = auth.uid());

-- 9. Automatic updated_at trigger function
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_categories_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_transactions_updated_at BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_sync_metadata_updated_at BEFORE UPDATE ON public.sync_metadata FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 10. Default Categories Seeding Function
CREATE OR REPLACE FUNCTION public.seed_default_categories(for_user_id UUID)
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.categories (id, user_id, name, type, icon, color, is_default) VALUES
    (gen_random_uuid(), for_user_id, 'Food & Dining', 'expense', 'utensils', '#f97316', false),
    (gen_random_uuid(), for_user_id, 'Groceries', 'expense', 'shopping-cart', '#10b981', false),
    (gen_random_uuid(), for_user_id, 'Transportation', 'expense', 'car', '#3b82f6', false),
    (gen_random_uuid(), for_user_id, 'Shopping', 'expense', 'shopping-bag', '#ec4899', false),
    (gen_random_uuid(), for_user_id, 'Bills & Utilities', 'expense', 'receipt', '#8b5cf6', false),
    (gen_random_uuid(), for_user_id, 'Entertainment', 'expense', 'film', '#eab308', false),
    (gen_random_uuid(), for_user_id, 'Healthcare', 'expense', 'heart-pulse', '#ef4444', false),
    (gen_random_uuid(), for_user_id, 'Salary', 'income', 'briefcase', '#10b981', false),
    (gen_random_uuid(), for_user_id, 'Business & Freelance', 'income', 'trending-up', '#06b6d4', false),
    (gen_random_uuid(), for_user_id, 'Cash Gift & Received', 'income', 'gift', '#84cc16', false),
    (gen_random_uuid(), for_user_id, 'Other Income', 'income', 'plus-circle', '#64748b', false),
    (gen_random_uuid(), for_user_id, 'Other Expense', 'expense', 'minus-circle', '#64748b', false)
    ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql;

