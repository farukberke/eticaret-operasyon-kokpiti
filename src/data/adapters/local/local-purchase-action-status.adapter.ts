import type { PurchaseActionStatusRecord, PurchaseActionStatus } from "@/core/domain";
import type { PurchaseActionStatusPort } from "@/core/ports";

/**
 * PurchaseActionStatusPort'un `localStorage` uygulaması.
 *
 * `local-task.adapter.ts` ile aynı gerekçe: kullanıcı hesabı yok, durumu
 * sunucuda tutacak bir yer de yok. Ayrı dosya çünkü ayrı domain — bu adapter
 * `productId` anahtarlıdır, görev kuyruğunun `signalId` anahtarlı deposuyla
 * karıştırılmaz.
 *
 * Yerini gerçek bir veritabanı adapter'ı alacağında değişecek tek dosya
 * `src/data/purchase-action-status-container.ts` olacak.
 */

const STORAGE_KEY = "kokpit.purchaseActionStatus";

/**
 * Depolama şeması sürümlü — bkz. `local-task.adapter.ts`teki aynı gerekçe:
 * tanınmayan bir sürümle karşılaşmak, bozuk veriyle çalışmaktansa temiz bir
 * başlangıcı tercih eder.
 */
const SCHEMA_VERSION = 1;

interface StoredShape {
  readonly version: number;
  readonly statuses: Record<string, StoredStatus>;
}

interface StoredStatus {
  readonly status: PurchaseActionStatus;
  readonly updatedAt: string;
}

/** Sunucu render'ında `window` yoktur; adapter sessizce boş döner. */
function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    // Gizli sekme ya da kapalı depolama izni. Panel çalışmaya devam etmeli.
    return null;
  }
}

function read(): StoredShape {
  const empty: StoredShape = { version: SCHEMA_VERSION, statuses: {} };
  const store = storage();
  if (!store) return empty;

  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return empty;

    const parsed = JSON.parse(raw) as Partial<StoredShape>;
    if (parsed.version !== SCHEMA_VERSION || typeof parsed.statuses !== "object") {
      return empty;
    }
    return { version: SCHEMA_VERSION, statuses: parsed.statuses ?? {} };
  } catch {
    return empty;
  }
}

function write(shape: StoredShape): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(shape));
  } catch {
    // Kota dolu ya da yazma engelli. Karar bu oturumda hatırlanır, kalıcı olmaz.
  }
}

export const localPurchaseActionStatusAdapter: PurchaseActionStatusPort = {
  async list(): Promise<readonly PurchaseActionStatusRecord[]> {
    const { statuses } = read();
    return Object.entries(statuses).map(([productId, record]) => ({
      productId,
      status: record.status,
      updatedAt: record.updatedAt,
    }));
  },

  async save(record: PurchaseActionStatusRecord): Promise<void> {
    const shape = read();
    write({
      version: SCHEMA_VERSION,
      statuses: {
        ...shape.statuses,
        [record.productId]: {
          status: record.status,
          updatedAt: record.updatedAt,
        },
      },
    });
  },

  async reset(): Promise<void> {
    write({ version: SCHEMA_VERSION, statuses: {} });
  },
};
