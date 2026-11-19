"""Read account quotas; credentials stay in memory and never enter output/cache."""
import datetime as dt
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.request
import urllib.error

HOME = Path.home()
CACHE = Path(__file__).with_name(".claude-cache.json")


def read_json(path):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return {}


def stamp(value):
    if isinstance(value, (int, float)):
        return value
    try:
        return dt.datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except (ValueError, AttributeError):
        return None


def window(label, value):
    if not isinstance(value, dict):
        return {"label": label}
    used = value.get("utilization", value.get("used_percentage", value.get("used_percent")))
    return {"label": label, "used": used if isinstance(used, (int, float)) else None,
            "reset": stamp(value.get("resets_at"))}


def codex():
    root = Path(os.environ.get("CODEX_HOME", str(HOME / ".codex")))
    files = sorted((root / "sessions").glob("*/*/*/*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True)
    for path in files[:40]:
        with path.open("rb") as stream:
            stream.seek(max(0, path.stat().st_size - 2 * 1024 * 1024))
            lines = stream.read().splitlines()
        for line in reversed(lines):
            if b'"rate_limits"' not in line:
                continue
            try:
                event = json.loads(line)
                limits = event.get("payload", {}).get("rate_limits")
                if not limits or limits.get("limit_id") not in (None, "codex"):
                    continue
                windows = []
                for key in ("primary", "secondary"):
                    item = limits.get(key)
                    if not item:
                        continue
                    minutes = item.get("window_minutes") or 0
                    label = "Неделя" if minutes == 10080 else "5 часов" if minutes == 300 else f"{minutes // 1440} дней" if minutes and minutes % 1440 == 0 else f"{minutes // 60} ч" if minutes else "Лимит"
                    windows.append(window(label, item))
                if windows:
                    return {"name": "Codex", "plan": (limits.get("plan_type") or "").capitalize(),
                            "at": stamp(event.get("timestamp")), "windows": windows,
                            "source": "Последние данные Codex"}
            except (ValueError, AttributeError, TypeError):
                continue
    return {"name": "Codex", "windows": [{"label": "Лимит"}], "note": "Нет данных. Откройте сессию Codex."}


def credentials():
    data = read_json(HOME / ".claude/.credentials.json")
    if not data:
        try:
            result = subprocess.run(["security", "find-generic-password", "-s", "Claude Code-credentials", "-w"], capture_output=True, text=True, timeout=8)
            if result.returncode == 0:
                data = json.loads(result.stdout)
        except (OSError, ValueError, subprocess.TimeoutExpired):
            pass
    return data.get("claudeAiOauth", {}).get("accessToken")


def claude():
    now = time.time()
    cache = read_json(CACHE)
    profile = read_json(HOME / ".claude.json").get("oauthAccount", {})
    account = profile.get("accountUuid")
    if cache.get("account") != account:
        cache = {}
    if now >= cache.get("retry", 0):
        cache["account"] = account
        cache["retry"] = now + 300
        try:
            token = credentials()
            if not token:
                raise RuntimeError("Нет авторизации Claude Code; используются локальные данные.")
            request = urllib.request.Request("https://api.anthropic.com/api/oauth/usage", headers={
                "Authorization": f"Bearer {token}", "anthropic-beta": "oauth-2025-04-20",
                "User-Agent": "herdr-usage-limits/1.0"})
            with urllib.request.urlopen(request, timeout=10) as response:
                data = json.load(response)
            cache.update(data={k: data.get(k) for k in ("five_hour", "seven_day", "thirty_day", "extra_usage")}, at=now, error=None)
        except urllib.error.HTTPError as error:
            cache["error"] = f"Claude API: HTTP {error.code}. Используются последние данные."
            if error.code == 429:
                cache["retry"] = now + 900
        except RuntimeError as error:
            cache["error"] = str(error)
        except (OSError, ValueError, subprocess.SubprocessError):
            cache["error"] = "Claude API недоступен. Используются последние данные."
        try:
            temporary = CACHE.with_suffix(".tmp")
            temporary.write_text(json.dumps(cache))
            temporary.replace(CACHE)
        except OSError:
            pass
    fallback = read_json(HOME / ".cache/over9k/usage/claude.json")
    data = cache.get("data") or fallback
    at = cache.get("at") if cache.get("data") else fallback.get("at")
    if fallback.get("at", 0) > (at or 0) and not fallback.get("api"):
        data = dict(data, **{k: fallback[k] for k in ("five_hour", "seven_day") if k in fallback})
        at = fallback["at"]
    windows = [window("5 часов", data.get("five_hour")), window("Неделя", data.get("seven_day"))]
    monthly = window("30 дней", data.get("thirty_day"))
    extra = data.get("extra_usage")
    if monthly.get("used") is None:
        if isinstance(extra, dict) and extra.get("is_enabled") and isinstance(extra.get("monthly_limit"), (int, float)) and extra["monthly_limit"] > 0:
            monthly["used"] = extra.get("utilization")
            if monthly["used"] is None and isinstance(extra.get("used_credits"), (int, float)):
                monthly["used"] = extra["used_credits"] / extra["monthly_limit"] * 100
            monthly["detail"] = "Месячный бюджет extra usage"
        else:
            monthly["detail"] = "Claude не предоставляет лимит за 30 дней" if extra is None else "Месячный extra usage выключен"
    windows.append(monthly)
    return {"name": "Claude", "plan": profile.get("planDisplayName") or profile.get("seatTier", "").replace("_", " ").title(),
            "at": at, "windows": windows, "note": cache.get("error"),
            "source": "Claude API" if cache.get("data") else "Данные Claude Code"}


if __name__ == "__main__":
    rows = []
    for name, collect in (("Codex", codex), ("Claude", claude)):
        try:
            rows.append(collect())
        except Exception:
            rows.append({"name": name, "windows": [], "note": "Не удалось прочитать лимиты. Нажмите «Обновить»."})
    print(json.dumps({"services": rows}, ensure_ascii=False))
