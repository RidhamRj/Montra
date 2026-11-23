export type TransactionType = "expense" | "income";

export type PaymentMethod = "cash" | "upi" | "card" | "other";

export type TransactionSource =
  | "manual"
  | "phonepe"
  | "gpay"
  | "paytm"
  | "bank"
  | "bank_sms";

export type ReviewStatus = "pending" | "confirmed" | "rejected";

export type SyncStatus = "synced" | "pending" | "failed";

export type SyncAction = "insert" | "update" | "delete";

export type IsoDateTime = string;

export interface Transaction {
  id: string;
  userId: string;
  amount: number;
  type: TransactionType;
  categoryId: string;
  description: string;
  partyName: string | null;
  paymentMethod: PaymentMethod;
  source: TransactionSource;
  externalReference: string | null;
  occurredAt: IsoDateTime;
  reviewStatus: ReviewStatus;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  deletedAt: IsoDateTime | null;
  syncStatus: SyncStatus;
}

export interface Category {
  id: string;
  userId: string;
  name: string;
  type: TransactionType;
  icon: string;
  color: string;
  isDefault: boolean;
}

export interface SyncOutbox {
  id: string;
  entityType: string;
  entityId: string;
  action: SyncAction;
  payload: Record<string, unknown>;
  createdAt: IsoDateTime;
  attempts: number;
}

export interface SyncState {
  key: string;
  value: string;
}
