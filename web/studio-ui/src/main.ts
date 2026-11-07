/**
 * Запуск: сначала настройки из файла хаба (в них язык), потом сам интерфейс. Тексты на нужном языке
 * выбираются при загрузке модулей, поэтому язык должен быть известен до них.
 */
import "./styles/app.css";

import { lang } from "./i18n";
import { syncSettings } from "./settings";

void syncSettings().finally(() => {
  document.documentElement.lang = lang();
  void import("./app");
});
