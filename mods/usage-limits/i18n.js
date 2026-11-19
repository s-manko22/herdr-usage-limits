const messages = {
  ru: {
    title: "Лимиты", refresh: "Обновить", refreshing: "Обновление…", close: "Закрыть",
    remaining: "{percent}% осталось", unavailable: "Нет данных",
    reset: "Сброс через {time}", expired: "Период истёк — ожидаются новые данные",
    waiting: "Ожидаются данные", fresh: "Данные только что обновлены", age: "Данные {time} назад",
    footer: "Локальные данные — каждую минуту, Claude API — раз в 5 минут. Проценты показывают остаток.",
    refresh_error: "Не удалось обновить данные. Проверьте доступность Python 3.",
    quota: "Лимит", five_hours: "5 часов", week: "Неделя", month: "30 дней",
    days: "{count} д", hours: "{count} ч", minutes: "{count} мин",
    codex_source: "Последние данные Codex", codex_missing: "Нет данных. Откройте сессию Codex.",
    claude_api: "Claude API", claude_source: "Данные Claude Code",
    claude_auth: "Нет авторизации Claude Code; используются локальные данные.",
    claude_http: "Claude API: HTTP {code}. Используются последние данные.",
    claude_unavailable: "Claude API недоступен. Используются последние данные.",
    monthly_budget: "Месячный бюджет extra usage",
    monthly_missing: "Claude не предоставляет лимит за 30 дней",
    monthly_disabled: "Месячный extra usage выключен",
    collect_error: "Не удалось прочитать лимиты. Нажмите «Обновить».",
  },
  en: {
    title: "Limits", refresh: "Refresh", refreshing: "Refreshing…", close: "Close",
    remaining: "{percent}% left", unavailable: "No data",
    reset: "Resets in {time}", expired: "Period expired — waiting for new data",
    waiting: "Waiting for data", fresh: "Just updated", age: "Updated {time} ago",
    footer: "Local data updates every minute; Claude API every 5 minutes. Percentages show remaining quota.",
    refresh_error: "Could not refresh data. Check that Python 3 is available.",
    quota: "Quota", five_hours: "5 hours", week: "Week", month: "30 days",
    days: "{count}d", hours: "{count}h", minutes: "{count}m",
    codex_source: "Latest Codex data", codex_missing: "No data. Start a Codex session.",
    claude_api: "Claude API", claude_source: "Claude Code data",
    claude_auth: "Claude Code is not signed in; using local data.",
    claude_http: "Claude API: HTTP {code}. Using the latest available data.",
    claude_unavailable: "Claude API is unavailable. Using the latest available data.",
    monthly_budget: "Monthly extra usage budget",
    monthly_missing: "Claude does not provide a 30-day quota",
    monthly_disabled: "Monthly extra usage is disabled",
    collect_error: "Could not read quotas. Click Refresh.",
  },
};

export function text(language, message, params = {}) {
  if (!message) return "";
  const key = typeof message === "string" ? message : message.key;
  const values = typeof message === "string" ? params : message;
  return (messages[language]?.[key] ?? messages.ru[key] ?? key)
    .replace(/\{(\w+)\}/g, (_match, name) => String(values[name] ?? ""));
}

export function duration(seconds, language) {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  if (minutes < 60) return text(language, "minutes", { count: minutes });
  const hours = Math.floor(minutes / 60);
  return hours < 24
    ? `${text(language, "hours", { count: hours })} ${text(language, "minutes", { count: minutes % 60 })}`
    : `${text(language, "days", { count: Math.floor(hours / 24) })} ${text(language, "hours", { count: hours % 24 })}`;
}
