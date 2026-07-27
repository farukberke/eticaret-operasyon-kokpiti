import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Koşullu sınıfları birleştirir ve çakışan Tailwind sınıflarını sağdakini
 * kazandırarak temizler: cn("p-2", "p-4") → "p-4".
 *
 * Bileşenlerin dışarıdan `className` ile ezilebilmesi bu fonksiyona bağlı;
 * design system'deki her bileşen prop'unu bununla birleştirir.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
