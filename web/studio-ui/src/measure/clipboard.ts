import { toast } from "../ui/toasts";

/** Скопировать текст в буфер обмена. false — не вышло (сказали пользователю). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    toast("Не получилось скопировать: выделите текст и нажмите Ctrl+C", "error");
    return false;
  }
}
