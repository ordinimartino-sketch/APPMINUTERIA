// Seed dati demo: utenti e distributori (serve per poter fare login e testare il flusso).
// Il catalogo prodotti NON è più qui: si carica con `node db/importa_catalogo.js file.csv`
// (vedi quello script). Lo script è idempotente: si può rilanciare senza duplicare nulla.
const bcrypt = require('bcryptjs');
const db = require('./index');

const ZONA = 'Genova';

// ATTENZIONE: partite IVA, codici fiscali e indirizzi qui sotto sono valori di comodo per la
// demo, non dati reali delle aziende citate. Vanno sostituiti con le anagrafiche vere prima
// di emettere qualsiasi documento fiscale.
function upsertUser(u) {
  const dati = {
    distributor_id: null,
    zona: ZONA,
    email: '',
    telefono: '',
    partita_iva: '',
    codice_fiscale: '',
    indirizzo: '',
    cap: '',
    citta: '',
    provincia: '',
    sdi_pec: '',
    indirizzo_consegna: '',
    referente: '',
    ...u,
    password_hash: bcrypt.hashSync(u.password, 10),
  };
  delete dati.password;
  db.prepare(
    `INSERT INTO users (ruolo, username, password_hash, ragione_sociale, email, telefono,
                        distributor_id, zona, partita_iva, codice_fiscale, indirizzo, cap,
                        citta, provincia, sdi_pec, indirizzo_consegna, referente)
     VALUES (@ruolo, @username, @password_hash, @ragione_sociale, @email, @telefono,
             @distributor_id, @zona, @partita_iva, @codice_fiscale, @indirizzo, @cap,
             @citta, @provincia, @sdi_pec, @indirizzo_consegna, @referente)
     ON CONFLICT(username) DO UPDATE SET
       ruolo = excluded.ruolo,
       password_hash = excluded.password_hash,
       ragione_sociale = excluded.ragione_sociale,
       email = excluded.email,
       telefono = excluded.telefono,
       distributor_id = excluded.distributor_id,
       zona = excluded.zona,
       partita_iva = excluded.partita_iva,
       codice_fiscale = excluded.codice_fiscale,
       indirizzo = excluded.indirizzo,
       cap = excluded.cap,
       citta = excluded.citta,
       provincia = excluded.provincia,
       sdi_pec = excluded.sdi_pec,
       indirizzo_consegna = excluded.indirizzo_consegna,
       referente = excluded.referente`
  ).run(dati);
}

function upsertDistributor(d) {
  db.prepare(
    `INSERT INTO distributors (nome, filiale, zona, consegna_ore_default, costo_consegna, attivo,
                               ragione_sociale, partita_iva, indirizzo, cap, citta, provincia,
                               telefono, email)
     VALUES (@nome, @filiale, @zona, @consegna_ore_default, @costo_consegna, 1,
             @ragione_sociale, @partita_iva, @indirizzo, @cap, @citta, @provincia,
             @telefono, @email)
     ON CONFLICT(nome) DO UPDATE SET
       filiale = excluded.filiale,
       zona = excluded.zona,
       consegna_ore_default = excluded.consegna_ore_default,
       costo_consegna = excluded.costo_consegna,
       attivo = 1,
       ragione_sociale = excluded.ragione_sociale,
       partita_iva = excluded.partita_iva,
       indirizzo = excluded.indirizzo,
       cap = excluded.cap,
       citta = excluded.citta,
       provincia = excluded.provincia,
       telefono = excluded.telefono,
       email = excluded.email`
  ).run(d);
  return db.prepare('SELECT * FROM distributors WHERE nome = ?').get(d.nome);
}

// ---------- Distributori ----------

