"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { IsoDate } from "@/core/domain";

import { useTaskState, type TaskStateApi } from "./use-task-state";

/**
 * Görev durumunu paylaşan bağlam.
 *
 * Neden gerekli: kuyruk ekranın üstünde, defter en altında. Bir iş
 * kapatıldığında **ikisi de** aynı anda güncellenmeli — yoksa kullanıcı
 * "yaptım" der, liste kısalır ama defter değişmez ve panel kendi kendisiyle
 * çelişir. Her bileşen kendi `useTaskState` çağrısını yapsaydı iki ayrı
 * kopya oluşur ve senkron kalmazlardı.
 *
 * Aradaki sunucu bileşenleri (bağlam şeridi, risk/fırsat özeti) provider'a
 * `children` olarak geçer; sunucuda render edilmeye devam ederler.
 */
const TaskStateContext = createContext<TaskStateApi | null>(null);

export function TaskStateProvider({
  today,
  children,
}: {
  today: IsoDate;
  children: ReactNode;
}) {
  const api = useTaskState(today);
  return <TaskStateContext.Provider value={api}>{children}</TaskStateContext.Provider>;
}

export function useTasks(): TaskStateApi {
  const context = useContext(TaskStateContext);
  if (!context) {
    throw new Error("useTasks yalnızca <TaskStateProvider> içinde kullanılabilir");
  }
  return context;
}
