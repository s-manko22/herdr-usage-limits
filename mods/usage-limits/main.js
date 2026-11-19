import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, exec, appHome, checking, run, props } from "herdr";
import { text, duration } from "./i18n.js";

export default class Limits extends View {
  init(_props, cx) {
    const saved = localStorage.getItem("language");
    this.language = [saved, props()?.language].find(language => language === "ru" || language === "en") ?? "ru";
    this.services = [
      { name: "Codex", windows: [{ label: "quota" }] },
      { name: "Claude", windows: ["five_hours", "week", "month"].map(label => ({ label })) },
    ];
    this.loading = false;
    if (checking()) return;
    this.refresh(cx);
    cx.timer.every(60000, cx => this.refresh(cx));
  }

  setLanguage(language, cx) {
    this.language = language;
    localStorage.setItem("language", language);
    cx.notify();
  }

  refresh(cx) {
    if (this.loading) return;
    this.loading = true;
    this.error = null;
    cx.notify();
    cx.spawn(async cx => {
      try {
        const result = await exec("python3", ["-B", `${appHome()}/mods/usage-limits/collect.py`], { timeout: 25000 });
        if (result.code !== 0) throw new Error("collector");
        const data = JSON.parse(result.stdout);
        if (!Array.isArray(data.services)) throw new Error("data");
        this.services = data.services;
      } catch {
        this.error = "refresh_error";
      } finally {
        this.loading = false;
        cx.notify();
      }
    });
  }

  limit(row, index, t) {
    const tr = (message, params) => text(this.language, message, params);
    const expired = row.reset != null && row.reset <= Date.now() / 1000;
    const known = Number.isFinite(row.used) && !expired;
    const remaining = known ? Math.max(0, Math.min(100, 100 - row.used)) : null;
    const color = !known ? t.dim : remaining <= 20 ? t.ansi1 : remaining <= 50 ? t.ansi3 : t.ansi2;
    return v_flex().gap(6).py(7)
      .child(h_flex().items_center().justify_between().gap(8)
        .child(div().text_color(t.muted).child(tr(row.label)))
        .child(div().font_semibold().text_color(color).child(known ? tr("remaining", { percent: Math.round(remaining) }) : tr("unavailable"))))
      .child(div().w_full().h(6).rounded(3).bg(t.raised).overflow_hidden()
        .when(known, el => el.child(div().h(6).rounded(3).bg(color).w(`${remaining}%`))))
      .when(Boolean(row.reset) && !expired, el => el.child(div().id(`reset-${index}`).text_size(11).text_color(t.dim)
        .tooltip(new Date(row.reset * 1000).toLocaleString(this.language === "en" ? "en-US" : "ru-RU"))
        .child(tr("reset", { time: duration(row.reset - Date.now() / 1000, this.language) }))))
      .when(expired, el => el.child(div().text_size(11).text_color(t.dim).child(tr("expired"))))
      .when(Boolean(row.detail), el => el.child(div().text_size(11).text_color(t.dim).child(tr(row.detail))));
  }

  render(cx) {
    const t = theme();
    const tr = (message, params) => text(this.language, message, params);
    return v_flex().size_full().bg(t.surface).text_color(t.foreground).text_size(12)
      .child(h_flex().h(44).flex_none().px(12).gap(6).items_center().border_b(1).border_color(t.border)
        .child(svg("mods/usage-limits/icon.svg").size(16).text_color(t.accent))
        .child(div().flex_1().min_w(0).truncate().font_semibold().child(tr("title")))
        .child(h_flex().gap(2).children(["ru", "en"].map(language =>
          div().id(`language-${language}`).px(4).py(4).rounded(5).cursor_pointer()
            .text_color(this.language === language ? t.accent : t.dim)
            .bg(this.language === language ? t.raised : t.surface)
            .tooltip(language === "en" ? "English" : "Русский")
            .hover(el => el.bg(t.hover)).on_click((_e, cx) => this.setLanguage(language, cx))
            .child(language.toUpperCase()))))
        .child(div().id("refresh").px(5).py(4).rounded(5).cursor_pointer().text_color(t.muted)
          .hover(el => el.bg(t.hover)).on_click((_e, cx) => this.refresh(cx))
          .child(tr(this.loading ? "refreshing" : "refresh")))
        .child(div().id("close").px(5).py(4).rounded(5).cursor_pointer().text_color(t.dim)
          .tooltip(tr("close")).hover(el => el.bg(t.hover)).on_click(() => run("layout.hide", { id: "panel" })).child("×")))
      .child(v_flex().id("limits-scroll").flex_1().min_h(0).overflow_y_scrollbar().p(12).gap(12)
        .children(this.services.map(service => {
          const age = service.at ? Date.now() / 1000 - service.at : null;
          return v_flex().flex_none().p(12).gap(6).rounded(10).border(1).border_color(t.border)
            .child(h_flex().items_center().gap(7)
              .child(div().size(7).rounded(4).bg(age === null || age > 900 ? t.dim : t.ansi2))
              .child(div().font_semibold().text_size(15).child(service.name))
              .when(Boolean(service.plan), el => el.child(div().min_w(0).truncate().px(5).py(2).rounded(4).bg(t.raised).text_size(10).text_color(t.muted).child(service.plan))))
            .child(div().text_size(10.5).text_color(t.dim).child(age === null ? tr("waiting") : age < 60 ? tr("fresh") : tr("age", { time: duration(age, this.language) })))
            .children((service.windows ?? []).map((row, i) => this.limit(row, `${service.name}-${i}`, t)))
            .when(Boolean(service.source), el => el.child(div().text_size(10.5).text_color(t.dim).child(tr(service.source))))
            .when(Boolean(service.note), el => el.child(div().text_size(11).text_color(t.muted).child(tr(service.note))));
        }))
        .when(Boolean(this.error), el => el.child(div().text_color(t.ansi1).child(tr(this.error))))
        .child(div().text_size(11).text_color(t.dim).child(tr("footer"))));
  }
}
