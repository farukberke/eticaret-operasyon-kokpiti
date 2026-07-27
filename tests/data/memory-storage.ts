/**
 * Bellekte çalışan `Storage` uygulaması.
 *
 * jsdom 30, `localStorage`'ı Node'un deneysel yerleşik API'sine devrediyor ve
 * o da `--localstorage-file` bayrağı olmadan devreye girmiyor. Test ortamını
 * bayrakla çalıştırmak yerine sözleşmeyi burada karşılıyoruz.
 *
 * Kaybettiğimiz bir şey yok: adapter `Storage` arayüzüne bağlı, tarayıcının
 * özel bir davranışına değil. Test ettiğimiz şey adapterin mantığı — okuma,
 * yazma, sürüm kontrolü, bozuk veriye dayanıklılık.
 */
export function installMemoryStorage(): Storage {
  const data = new Map<string, string>();

  const storage: Storage = {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  };

  Object.defineProperty(window, "localStorage", {
    value: storage,
    configurable: true,
    writable: true,
  });

  return storage;
}
