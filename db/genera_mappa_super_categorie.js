// SOLA LETTURA: genera una proposta di mappatura "Linea" -> super categoria (poche tessere
// per la home) a partire dalle Linee reali trovate nei CSV, con regole a parole chiave.
// Scrive un CSV modificabile a mano: db/mappa_super_categorie.csv
// Uso:  node db/genera_mappa_super_categorie.js file1.csv [file2.csv ...]
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
        if (content[i + 1] === '"') { campo += '"'; i++; } else { inVirgolette = false; }
      } else { campo += c; }
    } else if (c === '"') {
      inVirgolette = true;
    } else if (c === delimitatore) {
      riga.push(campo); campo = '';
    } else if (c === '\r') {
      // ignorato
    } else if (c === '\n') {
      riga.push(campo); righe.push(riga); riga = []; campo = '';
    } else { campo += c; }
  }
  if (campo.length || riga.length) { riga.push(campo); righe.push(riga); }
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

// Regole a parole chiave, in ordine di priorità (la prima che matcha vince).
const REGOLE = [
  { super: 'Generico', re: /^(generico|generica|altro)$/i },
  { super: 'Condizionamento e Climatizzazione', re: /condizion|climatizz|\bvrf\b|multi ?v|\bsplit\b|pompe? calore|pompe? di calore|commerciale r32|eden|estia|revive/i },
  { super: 'Riscaldamento e Caldaie', re: /caldai|riscaldament|termoregolazione|radiator|collettor.*distribuz|comfort climatico|sistemi di calore|fumisteria|scarico fumi|coassial|monop.*legna.*pellet|bilanciamento idr|climatizzaz.*radiante|sist\.?climatiz.*radiante/i },
  { super: 'Acqua Calda Sanitaria', re: /scaldacqua|bollitor|acqua calda sanitaria/i },
  { super: 'Tubazioni e Sistemi di Distribuzione', re: /tubazion|mapress|megapress|profipress|sanpress|prestabo|raxofix|smartpress|temponox|^pe$|pp-ht|distribuzione (acqua|sanitaria|central|radiator)|sistem[ia] di adduzione|sistemi adduzione|hep2o|indoor climate|tubi di distribuzione|distribuzione per impianti|doppia parete|monoparete|cool ?fit/i },
  { super: 'Scarico e Fognatura', re: /scaric|sifon|fognatur|drenaggio|sistema di sciaquo/i },
  { super: 'Bagno e Sanitari', re: /rubinetter|doccia|bagno|\bwc\b| wc |cassett.*risciacquo|placche|orinatoi|bidet|lavabi|arredo bagno|shower|ceramiche|piastre di azionamento|moduli di installazione|comandi per orinatoi|duofix|combifix|sistemi di pannelli radianti/i },
  { super: 'Fissaggi e Utensili', re: /fissagg|ancorant|tassell|adesiv|punte.*inserti|viti.*staffe|loctite|attrezz|nastri|spray|solar ?- ?fix/i },
  { super: 'Trattamento Acqua', re: /trattamento.*acqua|idrocosmotek|addolciment|filtrazione|dosaggio|disincrostant|contabilizzazion|contab\./i },
  { super: 'Ventilazione e Trattamento Aria', re: /\bvmc\b|trattamento aria|ventilconvettori|fan ?coil|apply ?air|apply\.co|smart clima|toolsplit|project wind|fv power|showgas|galaxy/i },
  { super: 'Elettrico e Fotovoltaico', re: /elettric|fotovoltaico|smart d home/i },
  { super: 'Ricambi e Accessori', re: /ricambi|accessori/i },
  { super: 'Raccorderia e Valvole', re: /valvol|raccord|rubinetti a squadra|rubinetti sfera|raccorderia/i },
];

