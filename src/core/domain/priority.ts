import type { Signal } from "./signal";

/**
 * Öncelik listesindeki tek bir madde: "bugün yapman gereken şey".
 *
 * Sinyali sarmalar, yerine geçmez — kanıtlar, tutar ve konu sinyalden okunur.
 * Bu katman yalnızca **sıralama kararını** ekler.
 */
export interface PriorityAction {
  /** 1'den başlayan sıra. Ekranda "①, ②, ③" olarak görünür. */
  readonly rank: number;
  /** 0–100 arası normalize skor. Sıralamanın gerekçesi. */
  readonly score: number;
  readonly signal: Signal;
}
