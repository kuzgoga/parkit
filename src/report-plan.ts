import { BadGatewayException } from "@nestjs/common";

const fields = [
  "species", "latin", "genus", "group", "place", "event", "habitat", "observer",
  "keyword", "year", "date", "value", "unit", "notes", "document", "page", "quote",
] as const;

type Field = (typeof fields)[number];

export const reportInstructions = `Переведи русский запрос к каталогу наблюдений в JSON.
Для списка, сравнения, отбора по нескольким условиям или сводки верни:
{"kind":"report","filters":{},"columns":["species","date","place"],"groupBy":[],"count":false}.
Поля: ${fields.join(", ")}. year — год наблюдения, date — календарная дата, value — измеренное значение, page — страница PDF, quote — цитата.
В filters допустимы species, latin, genus, group, place, event, habitat, observer, keyword, document: массивы точных названий в именительном падеже (ИЛИ внутри массива, И между полями). yearFrom/yearTo — целые числа включительно, dateFrom/dateTo — строки YYYY-MM-DD включительно. Для одного года укажи обе границы.
columns — запрошенные поля списка. Для подсчёта записей или сравнения их числа укажи count:true и groupBy из year, species, place, observer, event, group, document. Без группировки это общее число записей. Число записей отличается от численности животных.
Если это простой поиск по названию, верни {"kind":"search"}. Если условие нельзя выразить точно (например, сумма измерений, разные условия для разных лет или анализ причин), верни {"kind":"clarify","message":"..."} с коротким уточнением по-русски. При явной просьбе об Excel простой отбор тоже оформляй как report. Не теряй ограничения и не придумывай наблюдения.`;

const filterFields = new Set<string>([...fields.slice(0, 9), "document"]);
const groups = new Set<string>(["year", "species", "place", "observer", "event", "group", "document"]);
const invalid = (): never => { throw new BadGatewayException("Qwen вернула некорректный план таблицы. Уточните запрос."); };
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
function fieldList(value: unknown, allowed: ReadonlySet<string>): Field[] {
  if (!Array.isArray(value) || value.length > fields.length ||
      value.some(k => typeof k !== "string" || !allowed.has(k))) return invalid();
  return [...new Set<Field>(value)];
}

export function parseReportPlan(raw: string) {
  let v: unknown;
  try { v = JSON.parse(raw); } catch { return invalid(); }
  if (!object(v)) return invalid();
  if (v.kind === "search") return { kind: "search" as const };
  if (v.kind === "clarify" && typeof v.message === "string" && v.message.trim())
    return { kind: "clarify" as const, message: v.message.slice(0, 400) };
  if (v.kind !== "report" || !object(v.filters) || typeof v.count !== "boolean") return invalid();
  const filters: Record<string, string[] | number | string> = {};
  for (const [key, value] of Object.entries(v.filters)) {
    if (filterFields.has(key) && Array.isArray(value) && value.length && value.length <= 50 &&
        value.every(x => typeof x === "string" && x.trim() && x.length <= 250))
      filters[key] = value.map(x => x.trim());
    else if ((key === "yearFrom" || key === "yearTo") && typeof value === "number" &&
      Number.isInteger(value) && value >= 1 && value <= 9999) filters[key] = value;
    else if ((key === "dateFrom" || key === "dateTo") && typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value) filters[key] = value;
    else return invalid();
  }
  for (const prefix of ["year", "date"]) {
    const lo = filters[prefix + "From"], hi = filters[prefix + "To"];
    if (lo !== undefined && hi !== undefined && lo > hi) return invalid();
  }
  const columns = fieldList(v.columns, new Set(fields));
  const groupBy = fieldList(v.groupBy, groups);
  if (!v.count && (!columns.length || groupBy.length)) return invalid();
  return { kind: "report" as const, filters, columns, groupBy, count: v.count };
}
