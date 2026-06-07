"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { CATS, MEALS, type CatKey, type MenuItem } from "@/utils/ashara-label-generator/menuData";
import "./label-generator.css";

type LabelRow = MenuItem & { qty: number; checked: boolean };

function catColorStyle(hex: string): React.CSSProperties {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return {
    background: hex,
    color: luminance > 0.6 ? "#333" : "#fff",
    border: luminance > 0.75 ? "1px solid #ccc" : "none",
  };
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso: string) {
  if (!iso) return "";
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function LabelCell({ item, dateStr }: { item: MenuItem; dateStr: string }) {
  const cat = CATS[item.cat];
  return (
    <div className="lg-lbl">
      <div className="lg-lbl-stripe" style={{ background: cat.color }} />
      <div className="lg-lbl-body">
        <div className="lg-lbl-cat">{cat.label}</div>
        <div className="lg-lbl-name">{item.name}</div>
        {item.serving && <div className="lg-lbl-srv">{item.serving}</div>}
        {dateStr && <div className="lg-lbl-date">Prep: {dateStr}</div>}
      </div>
    </div>
  );
}

export default function LabelGenerator() {
  const [mealId, setMealId] = useState("n1");
  const [prepDate, setPrepDate] = useState(todayISO);
  const [labelSize, setLabelSize] = useState<"small" | "large">("small");
  const [rows, setRows] = useState<LabelRow[]>([]);
  const printAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const meal = MEALS.find((m) => m.id === mealId);
    if (!meal) return;
    setRows(
      meal.items.map((item) => ({
        ...item,
        qty: 1,
        checked: !!item.name,
      }))
    );
  }, [mealId]);

  const updateRow = useCallback((idx: number, field: keyof LabelRow, value: string | number | boolean) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  }, []);

  const selectAll = (checked: boolean) => setRows((prev) => prev.map((r) => ({ ...r, checked })));

  const expandedLabels = rows.flatMap((r) => {
    if (!r.checked || !r.name.trim()) return [];
    return Array(Math.max(1, r.qty || 1)).fill(r) as MenuItem[];
  });

  const dateStr = formatDate(prepDate);
  const maxPerSheet = labelSize === "small" ? 30 : 10;
  const sheetClass = labelSize === "small" ? "lg-sheet-small" : "lg-sheet-large";

  const pages: (MenuItem | null)[][] = [];
  for (let i = 0; i < expandedLabels.length; i += maxPerSheet) {
    const slice: (MenuItem | null)[] = expandedLabels.slice(i, i + maxPerSheet);
    while (slice.length < maxPerSheet) slice.push(null);
    pages.push(slice);
  }

  const handlePrint = () => {
    if (!expandedLabels.length) {
      alert("No items selected to print.");
      return;
    }
    document.body.classList.add("lg-printing");
    window.print();
    window.setTimeout(() => document.body.classList.remove("lg-printing"), 500);
  };

  return (
    <div className="lg-wrap">
      <div className="lg-controls">
        <div className="lg-ctrl">
          <label htmlFor="lg-meal">Meal</label>
          <select
            id="lg-meal"
            style={{ minWidth: 260 }}
            value={mealId}
            onChange={(e) => setMealId(e.target.value)}
          >
            {MEALS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
                {m.sub ? `  (${m.sub})` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="lg-ctrl">
          <label htmlFor="lg-date">Date of Prep</label>
          <input id="lg-date" type="date" value={prepDate} onChange={(e) => setPrepDate(e.target.value)} />
        </div>

        <div className="lg-ctrl">
          <label htmlFor="lg-size">Label Size</label>
          <select id="lg-size" value={labelSize} onChange={(e) => setLabelSize(e.target.value as "small" | "large")}>
            <option value="small">Small — 1″ × 2⅝″  (30 / sheet, Avery 5160)</option>
            <option value="large">Large — 2″ × 4″  (10 / sheet)</option>
          </select>
        </div>

        <div className="lg-btn-row">
          <button type="button" className="lg-btn lg-btn-primary" onClick={handlePrint}>
            Print Labels
          </button>
          <button type="button" className="lg-btn lg-btn-secondary" onClick={() => selectAll(true)}>
            Check All
          </button>
          <button type="button" className="lg-btn lg-btn-secondary" onClick={() => selectAll(false)}>
            Uncheck All
          </button>
        </div>
      </div>

      <div className="lg-legend">
        {(Object.entries(CATS) as [CatKey, (typeof CATS)[CatKey]][]).map(([key, cat]) => (
          <div key={String(key)} className="lg-legend-item">
            <div className="lg-legend-dot" style={catColorStyle(cat.color)} />
            <span>{cat.label}</span>
          </div>
        ))}
      </div>

      <div className="lg-table-wrap">
        <table className="lg-table">
          <thead>
            <tr>
              <th style={{ width: 40 }}>Print</th>
              <th style={{ width: 130 }}>Category</th>
              <th>Item Name</th>
              <th style={{ width: 220 }}>Serving Style</th>
              <th style={{ width: 60, textAlign: "center" }}>Qty</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const cat = CATS[row.cat];
              return (
                <tr key={idx} className={!row.name ? "lg-row-empty" : ""}>
                  <td style={{ textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={row.checked}
                      onChange={(e) => updateRow(idx, "checked", e.target.checked)}
                    />
                  </td>
                  <td>
                    <span className="lg-cat-chip" style={catColorStyle(cat.color)}>
                      {cat.label}
                    </span>
                  </td>
                  <td>
                    <input
                      type="text"
                      value={row.name}
                      placeholder="(not served this meal)"
                      onChange={(e) => updateRow(idx, "name", e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={row.serving}
                      placeholder="Serving style…"
                      onChange={(e) => updateRow(idx, "serving", e.target.value)}
                    />
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <input
                      className="lg-qty-input"
                      type="number"
                      min={1}
                      max={99}
                      value={row.qty}
                      onChange={(e) => updateRow(idx, "qty", parseInt(e.target.value, 10) || 1)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {expandedLabels.length > 0 && (
        <div className="lg-preview-section">
          <p className="lg-preview-title">
            Label Preview — {expandedLabels.length} label
            {expandedLabels.length !== 1 ? "s" : ""} total
          </p>
          <div className="lg-preview-grid">
            {expandedLabels.map((item, i) => {
              const cat = CATS[item.cat];
              return (
                <div key={i} className={`lg-preview-label size-${labelSize}`}>
                  <div className="lg-preview-stripe" style={{ background: cat.color }} />
                  <div className="lg-preview-body">
                    <div className="lg-preview-cat">{cat.label}</div>
                    <div className="lg-preview-name">{item.name}</div>
                    {item.serving && <div className="lg-preview-srv">{item.serving}</div>}
                    {dateStr && <div className="lg-preview-date">Prep: {dateStr}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="lg-print-area" ref={printAreaRef}>
        {pages.map((page, pi) => (
          <div key={pi} className={`lg-label-sheet ${sheetClass}`}>
            {page.map((item, li) =>
              item ? <LabelCell key={li} item={item} dateStr={dateStr} /> : <div key={li} className="lg-lbl" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
