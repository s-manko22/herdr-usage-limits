# Herdr Usage Limits — Лимиты

A Herdr sidebar mod for Codex and Claude remaining quotas. English and Russian UI, theme-aware bars, reset countdowns, and automatic refresh.

![Usage Limits — demonstration values](preview.png)

## Install

Ask your agent to read your Herdr `AGENTS.md`, this repository's [RECIPE.md](RECIPE.md), and every source file, then install `mods/usage-limits/` into your Herdr home and add it to your personal layout. The preferred sidebar width is 368px. The close button expects its host layout node to be named `panel`; adapt it when necessary. No layout or keyboard configuration is replaced.

Choose **RU** (Русский) or **EN** (English) in the panel header. The entire panel changes immediately, including cached data labels and error messages. The choice is saved in Herdr's local storage for this panel and survives restarts. New panels default to Russian; to install in English from the start, give the layout block `"content": {"mod": "usage-limits", "props": {"language": "en"}}`. A previously saved choice takes precedence over this initial language.

Requires Python 3 and existing Codex or Claude Code usage. The mod reads local Codex session quota events and Claude Code account metadata, and calls the Anthropic usage endpoint using the existing local Claude Code OAuth token. On macOS it can read that token through Keychain's `security` command. It never prints or caches the token. Quota and account metadata are cached locally; keep these files private.

Codex data refreshes from local sessions every minute; Claude API requests are cached for five minutes (15 minutes after HTTP 429). Codex values can lag actual usage. A Claude monthly row represents extra-usage budget when supplied; unavailable quotas are shown explicitly.

Read the recipe for behavior, dependencies, limits, and validation. The screenshot uses demo data; the distributed collector reads the installing user's own data.

## Development checks

Run `node --test tests/ui.test.mjs` (Node 18+) and `python3 -B -m unittest discover -s tests -p 'test_*.py'`, then `herdr-app check mods/usage-limits`. Tests use fixtures and do not access account credentials or the network.