// Nomi di linea "commerciali" (marchi propri del fornitore) che nessuna parola chiave
// generica può riconoscere: qui uso conoscenza di dominio sul catalogo idrotermosanitario.
// Chiave = nome linea ripulito (case-insensitive). Va rivista dall'utente.
const OVERRIDE = {
  'residenziale': 'Condizionamento e Climatizzazione',
  'residenziale monosplit': 'Condizionamento e Climatizzazione',
  'residenziale multisplit': 'Condizionamento e Climatizzazione',
  'light commercial': 'Condizionamento e Climatizzazione',
  'componenti centr.term/distribuz.a zone': 'Riscaldamento e Caldaie',
  'icon': 'Bagno e Sanitari',
  'one': 'Bagno e Sanitari',
  'acanto': 'Bagno e Sanitari',
  'smyle': 'Bagno e Sanitari',
  'monolith': 'Bagno e Sanitari',
  'variform': 'Bagno e Sanitari',
  'selnova classic': 'Bagno e Sanitari',
  'selnova premium collection': 'Bagno e Sanitari',
  'citterio': 'Bagno e Sanitari',
  'fantasia': 'Bagno e Sanitari',
  'bambini': 'Bagno e Sanitari',
  'colibrì': 'Bagno e Sanitari',
  'xeno²': 'Bagno e Sanitari',
  'aquaclean': 'Bagno e Sanitari',
  'option': 'Bagno e Sanitari',
  'pubblica': 'Bagno e Sanitari',
  'corpi incasso': 'Bagno e Sanitari',
  'allacciamenti apparecchi': 'Bagno e Sanitari',
  'hidrobox': 'Bagno e Sanitari',
  'sistemi sanitari': 'Bagno e Sanitari',
  'sistemi risciacquo': 'Bagno e Sanitari',
  'docce': 'Bagno e Sanitari',
  'spa': 'Bagno e Sanitari',
  'silent-pp': 'Scarico e Fognatura',
  'silent-pro': 'Scarico e Fognatura',
  'silent-db20': 'Scarico e Fognatura',
  'quickstream': 'Scarico e Fognatura',
  'stazione di sollevamento': 'Scarico e Fognatura',
  'flowfit': 'Tubazioni e Sistemi di Distribuzione',
  'mepla': 'Tubazioni e Sistemi di Distribuzione',
  'volex': 'Tubazioni e Sistemi di Distribuzione',
  'pushfit': 'Tubazioni e Sistemi di Distribuzione',
  'strutture idrauliche': 'Tubazioni e Sistemi di Distribuzione',
  'fonterra': 'Tubazioni e Sistemi di Distribuzione',
  'easytop': 'Tubazioni e Sistemi di Distribuzione',
  'acqua': 'Tubazioni e Sistemi di Distribuzione',
  'sistemi gas': 'Raccorderia e Valvole',
  'riduzione della pressione': 'Raccorderia e Valvole',
  'allacciamenti acqua/gas': 'Raccorderia e Valvole',
  'idrotermosanitario': 'Raccorderia e Valvole',
  'idrotermosanitaria': 'Raccorderia e Valvole',
  'applicazioni industriale inox': 'Raccorderia e Valvole',
  'sanitherm ng': 'Riscaldamento e Caldaie',
  'componenti di controllo e sicurezza': 'Riscaldamento e Caldaie',
  'moduli utenza': 'Riscaldamento e Caldaie',
  'satelliti utenza': 'Riscaldamento e Caldaie',
  'efficientamento energetico': 'Riscaldamento e Caldaie',
  'sistemi radianti': 'Riscaldamento e Caldaie',
  'isolamento': 'Riscaldamento e Caldaie',
  'termostatici': 'Riscaldamento e Caldaie',
  'combustibili': 'Riscaldamento e Caldaie',
  'alta potenza': 'Riscaldamento e Caldaie',
  'sistemi ibridi': 'Riscaldamento e Caldaie',
  'solare termico': 'Riscaldamento e Caldaie',
  'attraversamento tetto': 'Riscaldamento e Caldaie',
  'collettori sanitari componibili': 'Riscaldamento e Caldaie',
  'anticorrosione': 'Trattamento Acqua',
  'fernox': 'Trattamento Acqua',
  "sistema per l'igiene dell'acqua potabile": 'Trattamento Acqua',
  'tenuta': 'Fissaggi e Utensili',
  'samontec': 'Fissaggi e Utensili',
  'schiume e sigillanti': 'Fissaggi e Utensili',
  'service': 'Ricambi e Accessori',
  'more': 'Ricambi e Accessori',
  'prodotti tecnici': 'Ricambi e Accessori',
  'utility': 'Ricambi e Accessori',
  'varie': 'Ricambi e Accessori',
  'articoli fuori listino pdf': 'Generico',

  // Correzioni dopo revisione manuale (parole chiave che avevano ingannato le regole).
  "contab.diretta energia/consumi idrici": 'Riscaldamento e Caldaie',
  'contabilizzazione diretta': 'Riscaldamento e Caldaie',
  'contabilizzazione indiretta': 'Riscaldamento e Caldaie',
  'valv/componenti x rad/contab.indiretta': 'Riscaldamento e Caldaie',
  'idrocosmotek condizionamento chimico': 'Trattamento Acqua',
  'fv power': 'Elettrico e Fotovoltaico',
  'valvole motorizzate elettriche': 'Raccorderia e Valvole',
  'valvole a sfera di ritegno e accessori': 'Raccorderia e Valvole',
  'sistemi di pannelli radianti': 'Riscaldamento e Caldaie',
  'sistemi di climatizzazione radiante': 'Riscaldamento e Caldaie',
  'pp-ht': 'Scarico e Fognatura',
  'doppia parete coiben. lana minerale inox': 'Riscaldamento e Caldaie',
  'doppia parete coibentato aria inox': 'Riscaldamento e Caldaie',
  'doppia parete coibentato aria plastica': 'Riscaldamento e Caldaie',
  'monoparete rigido e flessibile inox': 'Riscaldamento e Caldaie',
  'monoparete rigido e flessibile plastica': 'Riscaldamento e Caldaie',
  'applicazioni industriale inox': 'Riscaldamento e Caldaie',
};

