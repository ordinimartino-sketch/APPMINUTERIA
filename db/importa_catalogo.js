// Importa il catalogo prodotti da file CSV fornitore (es. export EFFEBI).
// Uso:  node db/importa_catalogo.js file1.csv [file2.csv ...]
//
// Formato atteso: CSV con delimitatore ";", intestazione nella prima riga, che contenga
// almeno le colonne Codice, Descrizione, Linea, Serie, U.M., Netto (case-insensitive,
// l'ordine delle colonne non conta). "Marca" viene salvata se presente (facoltativa).
// Le altre colonne (Sigla, Cod. Fornitore, Vecchio Codice, Sc1..Sc4, Listino) vengono
// lette ma scartate.
//
// - "Linea" viene mappata su una super categoria (poche, per la home) tramite
//   db/mappa_super_categorie.csv — generato da db/genera_mappa_super_categorie.js e
//   rivisto a mano. Se una Linea non è nella mappa, va a finire in "Generico".
// - "Serie" diventa la sottocategoria del prodotto (mostrata dentro la super categoria).
// - "Marca" è salvata per riferimento interno ma NON mostrata nella ricerca/scheda
//   prodotto lato cliente (src/catalogo.js e le view non la leggono).
// - "Netto" è il prezzo base del prodotto: ogni distributore applica poi il proprio
//   sconto in distributor_products, come per il resto dell'app.
// - Lo script è idempotente: rilanciato con lo stesso codice aggiorna la riga esistente
//   invece di duplicarla. La disponibilità non viene toccata sui riaggiornamenti (non è
//   nel CSV): se l'hai cambiata a mano in "in_esaurimento" resta tale.
const fs = require('fs');
const path = require('path');
const db = require('./index');

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

