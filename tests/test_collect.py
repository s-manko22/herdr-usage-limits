import importlib.util
import json
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location(
    "collect", Path(__file__).resolve().parents[1] / "mods/usage-limits/collect.py")
collect = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(collect)


class CollectorLocalizationTest(unittest.TestCase):
    def test_legacy_errors_keep_data_and_backoff_without_network(self):
        cases = [
            ("Нет авторизации Claude Code; используются локальные данные.", "claude_auth"),
            ("Claude API недоступен. Используются последние данные.", "claude_unavailable"),
            ("Claude API: HTTP 429. Используются последние данные.", {"key": "claude_http", "code": "429"}),
            ("claude_auth", "claude_auth"),
            ("claude_unavailable", "claude_unavailable"),
            ({"key": "claude_http", "code": 401}, {"key": "claude_http", "code": 401}),
        ]
        with tempfile.TemporaryDirectory() as folder:
            home = Path(folder)
            cache = home / "cache.json"
            (home / ".claude.json").write_text(json.dumps({"oauthAccount": {"accountUuid": "test"}}))
            for old, expected in cases:
                with self.subTest(error=old):
                    cache.write_text(json.dumps({"account": "test", "retry": time.time() + 900,
                        "at": 123, "error": old, "data": {"five_hour": {"utilization": 25}}}))
                    with patch.object(collect, "HOME", home), patch.object(collect, "CACHE", cache), \
                            patch.object(collect, "credentials") as credentials:
                        result = collect.claude()
                    credentials.assert_not_called()
                    self.assertEqual(result["note"], expected)
                    self.assertEqual(result["windows"][0]["used"], 25)
                    self.assertEqual(result["windows"][0]["label"], "five_hours")
                    self.assertEqual(result["windows"][2]["detail"], "monthly_missing")
                    self.assertEqual(result["at"], 123)

    def test_codex_periods_are_language_independent(self):
        with tempfile.TemporaryDirectory() as folder:
            home = Path(folder)
            session = home / "sessions/2026/11/19/session.jsonl"
            session.parent.mkdir(parents=True)
            session.write_text(json.dumps({"timestamp": "2026-11-19T08:00:00Z", "payload": {
                "rate_limits": {"primary": {"window_minutes": 300, "used_percent": 25},
                                "secondary": {"window_minutes": 4320, "used_percent": 50}}}}))
            with patch.dict("os.environ", {"CODEX_HOME": str(home)}):
                result = collect.codex()
            self.assertEqual(result["source"], "codex_source")
            self.assertEqual(result["windows"][0]["label"], "five_hours")
            self.assertEqual(result["windows"][1]["label"], {"key": "days", "count": 3})


if __name__ == "__main__":
    unittest.main()
