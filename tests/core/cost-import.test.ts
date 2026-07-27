import { describe, expect, it } from "vitest";

import { basisPoints, lira, toMajor, type ProductCost } from "@/core/domain";
import {
  buildImportPreview,
  buildTemplateCsv,
  parseMinor,
  toProductCost,
  type ImportContext,
} from "@/core/services/cost-import";

/**
 * TOPLU MALİYET İÇE AKTARMA.
 *
 * Bu servisin işi kayıt yazmak değil, **ne olacağını söylemek**. Testlerin
 * çoğu bu yüzden "hangi kovaya düştü" sorusunu soruyor: kullanıcı onay
 * ekranında ne görüyorsa yazılacak olan odur.
 *
 * En kritik iki davranış:
 *   • Boş bir opsiyonel hücre mevcut override'ı **silmez**.
 *   • Tek bozuk satır dosyanın tamamını düşürmez.
 */

const TODAY = "2026-07-27";

const PRODUCTS = [
  { id: "elbise", sku: "ELB-001", barcode: "8680000000001", name: "Kırmızı Elbise" },
  { id: "ceket", sku: "CKT-002", barcode: "8680000000002", name: "Mavi Ceket" },
  { id: "sneaker", sku: "SNK-003", name: "Beyaz Sneaker" },
];

function ctx(existing: readonly ProductCost[] = []): ImportContext {
  return { products: PRODUCTS, existing, today: TODAY };
}

const HEADER =
  "sku,barkod,alis_maliyeti,komisyon_orani,kargo,paketleme,gecerlilik_tarihi";

/* ── 7 & 8: para biçimleri ──────────────────────────────────────────── */

describe("Para ayrıştırma", () => {
  it("Türk biçimini okur", () => {
    expect(parseMinor("1.234,56")).toBe(123456);
    expect(parseMinor("1234,56")).toBe(123456);
    expect(parseMinor("0,05")).toBe(5);
  });

  it("İngiliz biçimini okur", () => {
    expect(parseMinor("1,234.56")).toBe(123456);
    expect(parseMinor("1234.56")).toBe(123456);
  });

  it("ayraçsız tam sayıyı okur", () => {
    expect(parseMinor("1234")).toBe(123400);
  });

  it("üç basamaklı kuyruğu binlik ayracı sayar", () => {
    // "1.005" bir sayıdır: 1005. Üç ondalık basamak para değildir.
    expect(parseMinor("1.005")).toBe(100500);
    expect(parseMinor("1,005")).toBe(100500);
  });

  it("₺ ve boşluk gibi süsleri temizler", () => {
    expect(parseMinor(" ₺ 1.234,56 ")).toBe(123456);
  });

  it("hiçbir aşamada kayan nokta üretmez", () => {
    // 0,1 + 0,2 klasiği: float ile 30.000000000000004 kuruş çıkardı.
    expect(parseMinor("0,10")! + parseMinor("0,20")!).toBe(30);
  });

  it("geçersiz girdiyi null döner", () => {
    expect(parseMinor("")).toBeNull();
    expect(parseMinor("abc")).toBeNull();
    expect(parseMinor("-5")).toBeNull();
    expect(parseMinor("1,2345")).toBeNull();
    expect(parseMinor("12,")).toBeNull();
  });
});

/* ── 1: tamamen geçerli dosya ───────────────────────────────────────── */

describe("Geçerli dosya", () => {
  it("tüm satırları yazılacaklar kovasına koyar", () => {
    const csv = [
      HEADER,
      "ELB-001,,500,15,34.90,2.50,2026-07-01",
      "CKT-002,,750,,,,2026-07-01",
    ].join("\n");

    const preview = buildImportPreview(csv, ctx());

    expect(preview.totalRows).toBe(2);
    expect(preview.toWrite).toHaveLength(2);
    expect(preview.invalid).toHaveLength(0);
    expect(preview.unmatched).toHaveLength(0);

    const first = preview.toWrite[0]!;
    expect(first.productId).toBe("elbise");
    expect(toMajor(first.values.unitCost)).toBe(500);
    expect(first.values.commissionRate).toBe(basisPoints(15));
    expect(toMajor(first.values.shippingCost!)).toBe(34.9);
  });

  it("Türkçe başlıkları ve noktalı virgüllü dosyayı da kabul eder", () => {
    const csv = [
      "SKU;Alış Maliyeti;Geçerlilik Tarihi",
      "ELB-001;1.234,56;2026-07-01",
    ].join("\n");

    const preview = buildImportPreview(csv, ctx());
    expect(preview.toWrite).toHaveLength(1);
    expect(toMajor(preview.toWrite[0]!.values.unitCost)).toBe(1234.56);
  });

  it("tanınmayan sütunları yok sayar ama bildirir", () => {
    const csv = ["sku,alis_maliyeti,stok_adedi", "ELB-001,500,42"].join("\n");

    const preview = buildImportPreview(csv, ctx());
    expect(preview.toWrite).toHaveLength(1);
    expect(preview.unknownColumns).toEqual(["stok_adedi"]);
  });
});

