import { h } from "./dom";

/**
 * Сохранение и открытие файлов. В WebView2 и Chrome — окна «Сохранить как» / «Открыть»
 * (File System Access API), в других браузерах — скачивание и обычный выбор файла.
 */

export interface FileKind {
  /** Подпись типа в окне выбора файла. */
  description: string;
  /** Окончание имени, например «.gearbit.json». */
  suffix: string;
}

type Writable = { write(data: Blob): Promise<void>; close(): Promise<void> };
type FilePickers = {
  showSaveFilePicker?: (options: object) => Promise<{ createWritable(): Promise<Writable> }>;
  showOpenFilePicker?: (options: object) => Promise<{ getFile(): Promise<File> }[]>;
};

const pickerTypes = (kind: FileKind) => [{ description: kind.description, accept: { "application/json": [kind.suffix, ".json"] } }];

/**
 * Сохранить данные как JSON. true — сохранено (или отдано браузеру на скачивание), false — окно закрыли.
 * Ошибка записи — исключение.
 */
export async function saveJsonFile(data: unknown, name: string, kind: FileKind): Promise<boolean> {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const pickers = window as Window & FilePickers;
  if (pickers.showSaveFilePicker) {
    try {
      const handle = await pickers.showSaveFilePicker({ suggestedName: name, types: pickerTypes(kind) });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (e) {
      if ((e as Error).name === "AbortError") return false;
      throw e;
    }
  }
  const link = h("a", { href: URL.createObjectURL(blob), download: name });
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  return true;
}

/** Выбрать файл и прочитать его как текст. null — ничего не выбрали. */
export async function openTextFile(kind: FileKind): Promise<string | null> {
  const pickers = window as Window & FilePickers;
  if (pickers.showOpenFilePicker) {
    try {
      const [handle] = await pickers.showOpenFilePicker({ types: pickerTypes(kind), multiple: false });
      return handle ? await (await handle.getFile()).text() : null;
    } catch {
      return null;
    }
  }
  return new Promise((resolve) => {
    const input = h("input", { type: "file", accept: `${kind.suffix},.json` });
    input.onchange = async () => resolve(input.files?.[0] ? await input.files[0].text() : null);
    input.click();
  });
}
