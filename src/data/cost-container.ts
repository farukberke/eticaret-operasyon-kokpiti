import type { CostPort } from "@/core/ports";

import { fileCostAdapter } from "./adapters/local/file-cost.adapter";

/**
 * MALİYET KONTEYNERİ — veritabanına geçişte değişecek tek dosya.
 *
 * Görev konteynerinden ayrı tutulmasının sebebi teknik: maliyet verisi
 * **sunucuda** okunur (kâr hesabının girdisi), görev durumu **istemcide**
 * (yalnızca arayüzü süzer). İkisini aynı dosyaya koymak, sunucu-only
 * modülleri tarayıcı paketine sızdırma riski demek.
 *
 *   tasks: localTaskAdapter   → tarayıcı
 *   costs: fileCostAdapter    → sunucu   ← burası
 *
 * Gerçek veritabanı geldiğinde:
 *   costs: fileCostAdapter  →  costs: postgresCostAdapter
 */
export interface CostContainer {
  readonly costs: CostPort;
}

export const costContainer: CostContainer = {
  costs: fileCostAdapter,
};
