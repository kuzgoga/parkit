const labels = {
  species: 'Вид', latin: 'Латынь', genus: 'Род', group: 'Группа', place: 'Место',
  event: 'Событие', habitat: 'Местообитание', observer: 'Наблюдатель', keyword: 'Ключевые слова',
  year: 'Год', date: 'Дата', value: 'Значение', unit: 'Единица', notes: 'Примечание',
  document: 'Файл', page: 'Страница PDF', quote: 'Цитата',
};
const termTypes = { species:'SPECIES', latin:'LATIN', genus:'GENUS', group:'GROUP', place:'PLACE',
  event:'EVENT', habitat:'HABITAT', observer:'OBSERVER', keyword:'KEYWORD' };
const normalize = text => String(text).normalize('NFKC').trim().toLocaleLowerCase('ru').replaceAll('ё','е');

export function needsPlan(query) {
  const words = normalize(query).match(/[\p{L}\p{N}]+/gu) || [];
  return words.length >= 4 || (words.length >= 3 && words.some(w => ['и','или','за','от','до'].includes(w))) || /таблиц|сравн|сопостав|отчет|сколько|сводк|сводн|группир|распредел|выгруз|экспорт|эксел|ексел|excel|xlsx|перечисл|динамик|по годам|по видам|по местам/iu.test(normalize(query)) ||
    (words.length >= 2 && /(?:19|20)\d{2}/.test(query));
}

function values(row, key) {
  if (Object.hasOwn(termTypes, key)) {
    return [...new Set(row.terms.filter(link => link.term.type === termTypes[key]).map(link => link.term.label))];
  }
  const value = {
    year:row.observedYear, date:row.observedAt?.slice(0,10), value:row.numericValue,
    unit:row.numericUnit, notes:row.notes, document:row.document.filename,
    page:row.sourcePage, quote:row.sourceExcerpt,
  }[key];
  return value == null ? [] : [value];
}

function matches(row, filters) {
  return Object.entries(filters).every(([key, expected]) => {
    if (Array.isArray(expected)) {
      const found = values(row, key).map(normalize);
      return expected.some(item => found.includes(normalize(item)));
    }
    const value = key.startsWith('year') ? row.observedYear : row.observedAt?.slice(0,10);
    return value != null && (key.endsWith('From') ? value >= expected : value <= expected);
  });
}

function cell(row, field) {
  const items = values(row, field);
  if (!items.length) return null;
  if (field === 'date') return { date:items[0] };
  if (field === 'value') {
    // Excel preserves up to 15 significant digits.
    const value = String(items[0]);
    return value.replace(/[^0-9]/g,'').replace(/^0+/,'').length <= 15 ? Number(value) : value;
  }
  return items.length === 1 ? items[0] : items.join('; ');
}

export function reportTable(records, plan) {
  const unique = new Map(records.filter(row => matches(row, plan.filters)).map(row => [row.id, row]));
  if (!plan.count) {
    const columns = [...new Set([...plan.columns, 'document', 'page', 'quote'])];
    return { matched:unique.size, table:[columns.map(k => labels[k]), ...Array.from(unique.values(), row => columns.map(k => cell(row,k)))] };
  }
  const counts = new Map();
  for (const row of unique.values()) {
    let keys = [[]];
    for (const field of plan.groupBy) {
      const items = values(row, field);
      keys = keys.flatMap(key => (items.length ? items : [null]).map(item => [...key,item]));
    }
    for (const key of keys) {
      const id = JSON.stringify(key);
      counts.set(id, (counts.get(id) || 0) + 1);
    }
  }
  const rows = Array.from(counts, ([key, count]) => [...JSON.parse(key), count]);
  rows.sort((a,b) => JSON.stringify(a.slice(0,-1)).localeCompare(JSON.stringify(b.slice(0,-1)),'ru',{numeric:true}));
  return { matched:unique.size, table:[[...plan.groupBy.map(k=>labels[k]), 'Число записей'], ...rows] };
}
