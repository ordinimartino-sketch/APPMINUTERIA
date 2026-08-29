// Analisi a SOLA LETTURA (non scrive nel DB): estrae tutte le "Linea" distinte da uno o
// più file CSV fornitore, per poterle rivedere e unificare PRIMA di importare i prodotti.
// Uso:  node db/analizza_categorie.js file1.csv [file2.csv ...]
const fs = require('fs');
const path = require('path');

function parseCsv(content, delimitatore = ';') {
  const righe = [];
  let riga = [];
  let campo = '';
  let inVirgolette = false;
  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    if (inVirgolette) {
      if (c === '"') {
        if (content[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          inVirgolette = false;
        }
      } else {
        campo += c;
      }
    } else if (c === '"') {
      inVirgolette = true;
    } else if (c === delimitatore) {
      riga.push(campo);
      campo = '';
    } else if (c === '\r') {
      // ignorato, gestito da \n
    } else if (c === '\n') {
      riga.push(campo);
      righe.push(riga);
      riga = [];
      campo = '';
    } else {
      campo += c;
    }
  }
  if (campo.length || riga.length) {
    riga.push(campo);
    righe.push(riga);
  }
  return righe.filter((r) => !(r.length === 1 && r[0].trim() === ''));
}

function slugify(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function pulisciCategoria(s) {
  if (!s) return '';
  return String(s).replace(/^\s*\d+\s+/, '').trim();
}

function normalizzaIntestazione(h) {
  return String(h).toLowerCase().replace(/[^a-z0-9]/g, '');
}

const file = process.argv.slice(2);
if (!file.length) {
  console.error('Uso: node db/analizza_categorie.js file1.csv [file2.csv ...]');
  process.exit(1);
}

// slug -> { nome, conteggio, prodotti, file: Set }
const categorie = new Map();

for (const f of file) {
  const filePath = path.resolve(f);
  const nomeFile = path.basename(filePath, path.extname(filePath));
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^﻿/, '');
  const righe = parseCsv(raw);
  if (!righe.length) continue;

  const intestazione = righe[0];
  const idx = {};
  intestazione.forEach((h, i) => {
    idx[normalizzaIntestazione(h)] = i;
  });
  if (!('linea' in idx) || !('codice' in idx)) {
    console.error(`${nomeFile}: manca la colonna "linea" o "codice", file saltato`);
    continue;
  }

  for (let r = 1; r < righe.length; r++) {
    const riga = righe[r];
    if (!riga || riga.every((c) => c.trim() === '')) continue;
    const codice = (riga[idx.codice] || '').trim();
    if (!codice) continue;

    const nomeLinea = pulisciCategoria(riga[idx.linea]) || 'Altro';
    const slug = slugify(nomeLinea) || 'altro';

    if (!categorie.has(slug)) {
      categorie.set(slug, { nome: nomeLinea, conteggio: 0, file: new Set() });
    }
    const voce = categorie.get(slug);
    voce.conteggio += 1;
    voce.file.add(nomeFile);
  }
}

const elenco = [...categorie.entries()].sort((a, b) => a[1].nome.localeCompare(b[1].nome));

console.log(`\n${elenco.length} categorie distinte (da "Linea") su ${file.length} file:\n`);
for (const [slug, v] of elenco) {
  const marchi = [...v.file].sort().join(', ');
  console.log(`  ${String(v.conteggio).padStart(5)}  ${v.nome}  [${slug}]  —  ${marchi}`);
}

// Segnala possibili quasi-duplicati: stesso slug radice ignorando plurali/spazi minimi
// non serve euristica complessa qui: lo slug già unifica maiuscole/spazi/accenti identici.
// Qui evidenziamo solo nomi molto simili (stesso slug a meno di un carattere finale 's').
console.log('\nPossibili quasi-duplicati da controllare a mano:');
let trovati = 0;
for (const [slugA, vA] of elenco) {
  for (const [slugB, vB] of elenco) {
    if (slugA >= slugB) continue;
    if (slugA.replace(/-?s$/, '') === slugB.replace(/-?s$/, '')) {
      console.log(`  "${vA.nome}" [${slugA}]  <->  "${vB.nome}" [${slugB}]`);
      trovati += 1;
    }
  }
}
if (!trovati) console.log('  nessuno trovato con l\'euristica automatica.');
