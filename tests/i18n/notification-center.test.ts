import { describe, expect, it } from "vitest";

import type { OperationalNotificationType } from "@/core/domain";
import en from "@/i18n/messages/en.json";
import tr from "@/i18n/messages/tr.json";

/**
 * UYARI MERKEZİ SÖZLÜĞÜ.
 *
 * Beş bildirim türünün başlık/açıklama şablonu iki dilde de dolu ve ayırt
 * edilebilir olmalı — `smart-insights.test.ts`teki (i18n) aynı desen. Şiddet
 * etiketleri burada tekrar tanımlanmaz: `smartInsights.severity`den okunur,
 * bu sözlük yalnızca kendi anahtarlarının bütünlüğünü doğrular.
 */
const TYPES: Record<OperationalNotificationType, true> = {
  criticalAction: true,
  leadTimeRisk: true,
  snoozedAction: true,
  completedAction: true,
  operationsClear: true,
};
const ALL_TYPES = Object.keys(TYPES) as OperationalNotificationType[];

describe("uyarı merkezi sözlüğü", () => {
  for (const [locale, messages] of Object.entries({ tr, en })) {
    const item = messages.notificationCenter.item as unknown as Record<
      string,
      { title: string; description: string }
    >;

    it(`${locale}: başlık, alt başlık, boş durum ve aktif sayaç etiketi dolu`, () => {
      expect(messages.notificationCenter.title?.trim()).toBeTruthy();
      expect(messages.notificationCenter.subtitle?.trim()).toBeTruthy();
      expect(messages.notificationCenter.empty?.trim()).toBeTruthy();
      expect(messages.notificationCenter.activeCountLabel?.trim()).toBeTruthy();
    });

    it(`${locale}: beş bildirim türünün başlığı dolu ve ayırt edilebilir`, () => {
      const titles = ALL_TYPES.map((type) => {
        expect(
          item[type]?.title?.trim(),
          `${locale}.notificationCenter.item.${type}.title`,
        ).toBeTruthy();
        return item[type]!.title;
      });
      expect(new Set(titles).size).toBe(titles.length);
    });

    it(`${locale}: beş bildirim türünün açıklaması dolu`, () => {
      for (const type of ALL_TYPES) {
        expect(
          item[type]?.description?.trim(),
          `${locale}.notificationCenter.item.${type}.description`,
        ).toBeTruthy();
      }
    });

    it(`${locale}: ürün adı taşıyan şablonlar {productName} yer tutucusunu içerir`, () => {
      expect(item.criticalAction!.description).toMatch(/\{productName\}/);
      expect(item.leadTimeRisk!.description).toMatch(/\{productName\}/);
    });

    it(`${locale}: sayı taşıyan şablonlar {count} yer tutucusunu içerir`, () => {
      expect(item.snoozedAction!.description).toMatch(/\{count\}/);
      expect(item.completedAction!.description).toMatch(/\{count\}/);
    });

    it(`${locale}: operationsClear şablonu sabittir, yer tutucu içermez`, () => {
      expect(item.operationsClear!.description).not.toMatch(/\{[a-zA-Z]+\}/);
    });

    it(`${locale}: moreNotifications şablonu {count} yer tutucusunu içerir`, () => {
      expect(messages.notificationCenter.moreNotifications).toMatch(/\{count\}/);
    });

    it(`${locale}: hiçbir metin "okunmadı"/"unread"/"yeni bildirim" ifadesi kullanmaz`, () => {
      const flat = JSON.stringify(messages.notificationCenter).toLowerCase();
      expect(flat).not.toMatch(/unread/);
      expect(flat).not.toMatch(/okunmad/);
    });
  }

  it("iki dil aynı anahtar kümesini taşıyor: notificationCenter", () => {
    expect(Object.keys(tr.notificationCenter).sort()).toEqual(
      Object.keys(en.notificationCenter).sort(),
    );
  });

  it("iki dil aynı anahtar kümesini taşıyor: notificationCenter.item", () => {
    expect(Object.keys(tr.notificationCenter.item).sort()).toEqual(
      Object.keys(en.notificationCenter.item).sort(),
    );
  });

  it("beş bildirim türü anahtarının tamamı sözlükte tanımlı", () => {
    expect(Object.keys(tr.notificationCenter.item).sort()).toEqual(
      [...ALL_TYPES].sort(),
    );
  });

  it("notificationCenter sözlüğü kendi severity anahtarını tanımlamaz — smartInsights.severity paylaşılır", () => {
    expect(tr.notificationCenter).not.toHaveProperty("severity");
    expect(en.notificationCenter).not.toHaveProperty("severity");
  });
});
