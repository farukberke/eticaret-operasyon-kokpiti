import type { TaskPort } from "@/core/ports";

import { localTaskAdapter } from "./adapters/local/local-task.adapter";

/**
 * GÖREV KONTEYNERİ — gerçek veritabanına geçişte değişecek tek dosya.
 *
 * `container.ts`'den ayrı tutulmasının somut bir sebebi var: görev durumu
 * istemci bileşenlerinden okunur, oysa `container.ts` 90 günlük veri
 * üretecini içeri çeker. Aynı dosyada olsalardı o üreteç tarayıcı paketine
 * girer ve panelin ilk yüklenmesini gereksiz yere yavaşlatırdı.
 *
 * Ayrım kavramsal olarak da doğru: biri **sunucudaki veriyi okur**, diğeri
 * **kullanıcının kararlarını yazar**. Ömürleri ve sahipleri farklı.
 *
 * Oturum sistemi geldiğinde:
 *   tasks: localTaskAdapter  →  tasks: postgresTaskAdapter
 */
export interface TaskContainer {
  readonly tasks: TaskPort;
}

export const taskContainer: TaskContainer = {
  tasks: localTaskAdapter,
};

/** Erteleme seçenekleri. Az sayıda tutuluyor: her seçenek bir karar yüküdür. */
export const SNOOZE_OPTIONS = [1, 3, 7] as const;
