const encoder = new TextEncoder();
const main = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const office = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const packageRels = 'http://schemas.openxmlformats.org/package/2006/relationships';
const types = 'http://schemas.openxmlformats.org/package/2006/content-types';
const spreadsheetType = 'application/vnd.openxmlformats-officedocument.spreadsheetml';
const xmlHeader = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function escapeXml(text) {
  return String(text).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function column(index) {
  return index < 26 ? String.fromCharCode(65 + index) : `${column(Math.floor(index / 26) - 1)}${column(index % 26)}`;
}

function relations(entries) {
  const nodes = entries.map(([id, type, target, mode]) =>
    `<Relationship Id="${id}" Type="${office}/${type}" Target="${escapeXml(target)}"${mode ? ' TargetMode="External"' : ''}/>`);
  return `<Relationships xmlns="${packageRels}">${nodes.join('')}</Relationships>`;
}

function workbookFiles(rows) {
  const links = [];
  const sheetRows = rows.map((row, index) => {
    const number = index + 1;
    const cells = row.map((value, i) => {
      if (value == null || value === '') return '';
      const ref = `${column(i)}${number}`;
      if (typeof value === 'number') return `<c r="${ref}"><v>${value}</v></c>`;
      if (value.date) {
        const days = (Date.parse(value.date) - Date.UTC(1899, 11, 30)) / 86400000;
        return `<c r="${ref}" s="1"><v>${days}</v></c>`;
      }
      const text = value.url || value;
      if (value.url) links.push({ ref, url: value.url, id: `rId${links.length + 1}` });
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
    });
    return `<row r="${number}">${cells.join('')}</row>`;
  });
  const range = `A1:${column(rows[0].length - 1)}${rows.length}`;
  const hyperlinks = links.map(({ ref, id }) => `<hyperlink ref="${ref}" r:id="${id}"/>`).join('');
  const files = {
    '[Content_Types].xml': `<Types xmlns="${types}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${spreadsheetType}.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="${spreadsheetType}.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="${spreadsheetType}.styles+xml"/></Types>`,
    '_rels/.rels': relations([['rId1', 'officeDocument', 'xl/workbook.xml']]),
    'xl/workbook.xml': `<workbook xmlns="${main}" xmlns:r="${office}"><sheets><sheet name="Наблюдения" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': relations([['rId1', 'worksheet', 'worksheets/sheet1.xml'], ['rId2', 'styles', 'styles.xml']]),
    'xl/styles.xml': `<styleSheet xmlns="${main}"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd.mm.yyyy"/></numFmts><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    'xl/worksheets/sheet1.xml': `<worksheet xmlns="${main}" xmlns:r="${office}"><dimension ref="${range}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="16" width="23" customWidth="1"/><col min="17" max="19" width="19" customWidth="1"/><col min="20" max="21" width="50" customWidth="1"/></cols><sheetData>${sheetRows.join('')}</sheetData><autoFilter ref="${range}"/>${hyperlinks ? `<hyperlinks>${hyperlinks}</hyperlinks>` : ''}</worksheet>`,
  };
  if (links.length) files['xl/worksheets/_rels/sheet1.xml.rels'] = relations(links.map(({ id, url }) => [id, 'hyperlink', url, true]));
  return files;
}

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  return crc;
});

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(files) {
  const parts = [];
  const directory = [];
  let offset = 0;
  let directorySize = 0;
  for (const [path, xml] of Object.entries(files)) {
    const name = encoder.encode(path);
    const data = encoder.encode(xmlHeader + xml);
    const crc = crc32(data);
    const header = new DataView(new ArrayBuffer(30));
    header.setUint32(0, 0x04034b50, true);
    header.setUint16(4, 20, true);
    header.setUint16(12, 0x21, true);
    header.setUint32(14, crc, true);
    header.setUint32(18, data.length, true);
    header.setUint32(22, data.length, true);
    header.setUint16(26, name.length, true);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(14, 0x21, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, data.length, true);
    entry.setUint32(24, data.length, true);
    entry.setUint16(28, name.length, true);
    entry.setUint32(42, offset, true);
    parts.push(header.buffer, name, data);
    directory.push(entry.buffer, name);
    offset += 30 + name.length + data.length;
    directorySize += 46 + name.length;
  }
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, directory.length / 2, true);
  end.setUint16(10, directory.length / 2, true);
  end.setUint32(12, directorySize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...directory, end.buffer], { type: `${spreadsheetType}.sheet` });
}

export function createWorkbook(rows) {
  return zip(workbookFiles(rows));
}

