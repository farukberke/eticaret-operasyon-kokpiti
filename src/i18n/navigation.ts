import { createNavigation } from "next-intl/navigation";

import { routing } from "./routing";

/**
 * Locale'i otomatik taşıyan gezinme bileşenleri.
 *
 * Uygulamada `next/link` yerine **her zaman** bunlar kullanılır; aksi hâlde
 * Türkçe gezinen kullanıcı bir bağlantıya tıkladığında sessizce İngilizceye
 * düşer.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