/* ── 2: bazı satırları hatalı dosya ─────────────────────────────────── */

describe("Kısmi başarı", () => {
  it("tek bozuk satır dosyanın tamamını düşürmez", () => {
    const csv = [
      HEADER,
      "ELB-001,,500,,,,2026-07-01",
      "CKT-002,,abc,,,,2026-07-01", // maliyet sayı değil
      "SNK-003,,300,,,,2026-07-01",
    ].join("\n");

    const preview = buildImportPreview(csv, ctx());

    expect(preview.toWrite).toHaveLength(2);
    expect(preview.invalid).toHaveLength(1);
    expect(preview.invalid[0]).toMatchObject({
      line: 3,
      field: "alis_maliyeti",
      code: "invalidUnitCost",
      value: "abc",
    });
  });

  it("her hata türünü doğru kodla ve satır numarasıyla bildirir", () => {
    const csv = [
      HEADER,
      "ELB-001,,,,,,", // maliyet boş
      "CKT-002,,0,,,,", // sıfır maliyet
      "SNK-003,,100,150,,,", // komisyon > 100
      "ELB-001,,100,,xyz,,2026-08-01", // kargo sayı değil
      "CKT-002,,100,,,,31-12-2026", // tarih biçimi
      ",,100,,,,", // kimlik yok
    ].join("\n");

    const preview = buildImportPreview(csv, ctx());
    const byLine = new Map(preview.invalid.map((row) => [row.line, row.code]));

    expect(byLine.get(2)).toBe("missingUnitCost");
    expect(byLine.get(3)).toBe("unitCostNotPositive");
    expect(byLine.get(4)).toBe("invalidCommission");
    expect(byLine.get(5)).toBe("invalidShipping");
    expect(byLine.get(6)).toBe("invalidDate");
    expect(byLine.get(7)).toBe("missingIdentifier");
    expect(preview.toWrite).toHaveLength(0);
  });

  it("negatif maliyeti reddeder", () => {
    const preview = buildImportPreview(
      [HEADER, "ELB-001,,-50,,,,2026-07-01"].join("\n"),
      ctx(),
    );
    expect(preview.invalid[0]!.code).toBe("invalidUnitCost");
  });

  it("hataları satır numarasına göre sıralar", () => {
    const csv = [HEADER, "ELB-001,,abc,,,,", "CKT-002,,0,,,,", "SNK-003,,xyz,,,,"].join(
      "\n",
    );
    const lines = buildImportPreview(csv, ctx()).invalid.map((row) => row.line);
    expect(lines).toEqual([2, 3, 4]);
  });
});

/* ── 3, 4, 5: eşleştirme ────────────────────────────────────────────── */

describe("Ürün eşleştirme", () => {
  it("eşleşmeyen SKU'yu ayrı kovaya koyar", () => {
    const preview = buildImportPreview(
      [HEADER, "YOK-999,,500,,,,2026-07-01"].join("\n"),
      ctx(),
    );

    expect(preview.toWrite).toHaveLength(0);
    expect(preview.unmatched).toHaveLength(1);
    expect(preview.unmatched[0]).toMatchObject({
      line: 2,
      code: "productNotFound",
      value: "YOK-999",
    });
  });

  it("SKU boşsa barkodla eşleştirir", () => {
    const preview = buildImportPreview(
      [HEADER, ",8680000000002,750,,,,2026-07-01"].join("\n"),
      ctx(),
    );

    expect(preview.toWrite).toHaveLength(1);
    expect(preview.toWrite[0]!.productId).toBe("ceket");
  });

  it("SKU ve barkod farklı ürünlere işaret ediyorsa içe aktarmaz", () => {
    // Sessizce birini seçmek, kullanıcının yanlış ürünü maliyetlendirmesi demek.
    const preview = buildImportPreview(
      [HEADER, "ELB-001,8680000000002,500,,,,2026-07-01"].join("\n"),
      ctx(),
    );

    expect(preview.toWrite).toHaveLength(0);
    expect(preview.invalid[0]).toMatchObject({ code: "identifierConflict", line: 2 });
  });

  it("ikisi de aynı ürünü gösteriyorsa sorun çıkarmaz", () => {
    const preview = buildImportPreview(
      [HEADER, "ELB-001,8680000000001,500,,,,2026-07-01"].join("\n"),
      ctx(),
    );
    expect(preview.toWrite).toHaveLength(1);
  });

  it("SKU eşleşmesi barkoda göre önceliklidir", () => {
    // Barkod hücresi hiçbir ürüne uymuyor; SKU tuttuğu için satır geçerli.
    const preview = buildImportPreview(
      [HEADER, "ELB-001,0000000000000,500,,,,2026-07-01"].join("\n"),
      ctx(),
    );
    expect(preview.toWrite[0]!.productId).toBe("elbise");
  });

  it("SKU'yu büyük/küçük harf ve boşluktan bağımsız eşleştirir", () => {
    const preview = buildImportPreview(
      [HEADER, " elb-001 ,,500,,,,2026-07-01"].join("\n"),
      ctx(),
    );
    expect(preview.toWrite[0]!.productId).toBe("elbise");
  });
});

