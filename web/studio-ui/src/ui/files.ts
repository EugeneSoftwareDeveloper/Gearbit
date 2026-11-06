import { h } from "./dom";

/**
 * Сохранение и открытие файлов. В WebView2 и Chrome — окна «Сохранить как» / «Открыть»
 * (File System Access API), в других браузерах — скачивание и обычный выбор файла.
 */

export interface FileKind {
  /** Подпись типа в окне выбора файла. */
  description: string;
  /** Окончание имени, например «.gearbit.json» или «.py». */
  suffix: string;
  /** Тип содержимого. По умолчанию JSON: тогда подходят и файлы «.json». */
  mime?: string;
}

type Writable = { write(data: Blob): Promise<void>; close(): Promise<void> };
type FilePickers = {
  showSaveFilePicker?: (options: object) => Promise<{ name: string; createWritable(): Promise<Writable> }>;
  showOpenFilePicker?: (options: object) => Promise<{ getFile(): Promise<File> }[]>;
};

const mimeOf = (kind: FileKind) => kind.mime ?? "application/json";
const suffixes = (kind: FileKind) => (kind.mime ? [kind.suffix] : [kind.suffix, ".json"]);
const pickerTypes = (kind: FileKind) => [{ description: kind.description, accept: { [mimeOf(kind)]: suffixes(kind) } }];

/**
 * Сохранить текст в файл. Возвращает имя файла (или предложенное имя, если браузер просто скачал файл);
 * null — окно закрыли. Ошибка записи — исключение.
 */
export async function saveTextFile(text: string, name: string, kind: FileKind): Promise<string | null> {
  const blob = new Blob([text], { type: `${mimeOf(kind)};charset=utf-8` });
  const pickers = window as Window & FilePickers;
  if (pickers.showSaveFilePicker) {
    try {
      const handle = await pickers.showSaveFilePicker({ suggestedName: name, types: pickerTypes(kind) });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return handle.name;
    } catch (e) {
      if ((e as Error).name === "AbortError") return null;
      throw e;
    }
  }
  const link = h("a", { href: URL.createObjectURL(blob), download: name });
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  return name;
}

/**
 * Сохранить данные как JSON. true — сохранено (или отдано браузеру на скачивание), false — окно закрыли.
 * Ошибка записи — исключение.
 */
export async function saveJsonFile(data: unknown, name: string, kind: FileKind): Promise<boolean> {
  return (await saveTextFile(JSON.stringify(data, null, 2), name, kind)) !== null;
}

/** Выбрать файл и прочитать его. null — ничего не выбрали. */
export async function openFile(kind: FileKind): Promise<{ name: string; text: string } | null> {
  const read = async (file: File | undefined) => (file ? { name: file.name, text: await file.text() } : null);
  const pickers = window as Window & FilePickers;
  if (pickers.showOpenFilePicker) {
    try {
      const [handle] = await pickers.showOpenFilePicker({ types: pickerTypes(kind), multiple: false });
      return handle ? await read(await handle.getFile()) : null;
    } catch {
      return null;
    }
  }
  return new Promise((resolve) => {
    const input = h("input", { type: "file", accept: suffixes(kind).join(",") });
    input.onchange = async () => resolve(await read(input.files?.[0]));
    input.click();
  });
}

/** Выбрать файл и прочитать его как текст. null — ничего не выбрали. */
export async function openTextFile(kind: FileKind): Promise<string | null> {
  return (await openFile(kind))?.text ?? null;
}
