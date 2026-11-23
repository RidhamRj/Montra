import Dexie, { type Table } from "dexie";
import type {
  Category,
  SyncOutbox,
  SyncState,
  Transaction,
} from "../types";

export class AppDatabase extends Dexie {
  transactions!: Table<Transaction, string>;
  categories!: Table<Category, string>;
  syncOutbox!: Table<SyncOutbox, string>;
  syncState!: Table<SyncState, string>;

  constructor() {
    super("expenseTracker");

    this.version(1).stores({
      transactions:
        "id, userId, [userId+occurredAt], [userId+externalReference], type, categoryId, reviewStatus, syncStatus, occurredAt, updatedAt, deletedAt",
      categories: "id, userId, [userId+type], type, isDefault, name",
      syncOutbox:
        "id, entityType, entityId, [entityType+entityId], action, createdAt, attempts",
      syncState: "key",
    });
  }
}

export const db = new AppDatabase();

export default db;