/* ── 6: aynı ürünün tekrarı ─────────────────────────────────────────── */

describe("Tekrarlanan satırlar", () => {
  it("aynı ürün ve aynı tarih iki kez geçerse her iki satırı da reddeder", () => {
    // Hangisinin yazıldığı yazma sırasına kalsaydı sonuç deterministik olmazdı.
    const csv = [
      HEADER,
      "ELB-001,,500,,,,2026-07-01",
      "ELB-001,,560,,,,2026-07-01",
    ].join("\n");

    const preview = buildImportPreview(csv, ctx());

    expect(preview.toWrite).toHaveLength(0);
    expect(preview.invalid.map((row) => row.line)).toEqual([2, 3]);
    expect(preview.invalid[0]!.code).toBe("duplicateRow");
  });

  it("aynı ürünün farklı tarihli satırları meşrudur ama bildirilir", () => {
    // Maliyet geçmişi içe aktarmak geçerli bir kullanım.
    const csv = [
      HEADER,
      "ELB-001,,500,,,,2026-01-01",
      "ELB-001,,560,,,,2026-06-15",
    ].join("\n");

    const preview = buildImportPreview(csv, ctx());

    expect(preview.toWrite).toHaveLength(2);
    expect(preview.repeatedProducts).toEqual([
      { productName: "Kırmızı Elbise", count: 2 },
    ]);
  });
});

/* ── 9: geçmiş tarihli maliyet ──────────────────────────────────────── */

describe("Geçerlilik tarihi", () => {
  it("geçmiş tarihli kaydı kabul eder", () => {
    const preview = buildImportPreview(
      [HEADER, "ELB-001,,500,,,,2025-03-15"].join("\n"),
      ctx(),
    );

    expect(preview.toWrite[0]!.values.effectiveFrom).toBe("2025-03-15");
    expect(preview.toWrite[0]!.values.effectiveFromAssumed).toBe(false);
  });

  it("tarih boşsa bugünü varsayar ve bunu işaretler", () => {
    // Varsayımın sessiz kalması, kullanıcının geçmişi güncellediğini
    // sanmasına yol açardı.
    const preview = buildImportPreview([HEADER, "ELB-001,,500,,,,"].join("\n"), ctx());

    expect(preview.toWrite[0]!.values.effectiveFrom).toBe(TODAY);
    expect(preview.toWrite[0]!.values.effectiveFromAssumed).toBe(true);
  });

  it("tarih sütunu hiç yoksa da bugünü varsayar", () => {
    const preview = buildImportPreview(
      ["sku,alis_maliyeti", "ELB-001,500"].join("\n"),
      ctx(),
    );
    expect(preview.toWrite[0]!.values.effectiveFromAssumed).toBe(true);
  });

  it("takvimde olmayan tarihi reddeder", () => {
    const preview = buildImportPreview(
      [HEADER, "ELB-001,,500,,,,2026-02-30"].join("\n"),
      ctx(),
    );
    expect(preview.invalid[0]!.code).toBe("invalidDate");
  });
});

/* ── 10 & 11: mevcut kayıtla karşılaştırma ──────────────────────────── */

const EXISTING: ProductCost = {
  productId: "elbise",
  effectiveFrom: "2026-07-01",
  unitCost: lira(500),
  commissionRate: basisPoints(12),
  shippingCost: lira(34.9),
  source: "manual",
};

