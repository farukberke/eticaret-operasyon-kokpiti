import type { TaskState, TaskStatus } from "@/core/domain";
import type { TaskPort } from "@/core/ports";

/**
 * TaskPort'un `localStorage` uygulaması.
 *
 * v1'de kullanıcı hesabı yok, dolayısıyla durumu sunucuda tutacak bir yer de
 * yok. Bu adapter geçici olarak tarayıcıda saklar ve iki sınırı var:
 * durum cihaza bağlıdır ve sunucu render'ı sırasında okunamaz.
 *
 * Yerini `PostgresTaskAdapter` alacağında değişecek tek dosya
 * `src/data/task-container.ts` olacak — bu dosya silinip yenisi yazılır,
 * kuyruk bileşenine dokunulmaz.
 */

const STORAGE_KEY = "kokpit.tasks";

/**
 * Depolama şeması sürümlü.
 *
 * Alan adları ileride değişirse (ya da veritabanına taşınırken dışa aktarım
 * gerekirse) eski kaydı tanıyıp dönüştürebilmek için. Sürümsüz JSON yazmak,
 * ilk şema değişikliğinde kullanıcıların kuyruğunu sessizce silmek demektir.
 *
 * `expectedGain` sonradan eklendi ama sürüm **1'de kaldı**: alan opsiyonel
 * ve eklemeli, eski kayıtlar sorunsuz okunuyor. Sürümü artırmak, hiçbir
 * kazanç sağlamadan mevcut kullanıcıların kuyruğunu silerdi.
 */
const SCHEMA_VERSION = 1;

interface StoredShape {
  readonly version: number;
  readonly tasks: Record<string, StoredTask>;
}

interface StoredTask {
  readonly status: TaskStatus;
  readonly snoozedUntil?: string;
  readonly updatedAt: string;
  readonly expectedGain?: { minor: number; currency: string };
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
  const empty: StoredShape = { version: SCHEMA_VERSION, tasks: {} };
  const store = storage();
  if (!store) return empty;

  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return empty;

    const parsed = JSON.parse(raw) as Partial<StoredShape>;
    if (parsed.version !== SCHEMA_VERSION || typeof parsed.tasks !== "object") {
      // Tanınmayan sürüm: kuyruğu sıfırlamak, bozuk veriyle çalışmaktan iyidir.
      return empty;
    }
    return { version: SCHEMA_VERSION, tasks: parsed.tasks ?? {} };
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
    // Kota dolu ya da yazma engelli. Kullanıcı arayüzü çalışmaya devam eder;
    // karar bu oturumda hatırlanır, kalıcı olmaz.
  }
}

export const localTaskAdapter: TaskPort = {
  async list(): Promise<readonly TaskState[]> {
    const { tasks } = read();
    return Object.entries(tasks).map(([signalId, task]) => ({
      signalId,
      status: task.status,
      snoozedUntil: task.snoozedUntil,
      updatedAt: task.updatedAt,
      expectedGain: task.expectedGain
        ? { minor: task.expectedGain.minor, currency: "TRY" as const }
        : undefined,
    }));
  },

  async save(state: TaskState): Promise<void> {
    const shape = read();
    write({
      version: SCHEMA_VERSION,
      tasks: {
        ...shape.tasks,
        [state.signalId]: {
          status: state.status,
          ...(state.snoozedUntil ? { snoozedUntil: state.snoozedUntil } : {}),
          updatedAt: state.updatedAt,
          ...(state.expectedGain
            ? {
                expectedGain: {
                  minor: state.expectedGain.minor,
                  currency: state.expectedGain.currency,
                },
              }
            : {}),
        },
      },
    });
  },

  async clear(signalId: string): Promise<void> {
    const { tasks } = read();
    const rest = Object.fromEntries(
      Object.entries(tasks).filter(([key]) => key !== signalId),
    );
    write({ version: SCHEMA_VERSION, tasks: rest });
  },
};
