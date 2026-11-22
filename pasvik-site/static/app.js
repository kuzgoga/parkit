import { needsPlan, reportTable } from './report.js';
import { api } from './api.js';
import { createWorkbook } from './xlsx.js';
import { initUploads } from './uploads.js';

const icons = {
  tree: '<path d="M12 3 6 10h3l-5 6h6v5h4v-5h6l-5-6h3Z"/>',
  book: '<path d="M12 6c-2-2-5-3-9-2v14c4-1 7 0 9 2 2-2 5-3 9-2V4c-4-1-7 0-9 2Zm0 0v14"/>',
  filter: '<path d="M4 6h16M7 12h10m-7 6h4"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.3"/><path d="m16 16 4.2 4.2"/>',
  upload: '<path d="M12 15V3m-4 4 4-4 4 4M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Zm0 0v6h6M8 13h8m-8 4h8"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  moon: '<path d="M20.5 14.3A8.7 8.7 0 0 1 9.7 3.5 8.8 8.8 0 1 0 20.5 14.3Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
};
const $ = selector => document.querySelector(selector);
const form = $('#filters');
const dialog = $('#record-dialog');
const documents = new Map();
const polling = new Set();
const sourceUrls = new Map();
const months = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const pageSize = 8;
let allRecords = [];
let sourceRecords = [];
let filtered = [];
let selection = {};
let page = 1;
let sortMode = 'new';
let activeMonth = null;
let requestNumber = 0;

function element(tag, className = '', value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value != null) node.textContent = String(value);
  return node;
}

function icon(name) {
  const svg = $('#icons').content.firstElementChild.cloneNode();
  svg.innerHTML = icons[name];
  return svg;
}

function count(n) {
  const form = new Intl.PluralRules('ru').select(n);
  return `${n.toLocaleString('ru')} ${{ one: 'запись', few: 'записи', many: 'записей', other: 'записи' }[form]}`;
}

