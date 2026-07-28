import { describe, expect, it } from "vitest";

import { basisPoints, lira, type ProductCost } from "@/core/domain";
import { buildCostHistoryView } from "@/features/costs/history-view";

/**
 * MALİYET GEÇMİŞİNİN GÖRÜNÜMÜ.
 *
 * Sınanan asıl şey biçimlendirme değil, **hangi kaydın yürürlükte olduğu**.
 * Ekran yanlış kaydı "Şu anda kullanılıyor" diye işaretlerse, kullanıcı kâr
 * rakamının hangi maliyetle çıktığını yanlış bilir — ve bu, hiç geçmiş
 * göstermemekten daha kötüdür.
 *
 * İkinci sınanan: geçmiş **o ürüne aittir**. Başka bir ürünün kaydının bu
 * listeye sızması, kullanıcının kendi girmediği bir maliyeti kendi ürününde
 * görmesi demek.
 */

const TODAY = "2026-07-28";

/** Bilinçli olarak karışık sırada: sıralamayı görünüm yapmak zorunda. */
const COSTS: readonly ProductCost[] = [
  {
    productId: "p1",
    effectiveFrom: "2026-03-15",
    unitCost: lira(110),
    source: "import",
  },
  {
    productId: "p1",
    effectiveFrom: "2026-07-01",
    unitCost: lira(124.5),
    shippingCost: lira(34.9),
    packagingPerUnit: lira(2.5),
    source: "manual",
  },
  {
    productId: "p2",
    effectiveFrom: "2026-07-05",
    unitCost: lira(999),
    source: "manual",
  },
  {
    productId: "p1",
    effectiveFrom: "2026-01-01",
    unitCost: lira(100),
    commissionRate: basisPoints(15),
    source: "seed",
  },
];

function build(locale = "tr", today = TODAY, productId = "p1") {
  return buildCostHistoryView({ costs: COSTS, productId, today, locale });
}

const view = build();

describe("Sıralama", () => {
  it("en yeni kaydı başa koyar", () => {
    expect(view.entries[0]?.key).toBe("p1@2026-07-01");
  });

  it("geçmiş kayıtları da tarihe göre azalan tutar", () => {
    expect(view.entries.map((entry) => entry.key)).toEqual([
      "p1@2026-07-01",
      "p1@2026-03-15",
      "p1@2026-01-01",
    ]);
  });

  it("aynı ürünün farklı tarihli kayıtlarının hepsini gösterir", () => {
    // Geçmiş "son kayıt" değil, defterin tamamıdır.
    expect(view.entries).toHaveLength(3);
  });
});

describe("Yürürlük rozeti", () => {
  it("bugün geçerli olan tek kaydı aktif işaretler", () => {
    const active = view.entries.filter((entry) => entry.status === "active");
    expect(active.map((entry) => entry.key)).toEqual(["p1@2026-07-01"]);
  });

  it("kalan kayıtları geçmiş sayar", () => {
    expect(view.entries.slice(1).map((entry) => entry.status)).toEqual([
      "past",
      "past",
    ]);
  });

  it("dünkü tarihte dünkü kayıt aktiftir", () => {
    // Yürürlük kuralı çözümleyicininkiyle aynı olmak zorunda: 15 Mart'ta
    // 1 Temmuz kaydı henüz doğmamıştır.
    const march = build("tr", "2026-03-20");
    const active = march.entries.find((entry) => entry.status === "active");

    expect(active?.key).toBe("p1@2026-03-15");
    expect(march.entries[0]?.status).toBe("upcoming");
  });

  it("hiçbir kaydı yürürlüğe girmemiş ürünün aktif kaydı yoktur", () => {
    const before = build("tr", "2025-12-31");
    expect(before.entries.every((entry) => entry.status === "upcoming")).toBe(true);
  });
});

describe("Ürün ayrımı", () => {
  it("başka ürünlerin kayıtlarını göstermez", () => {
    expect(view.entries.every((entry) => entry.key.startsWith("p1@"))).toBe(true);
  });

  it("istenen ürünün kendi kayıtlarını eksiksiz verir", () => {
    const other = build("tr", TODAY, "p2");
    expect(other.entries.map((entry) => entry.key)).toEqual(["p2@2026-07-05"]);
    expect(other.productId).toBe("p2");
  });
});

describe("Boş durum", () => {
  it("hiç kaydı olmayan ürün için boş liste döner", () => {
    expect(build("tr", TODAY, "yok").entries).toEqual([]);
  });

  it("tablo tamamen boşsa da çalışır", () => {
    const empty = buildCostHistoryView({
      costs: [],
      productId: "p1",
      today: TODAY,
      locale: "tr",
    });
    expect(empty.entries).toEqual([]);
  });
});

describe("Biçimlendirme", () => {
  const [latest, middle, oldest] = view.entries;

  it("tarihi locale'in kısa biçimiyle yazar", () => {
    expect(latest?.effectiveFromLabel).toBe("1 Tem");
    expect(middle?.effectiveFromLabel).toBe("15 Mar");
    expect(oldest?.effectiveFromLabel).toBe("1 Oca");
  });

  it("parayı kuruşuyla birlikte yazar", () => {
    // 100 ₺ üstünde varsayılan biçimlendirme kuruşu atıyor; maliyet kaydında
    // bu, kullanıcının girdiği rakamla ekrandakini uyuşmaz gösterirdi.
    expect(latest?.unitCostLabel).toBe("₺124,50");
    expect(oldest?.unitCostLabel).toBe("₺100,00");
  });

  it("komisyonu yüzde olarak yazar", () => {
    expect(oldest?.commissionLabel).toBe("%15,0");
  });

  it("kargo ve paketlemeyi para olarak yazar", () => {
    expect(latest?.shippingLabel).toBe("₺34,90");
    expect(latest?.packagingLabel).toBe("₺2,50");
  });

  it("kayıtta tanımlı olmayan alanı sıfır değil 'yok' olarak taşır", () => {
    // Boş komisyon "komisyon yok" demek değil: değer kategori ya da mağaza
    // varsayılanından iniyor. Sıfır basmak yalan olurdu.
    expect(latest?.commissionLabel).toBeNull();
    expect(oldest?.shippingLabel).toBeNull();
    expect(oldest?.packagingLabel).toBeNull();
  });

  it("kaydın kaynağını olduğu gibi taşır", () => {
    expect(view.entries.map((entry) => entry.source)).toEqual([
      "manual",
      "import",
      "seed",
    ]);
  });
});

describe("Dil", () => {
  const english = build("en");

  it("İngilizce tarih ve para biçimini kullanır", () => {
    expect(english.entries[0]?.effectiveFromLabel).toBe("Jul 1");
    expect(english.entries[0]?.unitCostLabel).toContain("124.50");
    expect(english.entries[2]?.commissionLabel).toBe("15.0%");
  });

  it("dil değişince sıralama ve rozetler aynı kalır", () => {
    // Biçimlendirme locale'e bağlı; hangi kaydın yürürlükte olduğu değil.
    expect(english.entries.map((entry) => entry.key)).toEqual(
      view.entries.map((entry) => entry.key),
    );
    expect(english.entries.map((entry) => entry.status)).toEqual(
      view.entries.map((entry) => entry.status),
    );
  });
});