function numeroItaliano(s) {
  if (s == null) return 0;
  let t = String(s).trim();
  if (!t) return 0;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

function slugify(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// "070 Valvole Industriali" -> "Valvole Industriali"
function pulisciCategoria(s) {
  if (!s) return '';
  return String(s).replace(/^\s*\d+\s+/, '').trim();
}

function normalizzaIntestazione(h) {
  return String(h).toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Icone/ordine per le super categorie note (db/mappa_super_categorie.csv). Una Linea non
// mappata finisce in "Generico" con l'icona di default.
const SUPER_CATEGORIE = [
  { nome: 'Riscaldamento e Caldaie', icona: '🔥', ordine: 1 },
  { nome: 'Raccorderia e Valvole', icona: '🔧', ordine: 2 },
  { nome: 'Tubazioni e Sistemi di Distribuzione', icona: '🚰', ordine: 3 },
  { nome: 'Bagno e Sanitari', icona: '🚿', ordine: 4 },
  { nome: 'Condizionamento e Climatizzazione', icona: '❄️', ordine: 5 },
  { nome: 'Ricambi e Accessori', icona: '⚙️', ordine: 6 },
  { nome: 'Ventilazione e Trattamento Aria', icona: '🌬️', ordine: 7 },
  { nome: 'Fissaggi e Utensili', icona: '🛠️', ordine: 8 },
  { nome: 'Scarico e Fognatura', icona: '🕳️', ordine: 9 },
  { nome: 'Trattamento Acqua', icona: '💧', ordine: 10 },
  { nome: 'Acqua Calda Sanitaria', icona: '🚿', ordine: 11 },
  { nome: 'Elettrico e Fotovoltaico', icona: '⚡', ordine: 12 },
  { nome: 'Generico', icona: '📦', ordine: 99 },
];
const ICONA_PER_SUPER = new Map(SUPER_CATEGORIE.map((s) => [s.nome, s]));

// Carica db/mappa_super_categorie.csv (linea_slug;nome_linea;conteggio;marchi;super_categoria)
// generato da genera_mappa_super_categorie.js e rivisto a mano.
function caricaMappaSuperCategorie() {
  const mappaPath = path.join(__dirname, 'mappa_super_categorie.csv');
  const mappa = new Map();
  if (!fs.existsSync(mappaPath)) return mappa;
  const righe = parseCsv(fs.readFileSync(mappaPath, 'utf8').replace(/^﻿/, ''));
  for (let i = 1; i < righe.length; i++) {
    const [slug, , , , superCategoria] = righe[i];
    if (slug && superCategoria) mappa.set(slug, superCategoria.trim());
  }
  return mappa;
}
const MAPPA_SUPER = caricaMappaSuperCategorie();

const upsertMacro = db.prepare(
  `INSERT INTO macro_categorie (slug, nome, icona, descrizione, ordine)
   VALUES (@slug, @nome, @icona, '', @ordine)
   ON CONFLICT(slug) DO UPDATE SET nome = excluded.nome, icona = excluded.icona, ordine = excluded.ordine`
);

const upsertProdotto = db.prepare(
  `INSERT INTO products (codice, nome, categoria, serie, macro_slug, unita_misura, marca, prezzo_listino, disponibilita)
   VALUES (@codice, @nome, @categoria, @serie, @macro_slug, @unita_misura, @marca, @prezzo_listino, 'disponibile')
   ON CONFLICT(codice) DO UPDATE SET
     nome = excluded.nome,
     categoria = excluded.categoria,
     serie = excluded.serie,
     macro_slug = excluded.macro_slug,
     unita_misura = excluded.unita_misura,
     marca = excluded.marca,
     prezzo_listino = excluded.prezzo_listino,
     aggiornato_il = datetime('now')`
);

const COLONNE_RICHIESTE = ['codice', 'descrizione', 'linea', 'serie', 'um', 'netto'];

function importaFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^﻿/, '');
  const righe = parseCsv(raw);
  if (!righe.length) return { prodotti: 0, categorie: new Set() };

  const intestazione = righe[0];
  const idx = {};
  intestazione.forEach((h, i) => {
    idx[normalizzaIntestazione(h)] = i;
  });
  for (const chiave of COLONNE_RICHIESTE) {
    if (!(chiave in idx)) {
      throw new Error(`${path.basename(filePath)}: manca la colonna "${chiave}" nell'intestazione`);
    }
  }

  const categorieViste = new Set();
  const nonMappate = new Set();
  let count = 0;

  const importaRighe = db.transaction(() => {
    for (let r = 1; r < righe.length; r++) {
      const riga = righe[r];
      if (!riga || riga.every((c) => c.trim() === '')) continue;

      const codice = (riga[idx.codice] || '').trim();
      if (!codice) continue;

      const nome = (riga[idx.descrizione] || '').trim();
      const nomeLinea = pulisciCategoria(riga[idx.linea]) || 'Altro';
      const slugLinea = slugify(nomeLinea) || 'altro';
      const nomeSerie = pulisciCategoria(riga[idx.serie]);
      const unitaMisura = (riga[idx.um] || '').trim();
      const marca = idx.marca != null ? (riga[idx.marca] || '').trim() : '';
      const prezzoNetto = numeroItaliano(riga[idx.netto]);

      let nomeSuper = MAPPA_SUPER.get(slugLinea);
      if (!nomeSuper) {
        nomeSuper = 'Generico';
        nonMappate.add(nomeLinea);
      }
      const slugSuper = slugify(nomeSuper) || 'generico';
      const meta = ICONA_PER_SUPER.get(nomeSuper) || { icona: '📦', ordine: 50 };

      upsertMacro.run({ slug: slugSuper, nome: nomeSuper, icona: meta.icona, ordine: meta.ordine });
      categorieViste.add(nomeSuper);

      upsertProdotto.run({
        codice,
        nome,
        categoria: nomeLinea,
        serie: nomeSerie,
        macro_slug: slugSuper,
        unita_misura: unitaMisura,
        marca,
        prezzo_listino: prezzoNetto,
      });
      count += 1;
    }
  });
  importaRighe();

  if (nonMappate.size) {
    console.warn(
      `  ⚠ ${nonMappate.size} Linea non presenti in mappa_super_categorie.csv, finite in "Generico": ${[...nonMappate].join(', ')}`
    );
  }

  return { prodotti: count, categorie: categorieViste };
}

const file = process.argv.slice(2);
if (!file.length) {
  console.error('Uso: node db/importa_catalogo.js file1.csv [file2.csv ...]');
  process.exit(1);
}

let totaleProdotti = 0;
const categorieTotali = new Set();
for (const f of file) {
  const filePath = path.resolve(f);
  const { prodotti, categorie } = importaFile(filePath);
  totaleProdotti += prodotti;
  categorie.forEach((c) => categorieTotali.add(c));
  console.log(`${path.basename(filePath)}: ${prodotti} prodotti, ${categorie.size} categorie`);
}
console.log(`Totale: ${totaleProdotti} prodotti importati, ${categorieTotali.size} categorie distinte in questo import.`);