function normalized(value) {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase('ru').replaceAll('ё', 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function term(row, type) {
  return row.terms?.find(link => link.term?.type === type)?.term?.label || '';
}

function mapObservation(row) {
  const filename = row.document?.filename || 'Летопись';
  return {
    id: row.id,
    documentId: row.documentId,
    species: term(row, 'SPECIES'),
    latin: term(row, 'LATIN'),
    genus: term(row, 'GENUS'),
    group: term(row, 'GROUP'),
    place: term(row, 'PLACE'),
    habitat: term(row, 'HABITAT'),
    event: term(row, 'EVENT'),
    observer: term(row, 'OBSERVER'),
    keywords: row.terms?.filter(link => link.term?.type === 'KEYWORD').map(link => link.term.label) || [],
    date: row.observedAt?.slice(0, 10) || '',
    year: row.observedYear,
    value: row.numericValue,
    unit: row.numericUnit,
    notes: row.notes,
    source: { filename, pdf_page: row.sourcePage || 1, quote: row.sourceExcerpt || '' },
  };
}

function showScreen() {
  const requested = location.hash.slice(1);
  const screen = ['observations', 'volumes', 'checks'].includes(requested) ? requested : 'observations';
  document.querySelectorAll('[data-screen]').forEach(node => { node.hidden = node.dataset.screen !== screen; });
  document.querySelectorAll('[data-view]').forEach(node => {
    if (node.dataset.view === screen) node.setAttribute('aria-current', 'page');
    else node.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);
}

async function sourceUrl(id) {
  const cached = sourceUrls.get(id);
  if (cached && cached.expires > Date.now()) return cached.url;
  const url = await api.source(id);
  sourceUrls.set(id, { url, expires: Date.now() + 120000 });
  return url;
}

async function openDocument(id, pageNumber = 1) {
  const tab = window.open('', '_blank');
  try {
    const url = await sourceUrl(id);
    if (tab) tab.location.href = `${url}#page=${pageNumber}`;
    else window.location.href = `${url}#page=${pageNumber}`;
  } catch (error) {
    tab?.close();
    alert(error.message || 'Не удалось открыть источник.');
  }
}

function dateLabel(row) {
  return row.date ? row.date.split('-').reverse().join('.') : String(row.year || '—');
}

function populateOptions() {
  const sets = {
    species: allRecords.map(row => row.species),
    group: allRecords.map(row => row.group),
    place: allRecords.map(row => row.place),
    event: allRecords.map(row => row.event),
    from: allRecords.map(row => row.year),
    to: allRecords.map(row => row.year),
  };
  for (const [name, values] of Object.entries(sets)) {
    const select = form.elements.namedItem(name);
    const selected = select.value;
    select.replaceChildren(new Option(select.options[0]?.textContent || 'Все', ''));
    const unique = [...new Set(values.filter(Boolean))].sort(name === 'from' || name === 'to' ? (a, b) => a - b : (a, b) => String(a).localeCompare(String(b), 'ru'));
    for (const value of unique) select.add(new Option(value, value));
    select.value = selected;
  }
}

function strictFilters(next) {
  const keys = ['species', 'group', 'place', 'event', 'latin', 'genus', 'observer', 'habitat', 'keyword', 'dateFrom', 'dateTo'];
  const filters = Object.fromEntries(keys.filter(key => next[key]?.trim()).map(key => [key, next[key].trim()]));
  if (next.from) filters.yearFrom = next.from;
  if (next.to) filters.yearTo = next.to;
  return filters;
}

async function applyFilters() {
  const next = Object.fromEntries(new FormData(form));
  const error = $('#filter-error');
  const reversed = next.from && next.to && Number(next.from) > Number(next.to);
  error.hidden = !reversed;
  error.textContent = reversed ? 'Начальный год должен быть раньше конечного.' : '';
  if (reversed) return;
  selection = next;
  activeMonth = null;
  page = 1;
  const filters = strictFilters(next);
  const active = Object.keys(filters).length;
  $('#active-filters').hidden = !active;
  $('#active-filters').textContent = active;
  const current = ++requestNumber;
  $('#result-count').textContent = 'Ищем…';
  try {
    const rows = active ? await api.observations(filters) : allRecords;
    if (current !== requestNumber) return;
    sourceRecords = rows.map(row => 'documentId' in row && 'source' in row ? row : mapObservation(row));
    renderResults();
  } catch (cause) {
    if (current !== requestNumber) return;
    $('#result-count').textContent = 'Ошибка поиска';
    $('#empty').hidden = false;
    $('#empty-title').textContent = 'Не удалось получить наблюдения';
    $('#empty-text').textContent = cause.message;
    $('#results-table').hidden = true;
  }
}

function searchMatches(row) {
  const terms = normalized(selection.q).split(' ').filter(Boolean);
  if (!terms.length) return true;
  const text = normalized([row.species, row.latin, row.genus, row.group, row.place, row.habitat, row.event, row.observer, ...row.keywords, row.date, row.year, row.source.quote, row.source.filename].filter(Boolean).join(' '));
  return terms.every(term => text.includes(term));
}

function rowFor(record) {
  const row = element('tr');
  const species = element('td', 'species');
  species.append(element('strong', '', record.species || record.event || 'Наблюдение'));
  if (record.latin) species.append(element('small', '', record.latin));
  row.append(species);
  for (const [label, value] of [['Событие', record.event], ['Дата', dateLabel(record)], ['Место', record.place]]) {
    const cell = element('td', label === 'Дата' ? 'date' : '', value || '—');
    cell.dataset.label = label;
    row.append(cell);
  }
  const source = element('td');
  source.dataset.label = 'Источник';
  const button = element('button', 'source-button', `${record.source.filename} · с. ${record.source.pdf_page}`);
  button.type = 'button';
  button.dataset.record = record.id;
  source.append(button);
  row.append(source);
  return row;
}

const monthButtons = months.map((month, index) => {
  const button = element('button', 'month-button');
  button.type = 'button';
  button.append(element('span', 'month-bar'), element('span', '', month.slice(0, 3).toLowerCase()));
  button.addEventListener('click', () => { activeMonth = activeMonth === index ? null : index; page = 1; renderResults(); });
  return button;
});
$('#timeline-grid').append(...monthButtons);

function renderTimeline(records) {
  const counts = Array(12).fill(0);
  for (const row of records) {
    const month = Number(row.date?.slice(5, 7)) - 1;
    if (month >= 0 && month < 12) counts[month]++;
  }
  const max = Math.max(...counts);
  $('#timeline').hidden = !max;
  $('#timeline-note').textContent = activeMonth == null ? 'Выберите месяц, чтобы уточнить выдачу.' : `Выбран ${months[activeMonth].toLowerCase()}. Нажмите ещё раз, чтобы сбросить.`;
  monthButtons.forEach((button, index) => {
    button.disabled = !counts[index];
    button.title = `${months[index]} · ${count(counts[index])}`;
    button.setAttribute('aria-pressed', String(index === activeMonth));
    button.firstElementChild.style.setProperty('--bar-scale', max ? counts[index] / max : 0);
  });
}

function renderResults() {
  const matching = sourceRecords.filter(searchMatches);
  renderTimeline(matching);
  filtered = activeMonth == null ? matching : matching.filter(row => Number(row.date?.slice(5, 7)) - 1 === activeMonth);
  const date = row => row.date || (row.year ? `${row.year}-00-00` : '');
  filtered.sort((a, b) => sortMode === 'name' ? (a.species || '').localeCompare(b.species || '', 'ru') : sortMode === 'old' ? date(a).localeCompare(date(b)) : date(b).localeCompare(date(a)));
  const offset = (page - 1) * pageSize;
  $('#result-count').textContent = count(filtered.length);
  $('#results').replaceChildren(...filtered.slice(offset, offset + pageSize).map(rowFor));
  $('#results-table').hidden = !filtered.length;
  document.querySelectorAll('[data-export]').forEach(button => { button.disabled = !filtered.length; });
  $('#pager').hidden = filtered.length <= pageSize;
  $('#page-summary').textContent = `${offset + 1}–${Math.min(offset + pageSize, filtered.length)} из ${filtered.length}`;
  $('#prev').disabled = page <= 1;
  $('#next').disabled = offset + pageSize >= filtered.length;
  $('#empty').hidden = Boolean(filtered.length);
  $('#empty-title').textContent = 'Ничего не найдено';
  $('#empty-text').textContent = 'Измените запрос или сбросьте фильтры.';
}

function openRecord(record) {
  const content = $('#record-content');
  const heading = element('div', 'record-heading');
  heading.append(element('h2', '', record.species || record.event || 'Наблюдение'));
  if (record.latin) heading.append(element('p', '', record.latin));
  const metadata = element('dl', 'record-fields');
  const fields = [
    ['Дата', dateLabel(record)], ['Событие', record.event], ['Место', record.place], ['Наблюдатель', record.observer],
    ['Группа', record.group], ['Род', record.genus], ['Местообитание', record.habitat],
    ['Значение', record.value == null ? '' : `${record.value} ${record.unit || ''}`], ['Ключевые слова', record.keywords.join(', ')], ['Примечание', record.notes],
  ];
  for (const [label, value] of fields) {
    if (!value || value === '—') continue;
    const item = element('div');
    item.append(element('dt', '', label), element('dd', '', value));
    metadata.append(item);
  }
  const evidence = element('section', 'record-source');
  evidence.append(element('h3', '', 'Фрагмент летописи'));
  evidence.append(element('p', '', `${record.source.filename} · страница PDF ${record.source.pdf_page}`));
  if (record.source.quote) evidence.append(element('blockquote', '', record.source.quote));
  const open = element('button', 'button button-outline', 'Открыть источник');
  open.type = 'button';
  open.addEventListener('click', () => openDocument(record.documentId, record.source.pdf_page));
  evidence.append(open);
  content.replaceChildren(heading, metadata, evidence);
  dialog.showModal();
}

const statusLabels = { QUEUED: 'В очереди', PROCESSING: 'Обрабатывается', PROCESSED: 'Готово', FAILED: 'Ошибка' };
function renderVolumes() {
  const grid = $('#volume-list');
  grid.replaceChildren();
  const list = [...documents.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const doc of list) {
    const card = element('article', 'volume-card');
    const cover = element('div', 'volume-cover');
    cover.append(icon('book'));
    const body = element('div', 'volume-body');
    body.append(element('h2', '', doc.filename));
    const detail = element('p');
    detail.append(`${(doc.size / 1024 / 1024).toFixed(1)} МБ · `);
    const status = element('span', 'volume-status', statusLabels[doc.status] || doc.status);
    status.dataset.status = doc.status;
    detail.append(status);
    if (doc.ocrUsed) detail.append(' · OCR');
    body.append(detail);
    if (doc.error) body.append(element('p', 'volume-error', doc.error));
    const actions = element('div', 'volume-actions');
    const open = element('button', 'button button-outline', 'Открыть файл');
    open.type = 'button';
    open.addEventListener('click', () => openDocument(doc.id));
    actions.append(open);
    body.append(actions);
    card.append(cover, body);
    grid.append(card);
  }
  if (!list.length) grid.append(element('p', 'empty', 'Пока нет загруженных файлов.'));
}

async function refreshIndex() {
  allRecords = (await api.observations()).map(mapObservation);
  populateOptions();
  await applyFilters();
}

async function watchDocument(doc) {
  if (polling.has(doc.id) || !['QUEUED', 'PROCESSING'].includes(doc.status)) return;
  polling.add(doc.id);
  let current = doc;
  while (['QUEUED', 'PROCESSING'].includes(current.status)) {
    try {
      const result = await api.waitDocument(current.id, current.status);
      current = result.document;
      documents.set(current.id, current);
      renderVolumes();
      if (current.status === 'PROCESSED') {
        $('#archive-notice').hidden = false;
        $('#archive-notice').textContent = `Готово: ${current.filename}`;
        await refreshIndex();
      }
    } catch (error) {
      $('#archive-notice').hidden = false;
      $('#archive-notice').dataset.error = '';
      $('#archive-notice').textContent = `Не удалось проверить статус ${current.filename}: ${error.message}. Повторяем.`;
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  polling.delete(doc.id);
}

function csvCell(value) {
  const text = String(value ?? '');
  const safe = /^\s*[=+@-]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

async function exportResults(format) {
  const headers = ['Вид', 'Латынь', 'Род', 'Группа', 'Событие', 'Дата', 'Год', 'Место', 'Местообитание', 'Наблюдатель', 'Ключевые слова', 'Значение', 'Единица', 'Примечание', 'Файл', 'Страница PDF', 'Фрагмент', 'Источник'];
  const urls = new Map();
  try {
    await Promise.all([...new Set(filtered.map(row => row.documentId))].map(async id => urls.set(id, await sourceUrl(id))));
  } catch (error) { alert(`Не удалось получить ссылку на источник: ${error.message}`); return; }
  const rows = filtered.map(row => {
    const url = `${urls.get(row.documentId)}#page=${row.source.pdf_page}`;
    return [row.species, row.latin, row.genus, row.group, row.event, format === 'xlsx' && row.date ? { date: row.date } : row.date, row.year, row.place, row.habitat, row.observer, row.keywords.join('; '), row.value, row.unit, row.notes, row.source.filename, row.source.pdf_page, row.source.quote, format === 'xlsx' ? { url } : url];
  });
  const table = [headers, ...rows];
  const blob = format === 'xlsx' ? createWorkbook(table) : new Blob(['\ufeff', table.map(row => row.map(csvCell).join(',')).join('\r\n'), '\r\n'], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = element('a');
  anchor.href = url;
  anchor.download = `pasvik-observations.${format}`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

for (const [selector, invoke] of [
  ['#ocr-check', form => api.ocr(form.querySelector('input').files[0])],
  ['#llm-check', form => api.llm(form.querySelector('textarea').value)],
  ['#rag-check', form => api.rag(form.querySelector('input').value)],
]) {
  $(selector).addEventListener('submit', async event => {
    event.preventDefault();
    const target = event.currentTarget;
    const output = target.querySelector('pre');
    const button = target.querySelector('button');
    output.textContent = 'Выполняется…';
    button.disabled = true;
    try { output.textContent = JSON.stringify(await invoke(target), null, 2); }
    catch (error) { output.textContent = error.message || 'Ошибка запроса.'; }
    finally { button.disabled = false; }
  });
}

document.querySelectorAll('[data-icon]').forEach(node => node.append(icon(node.dataset.icon)));
const themeToggle = $('#theme-toggle');
function updateThemeButton() {
  const dark = document.documentElement.dataset.theme === 'dark';
  themeToggle.setAttribute('aria-pressed', String(dark));
  themeToggle.title = dark ? 'Включить светлую тему' : 'Включить тёмную тему';
  themeToggle.replaceChildren(icon(dark ? 'sun' : 'moon'));
}
themeToggle.addEventListener('click', () => {
  const root = document.documentElement;
  root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem('pasvik-theme', root.dataset.theme); } catch {}
  updateThemeButton();
});
updateThemeButton();

initUploads(doc => {
  documents.set(doc.id, doc);
  renderVolumes();
  $('#archive-notice').hidden = false;
  $('#archive-notice').removeAttribute('data-error');
  $('#archive-notice').textContent = `Файл ${doc.filename} добавлен в очередь.`;
  void watchDocument(doc);
});
$('#filter-toggle').addEventListener('click', event => {
  const panel = $('#filter-options');
  panel.inert = !panel.inert;
  event.currentTarget.setAttribute('aria-expanded', String(!panel.inert));
});
let reportRevision = 0;
let reportUrl;
function resetReport() {
  reportRevision++;
  if (reportUrl) URL.revokeObjectURL(reportUrl);
  reportUrl = null;
  $('#report-result').hidden = true;
  $('#report-download').hidden = true;
  $('#report-download').removeAttribute('href');
  $('.results').hidden = false;
}

async function submitSearch() {
  resetReport();
  const inputs = Object.fromEntries(new FormData(form));
  const query = inputs.q.trim();
  if (!needsPlan(query)) return applyFilters();
  const revision = reportRevision;
  $('#report-result').hidden = false;
  $('.results').hidden = true;
  const status = $('#report-status');
  if ((inputs.from && inputs.to && Number(inputs.from) > Number(inputs.to)) ||
      (inputs.dateFrom && inputs.dateTo && inputs.dateFrom > inputs.dateTo)) {
    status.textContent = 'Проверьте начало и конец периода.';
    return;
  }
  status.textContent = 'Qwen разбирает запрос…';
  try {
    const plan = await api.reportPlan(query);
    if (revision !== reportRevision) return;
    if (plan.kind === 'search') {
      resetReport();
      return applyFilters();
    }
    if (plan.kind === 'clarify') { status.textContent = plan.message; return; }
    status.textContent = 'Собираем записи для Excel…';
    const filters = strictFilters(inputs);
    for (const key of ['yearFrom','yearTo','dateFrom','dateTo']) {
      const planned = plan.filters[key];
      if (planned === undefined) continue;
      const current = filters[key];
      const value = key.startsWith('year') ? Number(current) : current;
      if (!current || (key.endsWith('From') ? planned > value : planned < value))
        filters[key] = String(planned);
    }
    const records = await api.observations(filters);
    if (revision !== reportRevision) return;
    const { matched, table } = reportTable(records, plan);
    if (!matched) { status.textContent = 'По условиям запроса в обработанных документах нет записей.'; return; }
    if (table.length > 1048576) { status.textContent = 'Выборка превышает размер листа Excel. Уточните период или фильтры.'; return; }
    reportUrl = URL.createObjectURL(createWorkbook(table));
    $('#report-download').href = reportUrl;
    $('#report-download').hidden = false;
    status.textContent = `Готово: ${count(matched)}. Столбцы: ${table[0].join(', ')}.`;
  } catch (error) {
    if (revision === reportRevision) status.textContent = error.message || 'Не удалось подготовить отчёт.';
  }
}
form.addEventListener('submit', event => { event.preventDefault(); void submitSearch(); });
form.addEventListener('input', resetReport);
form.addEventListener('change', () => { resetReport(); void applyFilters(); });
form.addEventListener('reset', () => { resetReport(); setTimeout(() => { void applyFilters(); }, 0); });
const sort = $('#sort');
sort.querySelectorAll('[data-sort]').forEach(button => button.addEventListener('click', () => {
  sortMode = button.dataset.sort;
  $('#sort-label').textContent = button.textContent;
  sort.querySelectorAll('[data-sort]').forEach(option => option.setAttribute('aria-pressed', String(option === button)));
  sort.open = false;
  page = 1;
  renderResults();
}));
document.addEventListener('click', event => { if (!sort.contains(event.target)) sort.open = false; });
$('#prev').addEventListener('click', () => { page--; renderResults(); });
$('#next').addEventListener('click', () => { page++; renderResults(); });
document.querySelectorAll('[data-export]').forEach(button => button.addEventListener('click', () => { void exportResults(button.dataset.export); }));
$('#results').addEventListener('click', event => {
  const button = event.target.closest('button[data-record]');
  if (button) openRecord(filtered.find(row => row.id === button.dataset.record));
});
window.addEventListener('hashchange', showScreen);
showScreen();

try {
  const [loaded] = await Promise.all([api.documents(), refreshIndex()]);
  for (const doc of loaded) documents.set(doc.id, doc);
  renderVolumes();
  for (const doc of loaded) void watchDocument(doc);
} catch (error) {
  console.error(error);
  $('#result-count').textContent = 'Ошибка подключения';
  $('#empty').hidden = false;
  $('#empty-title').textContent = 'Бэкенд недоступен';
  $('#empty-text').textContent = `${error.message}. Проверьте адрес API_URL и запуск бэкенда.`;
}
