import { messages } from "../i18n";
import { toast } from "../ui/toasts";

const M = messages({
  ru: { failed: "Не получилось скопировать: выделите текст и нажмите Ctrl+C" },
  en: { failed: "Could not copy: select the text and press Ctrl+C" },
});

/** Скопировать текст в буфер обмена. false — не вышло (сказали пользователю). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    toast(M.failed, "error");
    return false;
  }
}
