import { describe, expect, it } from "vitest";

import { parseCsv } from "@/core/services/csv-parse";

/**
 * CSV AYRIŞTIRMA.
 *
 * Buradaki senaryoların hepsi gerçek dosyalardan geliyor: Excel'in eklediği
 * BOM, Windows satır sonu, Türkçe Excel'in noktalı virgülü, ürün adındaki
 * virgül. Biri kaçarsa kullanıcı "dosyam bozuk" diyecek ve haksız olacak.
 */

describe("CSV ayrıştırıcı", () => {
  it("basit bir dosyayı satır ve sütunlara böler", () => {
    const { rows } = parseCsv("sku,maliyet\nA-1,100\nA-2,200");
    expect(rows).toEqual([
      ["sku", "maliyet"],
      ["A-1", "100"],
      ["A-2", "200"],
    ]);
  });

  it("Excel'in eklediği BOM'u ilk başlığa yapıştırmaz", () => {
    // BOM kalırsa başlık "﻿sku" olur ve hiçbir sütun eşleşmez.
    const { rows } = parseCsv("﻿sku,maliyet\nA-1,100");
    expect(rows[0]).toEqual(["sku", "maliyet"]);
  });

  it("Windows satır sonunu (CRLF) tanır", () => {
    const { rows } = parseCsv("sku,maliyet\r\nA-1,100\r\n");
    expect(rows).toEqual([
      ["sku", "maliyet"],
      ["A-1", "100"],
    ]);
  });

  it("tek başına CR ile ayrılmış satırları da böler", () => {
    // Eski Mac Excel çıktısı.
    const { rows } = parseCsv("sku\rA-1\rA-2");
    expect(rows).toEqual([["sku"], ["A-1"], ["A-2"]]);
  });

  it("noktalı virgülü ayraç olarak seçer", () => {
    // Türkçe Windows'ta Excel varsayılanı budur.
    const { rows, delimiter } = parseCsv("sku;maliyet;kargo\nA-1;100;34,90");
    expect(delimiter).toBe(";");
    expect(rows[1]).toEqual(["A-1", "100", "34,90"]);
  });

  it("noktalı virgüllü dosyada tırnaksız ondalık virgülü sütun sanmaz", () => {
    // Virgül kazansaydı "34,90" iki hücreye bölünürdü.
    const { rows } = parseCsv("sku;maliyet\nA-1;1.234,56");
    expect(rows[1]).toEqual(["A-1", "1.234,56"]);
  });

  it("sekmeyle ayrılmış dosyayı tanır", () => {
    const { rows, delimiter } = parseCsv("sku\tmaliyet\nA-1\t100");
    expect(delimiter).toBe("\t");
    expect(rows[1]).toEqual(["A-1", "100"]);
  });

  it("tırnak içindeki ayracı bölmez", () => {
    const { rows } = parseCsv('sku,ad\nA-1,"Elbise, kırmızı"');
    expect(rows[1]).toEqual(["A-1", "Elbise, kırmızı"]);
  });

  it("tırnak içindeki satır sonunu bölmez", () => {
    const { rows } = parseCsv('sku,not\nA-1,"iki\nsatır"');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual(["A-1", "iki\nsatır"]);
  });

  it("çift tırnağı kaçış olarak çözer", () => {
    const { rows } = parseCsv('sku,ad\nA-1,"12"" ekran"');
    expect(rows[1]).toEqual(["A-1", '12" ekran']);
  });

  it("ayraç tespitinde tırnak içindeki karakterleri saymaz", () => {
    // Başlıkta tırnaklı bir virgül var ama gerçek ayraç noktalı virgül.
    const { delimiter } = parseCsv('"ad, uzun";sku;maliyet\nx;A-1;100');
    expect(delimiter).toBe(";");
  });

  it("dosya sonundaki fazladan satır sonunu boş satır saymaz", () => {
    const { rows } = parseCsv("sku,maliyet\nA-1,100\n\n");
    expect(rows).toHaveLength(2);
  });

  it("boş girdide boş sonuç döner", () => {
    expect(parseCsv("").rows).toEqual([]);
  });

  it("eksik hücreleri olan satırı reddetmez", () => {
    // Kullanıcı sondaki opsiyonel sütunları boş bırakmış olabilir.
    const { rows } = parseCsv("sku,maliyet,kargo\nA-1,100");
    expect(rows[1]).toEqual(["A-1", "100"]);
  });
});