describe("Mevcut kayıtla karşılaştırma", () => {
  it("aynı değerler geldiğinde değişmeyen kovasına koyar", () => {
    const preview = buildImportPreview(
      [HEADER, "ELB-001,,500,12,34.90,,2026-07-01"].join("\n"),
      ctx([EXISTING]),
    );

    expect(preview.toWrite).toHaveLength(0);
    expect(preview.unchanged).toHaveLength(1);
  });

  it("değer değiştiğinde güncelleme olarak işaretler ve eskisini taşır", () => {
    const preview = buildImportPreview(
      [HEADER, "ELB-001,,560,12,34.90,,2026-07-01"].join("\n"),
      ctx([EXISTING]),
    );

    const row = preview.toWrite[0]!;
    expect(toMajor(row.values.unitCost)).toBe(560);
    // Eski/yeni karşılaştırması için mevcut kayıt önizlemede duruyor.
    expect(toMajor(row.current!.unitCost)).toBe(500);
  });

  it("aynı ürünün başka tarihli kaydı yeni kayıttır, güncelleme değil", () => {
    const preview = buildImportPreview(
      [HEADER, "ELB-001,,560,,,,2026-08-01"].join("\n"),
      ctx([EXISTING]),
    );
    expect(preview.toWrite[0]!.current).toBeUndefined();
  });

  it("boş opsiyonel hücre mevcut override'ı SİLMEZ", () => {
    // Bu testin düşmesi sessiz veri kaybı demek: kullanıcı yalnızca maliyet
    // güncellemek isterken komisyon override'ı yok olurdu.
    const preview = buildImportPreview(
      [HEADER, "ELB-001,,560,,,,2026-07-01"].join("\n"),
      ctx([EXISTING]),
    );

    const written = toProductCost(preview.toWrite[0]!);
    expect(written.commissionRate).toBe(basisPoints(12));
    expect(toMajor(written.shippingCost!)).toBe(34.9);
    expect(toMajor(written.unitCost)).toBe(560);
  });

  it("opsiyonel sütun dosyada hiç yoksa da override korunur", () => {
    const preview = buildImportPreview(
      ["sku,alis_maliyeti,gecerlilik_tarihi", "ELB-001,560,2026-07-01"].join("\n"),
      ctx([EXISTING]),
    );

    expect(toProductCost(preview.toWrite[0]!).commissionRate).toBe(basisPoints(12));
  });

  it("tire işareti override'ı açıkça temizler", () => {
    // Silmenin tek yolu bunu yazmak; kullanıcı ne yaptığını bilerek yapar.
    const preview = buildImportPreview(
      [HEADER, "ELB-001,,560,-,-,,2026-07-01"].join("\n"),
      ctx([EXISTING]),
    );

    const written = toProductCost(preview.toWrite[0]!);
    expect(written.commissionRate).toBeUndefined();
    expect(written.shippingCost).toBeUndefined();
  });

  it("yalnızca temizleme içeren satır da değişiklik sayılır", () => {
    const preview = buildImportPreview(
      [HEADER, "ELB-001,,500,-,34.90,,2026-07-01"].join("\n"),
      ctx([EXISTING]),
    );
    expect(preview.toWrite).toHaveLength(1);
    expect(preview.unchanged).toHaveLength(0);
  });

  it("yazılan kayıt kaynağını 'import' olarak işaretler", () => {
    const preview = buildImportPreview(
      [HEADER, "ELB-001,,560,,,,2026-07-01"].join("\n"),
      ctx([EXISTING]),
    );
    expect(toProductCost(preview.toWrite[0]!).source).toBe("import");
  });
});

/* ── Şablon ─────────────────────────────────────────────────────────── */

describe("Örnek şablon", () => {
  it("kendi ürettiği şablon kendi ayrıştırıcısından geçer", () => {
    // Şablon indirip aynen geri yüklemek çalışmalı; yoksa örnek yanıltıcı olur.
    const csv = buildTemplateCsv({
      sku: "ELB-001",
      barcode: "8680000000001",
      today: TODAY,
    });

    const preview = buildImportPreview(csv, ctx());

    expect(preview.toWrite).toHaveLength(1);
    expect(toMajor(preview.toWrite[0]!.values.unitCost)).toBe(1234.56);
    // İkinci örnek satır bilinçli olarak var olmayan bir SKU kullanıyor.
    expect(preview.unmatched).toHaveLength(1);
  });
});

/* ── Ölçek ──────────────────────────────────────────────────────────── */

describe("Büyük dosya", () => {
  it("binlerce satırı makul sürede işler", () => {
    const rows = Array.from({ length: 5000 }, (_, index) =>
      index % 3 === 0
        ? "ELB-001,,500,,,,2026-01-01"
        : `YOK-${index},,${100 + index},,,,2026-01-01`,
    );

    const started = performance.now();
    const preview = buildImportPreview([HEADER, ...rows].join("\n"), ctx());
    const elapsed = performance.now() - started;

    expect(preview.totalRows).toBe(5000);
    expect(elapsed).toBeLessThan(2000);
  });
});