// "Commerciale" da solo è ambiguo: per Daikin/Toshiba è condizionamento, per Ferrari è
// riscaldamento — qui decido guardando quali marchi hanno quella linea.
function overrideCommerciale(marchi) {
  const set = new Set(marchi);
  if (set.has('Daikin') || set.has('Toshiba') || set.has('Haier')) return 'Condizionamento e Climatizzazione';
  return 'Riscaldamento e Caldaie';
}

function classifica(nomeLinea, marchi) {
  const chiave = nomeLinea.toLowerCase();
  if (chiave === 'commerciale') return overrideCommerciale(marchi);
  if (chiave in OVERRIDE) return OVERRIDE[chiave];
  for (const r of REGOLE) {
    if (r.re.test(nomeLinea)) return r.super;
  }
  return 'Da Classificare';
}

const file = process.argv.slice(2);
if (!file.length) {
  console.error('Uso: node db/genera_mappa_super_categorie.js file1.csv [file2.csv ...]');
  process.exit(1);
}

const linee = new Map(); // slug -> { nome, conteggio, file:Set }

for (const f of file) {
  const filePath = path.resolve(f);
  const nomeFile = path.basename(filePath, path.extname(filePath));
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^﻿/, '');
  const righe = parseCsv(raw);
  if (!righe.length) continue;
  const intestazione = righe[0];
  const idx = {};
  intestazione.forEach((h, i) => { idx[normalizzaIntestazione(h)] = i; });
  if (!('linea' in idx) || !('codice' in idx)) continue;

  for (let r = 1; r < righe.length; r++) {
    const riga = righe[r];
    if (!riga || riga.every((c) => c.trim() === '')) continue;
    const codice = (riga[idx.codice] || '').trim();
    if (!codice) continue;
    const nomeLinea = pulisciCategoria(riga[idx.linea]) || 'Altro';
    const slug = slugify(nomeLinea) || 'altro';
    if (!linee.has(slug)) linee.set(slug, { nome: nomeLinea, conteggio: 0, file: new Set() });
    const v = linee.get(slug);
    v.conteggio += 1;
    v.file.add(nomeFile);
  }
}

const righeOut = ['linea_slug;nome_linea;conteggio;marchi;super_categoria'];
const perSuper = new Map();
for (const [slug, v] of [...linee.entries()].sort((a, b) => a[1].nome.localeCompare(b[1].nome))) {
  const super_ = classifica(v.nome, [...v.file]);
  righeOut.push(`${slug};${v.nome};${v.conteggio};${[...v.file].sort().join(',')};${super_}`);
  perSuper.set(super_, (perSuper.get(super_) || 0) + v.conteggio);
}

const outPath = path.join(__dirname, 'mappa_super_categorie.csv');
fs.writeFileSync(outPath, righeOut.join('\n') + '\n', 'utf8');

console.log(`Scritto ${outPath} (${linee.size} linee).\n`);
console.log('Prodotti per super categoria proposta:');
for (const [s, n] of [...perSuper.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(5)}  ${s}`);
}