const distributori = [
  {
    nome: 'AFIS SPA', filiale: 'Banco Genova Sampierdarena', zona: ZONA,
    consegna_ore_default: 24, costo_consegna: 12.00,
    ragione_sociale: 'AFIS S.p.A.', partita_iva: '01234567891',
    indirizzo: 'Via Sampierdarena 118', cap: '16149', citta: 'Genova', provincia: 'GE',
    telefono: '010 1112221', email: 'banco.sampierdarena@afis.example',
  },
  {
    nome: 'BOREA SRL', filiale: 'Banco Genova Bolzaneto', zona: ZONA,
    consegna_ore_default: 48, costo_consegna: 0.00,
    ragione_sociale: 'BOREA S.r.l.', partita_iva: '01234567892',
    indirizzo: 'Via Bolzaneto 42', cap: '16162', citta: 'Genova', provincia: 'GE',
    telefono: '010 1112222', email: 'banco.bolzaneto@borea.example',
  },
  {
    nome: 'CAMBIELLI SPA', filiale: 'Banco Genova Marassi', zona: ZONA,
    consegna_ore_default: 6, costo_consegna: 15.00,
    ragione_sociale: 'CAMBIELLI S.p.A.', partita_iva: '01234567893',
    indirizzo: 'Corso Marassi 7', cap: '16141', citta: 'Genova', provincia: 'GE',
    telefono: '010 1112223', email: 'banco.marassi@cambielli.example',
  },
];

// ---------- Esecuzione ----------

const distributoriSalvati = distributori.map(upsertDistributor);

const utenti = [
  {
    ruolo: 'agente', username: 'agente', password: 'agente123',
    ragione_sociale: 'Grossista Demo — Agente', email: 'agente@example.com',
  },
  {
    ruolo: 'cliente', username: 'rossi', password: 'cliente123',
    ragione_sociale: 'Rossi Impianti S.r.l.', referente: 'Marco Rossi',
    email: 'rossi@example.com', telefono: '333 0000001',
    partita_iva: '02345678911', codice_fiscale: '02345678911',
    indirizzo: 'Via Tortona 3', cap: '16139', citta: 'Genova', provincia: 'GE',
    sdi_pec: 'M5UXCR1', indirizzo_consegna: 'Cantiere Via Tortona 3, 16139 Genova (GE)',
  },
  {
    ruolo: 'cliente', username: 'bianchi', password: 'cliente123',
    ragione_sociale: 'Idraulica Bianchi S.n.c.', referente: 'Luca Bianchi',
    email: 'bianchi@example.com', telefono: '333 0000002',
    partita_iva: '02345678912', codice_fiscale: '02345678912',
    indirizzo: 'Via Canevari 55', cap: '16137', citta: 'Genova', provincia: 'GE',
    sdi_pec: 'idraulicabianchi@pec.example', indirizzo_consegna: 'Via Canevari 55, 16137 Genova (GE)',
  },
  {
    ruolo: 'cliente', username: 'verdi', password: 'cliente123',
    ragione_sociale: 'Termoidraulica Verdi S.r.l.', referente: 'Anna Verdi',
    email: 'verdi@example.com', telefono: '333 0000003',
    partita_iva: '02345678913', codice_fiscale: '02345678913',
    indirizzo: 'Via Struppa 210', cap: '16165', citta: 'Genova', provincia: 'GE',
    sdi_pec: 'KRRH6B9', indirizzo_consegna: 'Magazzino Via Struppa 210, 16165 Genova (GE)',
  },
];

// Un profilo operatore per ogni banco distributore. I due richiesti — AFIS e CAMBIELLI —
// hanno anche il referente di banco compilato.
const REFERENTI_BANCO = {
  'AFIS SPA': 'Banco AFIS — Sampierdarena',
  'CAMBIELLI SPA': 'Banco CAMBIELLI — Marassi',
  'BOREA SRL': 'Banco BOREA — Bolzaneto',
};

distributoriSalvati.forEach((d) => {
  const username = d.nome.split(' ')[0].toLowerCase();
  utenti.push({
    ruolo: 'distributore',
    username,
    password: 'banco123',
    ragione_sociale: d.ragione_sociale || d.nome,
    referente: REFERENTI_BANCO[d.nome] || d.filiale,
    email: d.email,
    telefono: d.telefono,
    distributor_id: d.id,
    partita_iva: d.partita_iva,
    indirizzo: d.indirizzo,
    cap: d.cap,
    citta: d.citta,
    provincia: d.provincia,
  });
});

utenti.forEach(upsertUser);

console.log('Seed completato:');
console.log(`  ${distributoriSalvati.length} distributori`);
console.log(`  ${utenti.length} utenti (1 agente, 3 clienti, ${distributoriSalvati.length} banchi distributore)`);
console.log('  Catalogo prodotti: usa `node db/importa_catalogo.js file.csv` per caricarlo.');
