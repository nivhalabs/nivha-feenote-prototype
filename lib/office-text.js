/* Extract plain text from DOCX and PPTX files without any dependency.
   Office files are zip archives; the parts we need are stored either raw
   (method 0) or deflated (method 8), both handled by zlib. Used by the QA
   sweep and by the delivery gate that refuses to send draft-stamped files. */
'use strict';

const zlib = require('zlib');

/* Walk the central directory so we get names and sizes without guessing. */
function zipEntries(buf) {
  const out = [];
  /* End of central directory record — scan backwards for the signature. */
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nameLen).toString('utf8');
    out.push({ name, method, compSize, localOff });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

function readEntry(buf, entry) {
  const h = entry.localOff;
  if (buf.readUInt32LE(h) !== 0x04034b50) throw new Error('Bad local header');
  const nameLen = buf.readUInt16LE(h + 26);
  const extraLen = buf.readUInt16LE(h + 28);
  const start = h + 30 + nameLen + extraLen;
  const raw = buf.slice(start, start + entry.compSize);
  return entry.method === 0 ? raw : zlib.inflateRawSync(raw);
}

/* XML to readable text: paragraph and line breaks become newlines. */
function xmlToText(xml) {
  return xml
    .replace(/<\/w:p>|<\/a:p>/g, '\n')
    .replace(/<w:br[^>]*\/>|<a:br[^>]*\/>/g, '\n')
    .replace(/<w:tab[^>]*\/>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

const WANTED = /^(word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml|ppt\/(slides\/slide\d+|notesSlides\/notesSlide\d+)\.xml)$/;

/* Returns the visible text of a .docx or .pptx buffer. */
function officeText(buf) {
  const entries = zipEntries(buf).filter(e => WANTED.test(e.name));
  /* document first, then the rest in a stable order */
  entries.sort((a, b) => {
    const rank = n => (n === 'word/document.xml' ? 0 : 1);
    if (rank(a.name) !== rank(b.name)) return rank(a.name) - rank(b.name);
    return a.name.localeCompare(b.name, 'en', { numeric: true });
  });
  return entries.map(e => xmlToText(readEntry(buf, e).toString('utf8'))).join('\n');
}

module.exports = { officeText, zipEntries };
