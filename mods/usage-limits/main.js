import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, exec, appHome, checking, run } from "herdr";

function duration(seconds) {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} ч ${minutes % 60} мин` : `${Math.floor(hours / 24)} д ${hours % 24} ч`;
}

export default class Limits extends View {
  init(_props, cx) {
    this.services = [
      { name: "Codex", windows: [{ label: "Лимит" }] },
      { name: "Claude", windows: ["5 часов", "Неделя", "30 дней"].map(label => ({ label })) },
    ];
    this.loading = false;
    if (checking()) return;
    this.refresh(cx);
    cx.timer.every(60000, cx => this.refresh(cx));
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
        this.error = "Не удалось обновить данные. Проверьте доступность Python 3.";
      } finally {
        this.loading = false;
        cx.notify();
      }
    });
  }

  limit(row, index, t) {
    const expired = row.reset != null && row.reset <= Date.now() / 1000;
    const known = Number.isFinite(row.used) && !expired;
    const remaining = known ? Math.max(0, Math.min(100, 100 - row.used)) : null;
    const color = !known ? t.dim : remaining <= 20 ? t.ansi1 : remaining <= 50 ? t.ansi3 : t.ansi2;
    return v_flex().gap(6).py(7)
      .child(h_flex().items_center().justify_between().gap(8)
        .child(div().text_color(t.muted).child(row.label))
        .child(div().font_semibold().text_color(color).child(known ? `${Math.round(remaining)}% осталось` : "Нет данных")))
      .child(div().w_full().h(6).rounded(3).bg(t.raised).overflow_hidden()
        .when(known, el => el.child(div().h(6).rounded(3).bg(color).w(`${remaining}%`))))
      .when(Boolean(row.reset) && !expired, el => el.child(div().id(`reset-${index}`).text_size(11).text_color(t.dim)
        .tooltip(new Date(row.reset * 1000).toLocaleString()).child(`Сброс через ${duration(row.reset - Date.now() / 1000)}`)))
      .when(expired, el => el.child(div().text_size(11).text_color(t.dim).child("Период истёк — ожидаются новые данные")))
      .when(Boolean(row.detail), el => el.child(div().text_size(11).text_color(t.dim).child(row.detail)));
  }

  render(cx) {
    const t = theme();
    return v_flex().size_full().bg(t.surface).text_color(t.foreground).text_size(12)
      .child(h_flex().h(44).flex_none().px(12).gap(8).items_center().border_b(1).border_color(t.border)
        .child(svg("mods/usage-limits/icon.svg").size(16).text_color(t.accent))
        .child(div().flex_1().font_semibold().child("Лимиты"))
        .child(div().id("refresh").px(7).py(4).rounded(5).cursor_pointer().text_color(t.muted)
          .hover(el => el.bg(t.hover)).on_click((_e, cx) => this.refresh(cx))
          .child(this.loading ? "Обновление…" : "Обновить"))
        .child(div().id("close").px(5).py(4).rounded(5).cursor_pointer().text_color(t.dim)
          .hover(el => el.bg(t.hover)).on_click(() => run("layout.hide", { id: "panel" })).child("×")))
      .child(v_flex().id("limits-scroll").flex_1().min_h(0).overflow_y_scrollbar().p(12).gap(12)
        .children(this.services.map(service => {
          const age = service.at ? Date.now() / 1000 - service.at : null;
          return v_flex().flex_none().p(12).gap(6).rounded(10).border(1).border_color(t.border)
            .child(h_flex().items_center().gap(7)
              .child(div().size(7).rounded(4).bg(age === null || age > 900 ? t.dim : t.ansi2))
              .child(div().font_semibold().text_size(15).child(service.name))
              .when(Boolean(service.plan), el => el.child(div().min_w(0).truncate().px(5).py(2).rounded(4).bg(t.raised).text_size(10).text_color(t.muted).child(service.plan))))
            .child(div().text_size(10.5).text_color(t.dim).child(age === null ? "Ожидаются данные" : age < 60 ? "Данные только что обновлены" : `Данные ${duration(age)} назад`))
            .children((service.windows ?? []).map((row, i) => this.limit(row, `${service.name}-${i}`, t)))
            .when(Boolean(service.source), el => el.child(div().text_size(10.5).text_color(t.dim).child(service.source)))
            .when(Boolean(service.note), el => el.child(div().text_size(11).text_color(t.muted).child(service.note)));
        }))
        .when(Boolean(this.error), el => el.child(div().text_color(t.ansi1).child(this.error)))
        .child(div().text_size(11).text_color(t.dim).child("Локальные данные — каждую минуту, Claude API — раз в 5 минут. Проценты показывают остаток.")));
  }
}
