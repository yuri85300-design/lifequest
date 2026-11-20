// ============================================================================
//  MOTEUR DE JEU — simulateur non officiel du Cyberpunk TCG
//  Moteur asynchrone : chaque décision passe par un "decider" (humain ou IA).
// ============================================================================
'use strict';

const DICE_ORDER = [4, 6, 8, 10, 12, 20];
const CARDS = {};            // rempli par cards.js
const TAG_FR = {};           // traductions éventuelles

class GameOver extends Error {
  constructor(winner, reason) { super('GameOver'); this.winner = winner; this.reason = reason; }
}

// ---------------------------------------------------------------- RNG ------
function rngNext(s) {
  // mulberry32, état stocké dans s.seed (copiable)
  s.seed = (s.seed + 0x6D2B79F5) | 0;
  let t = s.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ------------------------------------------------------------- Helpers -----
const clamp0 = v => (v < 0 ? 0 : v);
const scVal = v => (v === null || v === undefined ? -1 : v); // Null < 0

function makePlayer(name) {
  return {
    name, deck: [], hand: [], trash: [], removed: [], eddies: [], legends: [], field: [],
    gigs: [], fixer: DICE_ORDER.slice(), soldThisTurn: false, calledThisTurn: false,
    tf: {},          // drapeaux "ce tour-ci"
    pf: {},          // drapeaux persistants
    mulliganed: false, turnsTaken: 0, prules: [],
  };
}

class Game {
  constructor(state, deciders, hooks = {}) {
    this.s = state;
    this.deciders = deciders;         // [decider0, decider1]
    this.hooks = hooks;               // { log(msg), ui(evt, data), sim: bool }
    this._pendingEffects = [];
    this._effectSerial = 0;
    this._timingDepth = 0;
    this._resolvingEffects = false;
  }

  // ---------------------------------------------------------- création ----
  static create(decks, deciders, opts = {}) {
    const s = {
      seed: (opts.seed ?? Math.floor(Math.random() * 2 ** 31)) | 0,
      uid: 1, turn: 0, active: 0, first: 0, overtime: false, emptyStreak: 0, firstArasakaDefeatTurn: null,
      players: [makePlayer(opts.names?.[0] || 'Joueur'), makePlayer(opts.names?.[1] || 'IA')],
      winner: null, winReason: '', attack: null, log: [], phase: 'setup', firstTurnDone: [false, false],
      sims: 0,
    };
    const g = new Game(s, deciders, opts.hooks || {});
    decks.forEach((deck, i) => {
      const p = s.players[i];
      p.deck = deck.main.map(id => g.newInst(id, i));
      p.legends = deck.legends.map(id => { const c = g.newInst(id, i); c.faceUp = false; c.ready = true; return c; });
      p.ramLimit = deck.ramLimit || null;
    });
    return g;
  }

  newInst(id, owner) {
    if (!CARDS[id]) throw new Error('Carte inconnue : ' + id);
    return { uid: this.s.uid++, id, owner, ready: true, lag: false, gear: [], mods: [], grants: [], flags: {}, faceUp: true };
  }

  clone(deciders, hooks) {
    const log = this.s.log; this.s.log = [];
    let st; try { st = structuredClone(this.s); } finally { this.s.log = log; }
    return new Game(st, deciders, hooks || { sim: true });
  }

  // ------------------------------------------------------------ outils ----
  rand() { return rngNext(this.s); }
  randInt(n) { return Math.floor(this.rand() * n); }
  shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = this.randInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  P(i) { return this.s.players[i]; }
  opp(i) { return 1 - i; }
  def(inst) { return CARDS[inst.id]; }
  log(msg, cls) {
    if (this.hooks.sim) return;
    this.s.log.push({ t: this.s.turn, msg, cls });
    if (this.s.log.length > 400) this.s.log.shift();
    this.hooks.log && this.hooks.log(msg, cls);
  }
  async ui(evt, data) { if (!this.hooks.sim && this.hooks.ui) await this.hooks.ui(evt, data); }
  name(inst) { const d = this.def(inst); return d.sub ? `${d.name} — ${d.sub}` : d.name; }
  pname(i) { return this.P(i).name; }

  // -------------------------------------------------------- localisation --
  where(uid) {
    for (let i = 0; i < 2; i++) {
      const p = this.P(i);
      for (const z of ['field', 'legends', 'hand', 'deck', 'trash', 'removed']) {
        const k = p[z].findIndex(c => c.uid === uid);
        if (k >= 0) return { p: i, zone: z, idx: k, inst: p[z][k] };
      }
      for (const host of [...p.field, ...p.legends]) {
        const k = host.gear.findIndex(c => c.uid === uid);
        if (k >= 0) return { p: i, zone: 'gear', host, idx: k, inst: host.gear[k] };
      }
    }
    return null;
  }
  byUid(uid) { const w = this.where(uid); return w ? w.inst : null; }
  onField(inst) { const w = this.where(inst.uid); return !!w && w.zone === 'field'; }
  controllerOf(inst) { const w = this.where(inst.uid); return w ? w.p : inst.owner; }

  units(i) { return this.P(i).field; }
  allUnits() { return [...this.P(0).field, ...this.P(1).field]; }
  faceUpLegends(i) { return this.P(i).legends.filter(l => l.faceUp); }
  isLegend(inst) { return this.def(inst).type === 'Legend'; }

  // Sources actives (pour événements & auras) : légendes face visible, unités, équipements
  sources(i) {
    const p = this.P(i), out = [];
    for (const l of p.legends) if (l.faceUp) { out.push({ inst: l, zone: 'legends' }); for (const gr of l.gear) out.push({ inst: gr, zone: 'gear', host: l }); }
    for (const u of p.field) { out.push({ inst: u, zone: 'field' }); for (const gr of u.gear) out.push({ inst: gr, zone: 'gear', host: u }); }
    return out;
  }

  // ------------------------------------------------------- Street Cred ----
  sc(i) { const g = this.P(i).gigs; return g.length ? g.reduce((a, d) => a + d.value, 0) : null; }
  gigCount(i) { return this.P(i).gigs.length; }
  moreSC(i) { return scVal(this.sc(i)) > scVal(this.sc(this.opp(i))); }
  lessSC(i) { return scVal(this.sc(i)) < scVal(this.sc(this.opp(i))); }
  valuePairs(i) {
    const cnt = {}; for (const d of this.P(i).gigs) cnt[d.value] = (cnt[d.value] || 0) + 1;
    return Object.values(cnt).reduce((a, n) => a + Math.floor(n / 2), 0);
  }
  isMinGig(d) { return d.value === 1; }
  isMaxGig(d) { return d.value === d.sides; }

  // ------------------------------------------------------------ Mots-clés --
  hasKw(inst, kw) {
    const d = this.def(inst);
    if (d.kw && d.kw.includes(kw)) return true;
    if (inst.grants.some(g => g.kw === kw)) return true;
    for (const gr of inst.gear) { const gd = this.def(gr); if (gd.hostKw && gd.hostKw.includes(kw)) return true; if (gd.hostKwIf && gd.hostKwIf(this, gr, inst, kw)) return true; }
    // auras qui donnent des mots-clés
    for (let i = 0; i < 2; i++) for (const src of this.sources(i)) {
      const sd = this.def(src.inst);
      if (sd.auraKw && sd.auraKw(this, src.inst, inst, kw, src)) return true;
    }
    return false;
  }

  // -------------------------------------------------------------- Puissance
  basePower(inst) { const d = this.def(inst); return d.power ?? 0; }
  power(inst, ctx = {}) {
    let p = this.basePower(inst);
    for (const gr of inst.gear) {
      const gd = this.def(gr); p += gd.power ?? 0;
      if (gd.hostPower) p += gd.hostPower(this, gr, inst, ctx) || 0;
    }
    for (const m of inst.mods) if (m.power) { if (m.fightOnly && !ctx.fight) continue; if (m.vsRival && !(ctx.vs && this.controllerOf(ctx.vs) !== this.controllerOf(inst))) continue; p += m.power; }
    const d = this.def(inst);
    if (d.selfPower) p += d.selfPower(this, inst, ctx) || 0;
    for (let i = 0; i < 2; i++) for (const src of this.sources(i)) {
      const sd = this.def(src.inst);
      if (sd.aura) p += sd.aura(this, src.inst, inst, ctx, src) || 0;
    }
    return p; // peut être négatif ; utiliser eff() pour comparer
  }
  eff(inst, ctx) { return clamp0(this.power(inst, ctx)); }
  attacking(inst) { return !!(this.s.attack && this.s.attack.attacker === inst.uid); }

  addMod(inst, mod) { inst.mods.push(mod); }
  // durée : 'turn' (fin du tour), 'next' (jusqu'au début du prochain tour du joueur pf), 'perm'
  buff(inst, n, dur = 'turn', pf) { if (!inst) return; inst.mods.push({ power: n, dur, pf: pf ?? this.s.active }); }
  grant(inst, kw, dur = 'turn', pf) { if (!inst) return; inst.grants.push({ kw, dur, pf: pf ?? this.s.active }); }
  flag(inst, f, dur = 'turn', pf) { if (!inst) return; inst.mods.push({ flag: f, dur, pf: pf ?? this.s.active }); }
  hasFlag(inst, f) { return inst.mods.some(m => m.flag === f); }

  // ------------------------------------------------------------- Coûts ----
  costOf(inst, p, mode = 'play') {
    const d = this.def(inst);
    let c = d.cost ?? 0;
    let reduced = false;
    const baseReduction = d.discount ? (d.discount(this, inst, p, mode) || 0) : 0;
    c -= baseReduction; reduced = baseReduction > 0;
    for (const src of this.sources(p)) {
      const sd = this.def(src.inst);
      if (sd.costMod) { const delta = sd.costMod(this, src.inst, inst, p, mode, src) || 0; c += delta; if (delta < 0) reduced = true; }
    }
    for (const src of this.sources(this.opp(p))) {
      const sd = this.def(src.inst);
      if (sd.rivalCostMod) { const delta = sd.rivalCostMod(this, src.inst, inst, p, mode, src) || 0; c += delta; if (delta < 0) reduced = true; }
    }
    if (mode === 'solo' && this.P(p).tf.soloDiscount > 0) { c -= this.P(p).tf.soloDiscount; reduced = true; }
    if (mode === 'play' && d.type === 'Program' && this.P(p).tf.progDiscount) { c -= this.P(p).tf.progDiscount; reduced = true; }
    // CR 11.11.3: cumulative reductions cannot make a played card cost 0.
    // An explicit fixed payment (card text) is distinct from a reduction;
    // the `opt.free` play path bypasses this function entirely.
    if (d.fixedPay) { const f = d.fixedPay(this, inst, p, mode); if (f !== null && f !== undefined) return Math.max(0, f); }
    return Math.max(reduced ? 1 : 0, c);
  }
  // sources de paiement prêtes
  payers(i, exclude = []) {
    const p = this.P(i), out = [];
    for (const e of p.eddies) if (e.ready) out.push({ kind: 'eddie', ref: e, pri: 0 });
    for (const l of p.legends) if (l.ready && !exclude.includes(l.uid)) {
      if (!l.faceUp) out.push({ kind: 'legend', ref: l, pri: 1 });
      else if (this.def(l).sell === true) {
        const hasSpend = (this.def(l).abilities || []).some(a => a.spend);
        out.push({ kind: 'legend', ref: l, pri: hasSpend ? 3 : 2 });
      }
    }
    return out.sort((a, b) => a.pri - b.pri);
  }
  avail(i, exclude) { return this.payers(i, exclude).length; }
  async pay(i, n, exclude = [], preferSelf = null) {
    if (n <= 0) return true;
    let ps = this.payers(i, exclude);
    if (preferSelf) { const k = ps.findIndex(x => x.ref.uid === preferSelf); if (k > 0) ps.unshift(ps.splice(k, 1)[0]); }
    if (ps.length < n) return false;
    for (let k = 0; k < n; k++) { ps[k].ref.ready = false; if (ps[k].kind === 'legend') await this.emit('spent', { inst: ps[k].ref, p: i, forPay: true }); }
    return true;
  }

  // --------------------------------------------------------- Décisions ----
  dec(i) { return this.deciders[i]; }
  // options : [{label, value, card(inst|id), score}] ; renvoie un tableau de values
  async choose(i, req) {
    req.min = req.min ?? 1; req.max = req.max ?? 1;
    if (!req.options.length) return [];
    if (req.options.length <= req.min && req.min === req.max && req.forced !== false && !req.reveal && !req.revealCards) return req.options.map(o => o.value);
    return await this.dec(i).choose(this, i, req);
  }
  async pickOne(i, title, options, opt = {}) {
    if (!options.length) return null;
    const r = await this.choose(i, { title, options, min: opt.optional ? 0 : 1, max: 1, ...opt });
    return r.length ? r[0] : null;
  }
  async pickUnit(i, title, units, scoreFn = () => 1, opt = {}) {
    const options = units.map(u => ({ label: this.name(u), value: u.uid, card: u, score: scoreFn(u) }));
    const uid = await this.pickOne(i, title, options, opt);
    return uid == null ? null : this.byUid(uid);
  }
  // A hidden Legend is chosen by its position. Its identity only appears after
  // resolving the look effect (never in the choice menu or card thumbnails).
  async pickFaceDownLegend(i, title, scoreFn = () => 0) {
    const facedown = this.P(i).legends.filter(l => !l.faceUp);
    const choices = facedown.map((l, k) => ({
      label: `Légende face cachée ${k + 1}`, value: l.uid, score: scoreFn(l)
    }));
    const uid = await this.pickOne(i, title, choices);
    return facedown.find(l => l.uid === uid) || null;
  }
  async pickGig(i, title, gigs, scoreFn = () => 1, opt = {}) {
    const options = gigs.map(d => ({ label: `d${d.sides} : ${d.value}`, value: d.uid, gig: d, score: scoreFn(d) }));
    const uid = await this.pickOne(i, title, options, opt);
    return uid == null ? null : gigs.find(d => d.uid === uid);
  }
  async yesNo(i, title, aiYes = true) {
    const v = await this.pickOne(i, title, [{ label: 'Oui', value: true, score: aiYes ? 1 : 0 }, { label: 'Non', value: false, score: aiYes ? 0 : 1 }]);
    return !!v;
  }
  async pickNumber(i, title, min, max, aiPick) {
    const options = []; for (let n = min; n <= max; n++) options.push({ label: String(n), value: n, score: aiPick ? (n === aiPick ? 1 : 0) : n });
    return await this.pickOne(i, title, options);
  }
  async pickCards(i, title, cards, min, max, scoreFn = () => 1, opt = {}) {
    const options = cards.map(c => ({ label: this.name(c), value: c.uid, card: c, score: scoreFn(c) }));
    const r = await this.choose(i, { title, options, min, max, ...opt });
    return r.map(uid => cards.find(c => c.uid === uid));
  }

  // ------------------------------------------------------------ Pioche ----
  async draw(i, n = 1) {
    const p = this.P(i);
    for (let k = 0; k < n; k++) {
      if (!p.deck.length) throw new GameOver(this.opp(i), `${p.name} doit piocher dans un deck vide.`);
      const c = p.deck.shift(); c.mods = []; c.grants = []; p.hand.push(c);
    }
    if (n > 0) await this.emit('draw', { p: i, n });
  }
  async discard(i, n, title) {
    const p = this.P(i);
    n = Math.min(n, p.hand.length);
    if (n <= 0) return [];
    const cs = await this.pickCards(i, title || `Défaussez ${n} carte(s)`, p.hand, n, n, c => -this.cardValue(c, i));
    for (const c of cs) this.moveTo(c, 'trash');
    if (cs.length) this.log(`${p.name} défausse ${cs.map(c => this.name(c)).join(', ')}.`);
    return cs;
  }
  trashTop(i, n) {
    const p = this.P(i), out = [];
    for (let k = 0; k < n && p.deck.length; k++) { const c = p.deck.shift(); p.trash.push(c); out.push(c); }
    if (out.length) this.log(`${p.name} met au rebut ${out.length} carte(s) du dessus de son deck.`);
    return out;
  }
  bottomDeck(i, cards) {
    // CR 11.15.1.2: a card must always go to its OWN owner's deck,
    // even when a rival initiated the effect. Shuffle each simultaneous group.
    const groups = new Map();
    for (const card of cards) {
      if (!groups.has(card.owner)) groups.set(card.owner, []);
      groups.get(card.owner).push(card);
    }
    for (const [owner, batch] of groups) {
      this.shuffle(batch);
      for (const c of batch) {
        c.mods = []; c.grants = []; c.flags = {}; c.lag = false; c.ready = true;
        this.P(owner).deck.push(c);
      }
    }
  }

  // déplace une carte vers une zone (gère les équipements attachés & légendes)
  moveTo(inst, zone, toPlayer) {
    const w = this.where(inst.uid);
    if (w) {
      if (w.zone === 'gear') w.host.gear.splice(w.idx, 1);
      else this.P(w.p)[w.zone].splice(w.idx, 1);
    }
    const owner = this.P(inst.owner);
    // CR 4.12.1–4.12.3: attached Gear follows its host to the new area.
    // Exception: a Legend leaving the field is removed from play only AFTER
    // its Gear reaches the intended zone (trash, hand, or deck).
    const gears = (inst.gear || []).slice(); inst.gear = [];
    for (const gr of gears) { gr.mods = []; gr.grants = []; gr.flags = {}; gr.lag = false; }
    inst.mods = []; inst.grants = []; inst.lag = false; inst.flags = {};
    const removingLegend = this.isLegend(inst) && zone !== 'field' && zone !== 'legends';
    if (zone === 'deckBottom' || zone === 'deckTop') {
      // All cards bottom-/top-decked simultaneously are randomized together.
      const bundle = removingLegend ? gears : [inst, ...gears];
      const grouped = new Map();
      for (const c of bundle) {
        if (!grouped.has(c.owner)) grouped.set(c.owner, []);
        grouped.get(c.owner).push(c);
      }
      for (const [i, group] of grouped) {
        this.shuffle(group);
        if (zone === 'deckBottom') this.P(i).deck.push(...group);
        else this.P(i).deck.unshift(...group);
      }
      if (removingLegend) owner.removed.push(inst);
      return removingLegend ? 'removed' : zone;
    }
    for (const gr of gears) this.P(gr.owner)[zone === 'hand' ? 'hand' : zone === 'trash' ? 'trash' : 'trash'].push(gr);
    if (removingLegend) { owner.removed.push(inst); return 'removed'; }
    const tgt = toPlayer !== undefined ? this.P(toPlayer) : owner;
    tgt[zone].push(inst);
    return zone;
  }

  // ------------------------------------------------------------ Gigs ------
  gigUid() { return this.s.uid++; }
  async rollIn(i) {
    const p = this.P(i);
    if (!p.fixer.length) return null;
    let choices = p.fixer.filter(s => s !== 20);
    if (!choices.length) choices = [20];
    let sides;
    if (choices.length === 1) sides = choices[0];
    else sides = await this.pickOne(i, 'Choisissez le dé de Gig à lancer', choices.map(s => ({ label: 'd' + s, value: s, score: this.dec(i).dieScore ? this.dec(i).dieScore(this, i, s) : s })));
    p.fixer.splice(p.fixer.indexOf(sides), 1);
    const value = 1 + this.randInt(sides);
    const die = { uid: this.gigUid(), sides, value, owner: i };
    p.gigs.push(die);
    this.log(`${p.name} lance un d${sides} → ${value}.`);
    let rerolled = false;
    for (const src of this.sources(i)) { const sd = this.def(src.inst); if (sd.mayReroll && await sd.mayReroll(this, src.inst, i, die)) { die.value = 1 + this.randInt(sides); rerolled = true; this.log(`${p.name} relance le d${sides} → ${die.value}.`); break; } }
    // An ignored roll has no final result. Only the accepted result can trigger extremes.
    await this.emit('gigRolled', { p: i, die, reroll: rerolled });
    await this.ui('roll', { p: i, die });
    await this.emit('gigGained', { p: i, die });
    return die;
  }
  gigOwnerIdx(die) { return this.P(0).gigs.includes(die) ? 0 : (this.P(1).gigs.includes(die) ? 1 : -1); }
  async setGig(die, v, by) {
    if (v < 1 || v > die.sides || v === die.value) return false;
    const old = die.value; die.value = v;
    const ctrl = this.gigOwnerIdx(die);
    this.log(`Gig d${die.sides} : ${old} → ${v}.`);
    await this.emit('gigAdjusted', { die, from: old, to: v, by, p: ctrl });
    this.checkOT();
    return true;
  }
  async adjustGig(die, delta, by) { // delta signé
    if (!delta) return false;
    let v = die.value + delta;
    v = Math.max(1, Math.min(die.sides, v));
    return await this.setGig(die, v, by);
  }
  // "Ajustez un Gig de jusqu'à X" : choix du dé, du sens et du montant
  async adjustUpTo(i, X, opt = {}) {
    const pool = opt.pool || (opt.whose === 'rival' ? this.P(this.opp(i)).gigs : opt.whose === 'friendly' ? this.P(i).gigs : [...this.P(i).gigs, ...this.P(this.opp(i)).gigs]);
    if (!pool.length) return null;
    const dirs = opt.dir ? [opt.dir] : [1, -1];
    const options = [];
    for (const d of pool) for (const dir of dirs) for (let n = 1; n <= X; n++) {
      const nv = d.value + dir * n; if (nv < 1 || nv > d.sides) continue;
      const mine = this.P(i).gigs.includes(d);
      const sc = (mine ? 1 : -1) * dir * n + (opt.aiBonus ? opt.aiBonus(d, nv) : 0);
      options.push({ label: `${mine ? 'Votre' : 'Gig adverse'} d${d.sides} : ${d.value} → ${nv}`, value: `${d.uid}:${nv}`, gig: d, score: sc });
    }
    if (!options.length) return null;
    const v = await this.pickOne(i, opt.title || `Ajustez un Gig de ${X} maximum`, options, { optional: opt.optional !== false });
    if (!v) return null;
    const [uid, nv] = v.split(':').map(Number);
    const d = pool.find(x => x.uid === uid);
    await this.setGig(d, nv, i);
    return d;
  }
  // SEULE primitive de vol (CR 11.5): prévention, transfert atomique,
  // vérification des victoires, callbacks de l'acteur et triggers individuels.
  // Toutes les cartes, les attaques et les effets doivent passer ici.
  async stealGigs(thief, chosen, actor = null) {
    const victim = this.opp(thief);
    const unique = [], seen = new Set();
    for (const die of chosen || []) {
      if (!die || seen.has(die.uid) || this.gigOwnerIdx(die) !== victim) continue;
      seen.add(die.uid);
      if (actor && !this.stealAllowed(actor, die, victim)) continue;
      unique.push(die);
    }
    // CR 11.5.1.5: prévention après sélection, AVANT le mouvement.
    const valid=[];
    for (const die of unique) {
      let prevented=false;
      for (const src of this.sources(victim).slice()) {
        const sd=this.def(src.inst);
        if (sd.preventSteal && await sd.preventSteal(this, src.inst, actor, die, src)) {
          prevented=true; break;
        }
      }
      if (prevented) this.log('Le vol du Gig d'+die.sides+' est empêché.');
      else if (this.gigOwnerIdx(die) === victim) valid.push(die);
    }
    if (!valid.length) return [];
    // CR 11.5.1.6: TOUS les Gigs passent de zone ensemble.
    const from=this.P(victim).gigs, to=this.P(thief).gigs;
    for (const die of valid) from.splice(from.indexOf(die),1);
    to.push(...valid);
    // CR 1.11/1.13: en prolongation, victoire avant les effets en attente.
    this.checkOT();
    for (const die of valid) {
      this.log(this.pname(thief)+' vole un Gig d'+die.sides+' ('+die.value+').','steal');
      await this.ui('steal',{p:thief,die});
    }
    if(actor){
      actor.flags.stoleThisTurn=true;
      if(this.hasFlag(actor,'psycho'))actor.flags.psychoDoom=true;
    }
    await this.withTimingWindow(async()=>{
      // Triggers propres à l'unité et ses équipements: une fois par événement groupé.
      if(actor){
        const d=this.def(actor);
        if(d.onSteal)this.queueEffect(thief,this.name(actor)+' — VOL',()=>d.onSteal(this,actor,thief,valid));
        for(const gr of actor.gear.slice()){
          const gd=this.def(gr);
          if(gd.onHostSteal)this.queueEffect(thief,this.name(gr)+' — VOL',()=>gd.onHostSteal(this,gr,actor,thief,valid));
        }
      }
      // CR 11.5.1.6.2/11.5.1.7: un déclenchement PAR Gig volé.
      for(const die of valid)await this.emit('steal',{p:thief,unit:actor,gigs:[die],batch:valid});
    });
    this.checkOT();
    return valid;
  }
  async stealGig(thief, die, byUnit){
    return (await this.stealGigs(thief,[die],byUnit)).length===1;
  }
  async swapGigs(a, b) {
    const pa = this.gigOwnerIdx(a), pb = this.gigOwnerIdx(b);
    if (pa < 0 || pb < 0 || pa === pb) return false;
    const A = this.P(pa).gigs, B = this.P(pb).gigs;
    A.splice(A.indexOf(a), 1, b); B.splice(B.indexOf(b), 1, a);
    this.log(`Échange de Gigs : d${a.sides}(${a.value}) ⇄ d${b.sides}(${b.value}).`);
    this.checkOT();
    return true;
  }
  checkOT() {
    if (!this.s.overtime) return;
    for (const i of [this.s.active, this.opp(this.s.active)]) if (this.gigCount(i) >= 7) throw new GameOver(i, `${this.pname(i)} contrôle au moins 7 Gigs en prolongation !`);
  }

  // -------------------------------------------------- Pending Resolution --
  // 10.11-10.16 : les effets attendent leur fenêtre; l'effet en cours finit avant les nouveaux.
  // Les tâches sont liées à l'instance déclenchante, même si elle quitte le terrain ensuite.
  queueEffect(owner, label, run, metadata = {}) {
    if (this._pendingEffects.length > 1000) throw new Error('Chaîne d’effets trop longue (1000)');
    this._pendingEffects.push({ owner, label, run, serial: ++this._effectSerial, ...metadata });
  }
  async withTimingWindow(fn) {
    this._timingDepth++;
    try { return await fn(); }
    finally {
      this._timingDepth--;
      if (!this._timingDepth && !this._resolvingEffects) await this.resolvePending();
    }
  }
  async resolvePending() {
    if (this._resolvingEffects || this._timingDepth) return;
    this._resolvingEffects = true;
    let processed = 0;
    try {
      while (this._pendingEffects.length) {
        if (++processed > 1000) throw new Error('Limite de 1000 résolutions en attente atteinte');
        // 10.13-10.14 : joueur actif d'abord, puis son rival. Toute nouvelle
        // capacité déclenchée reste en attente, sans interrompre l'effet actuel.
        const turnOwner = this.s.active;
        const owner = this._pendingEffects.some(e => e.owner === turnOwner) ? turnOwner : this.opp(turnOwner);
        const choices = this._pendingEffects.filter(e => e.owner === owner);
        let chosen = choices[0];
        if (choices.length > 1) {
          // 10.12 : le contrôleur détermine l'ordre. Pas de clic pour les simulations.
          if (!this.hooks.sim) {
            const values = choices.map(e => ({ label: e.label, value: e.serial, score: e.priority || 0 }));
            const selected = await this.pickOne(owner, 'Effet en attente : choisissez le prochain à résoudre', values);
            chosen = choices.find(e => e.serial === selected) || chosen;
          } else {
            chosen = choices.slice().sort((a,b)=>(b.priority||0)-(a.priority||0)||a.serial-b.serial)[0];
          }
        }
        this._pendingEffects.splice(this._pendingEffects.indexOf(chosen), 1);
        await chosen.run();
      }
    } finally { this._resolvingEffects = false; }
  }
  triggerPriority(inst, event) {
    const t = (this.def(inst)?.txt || '').toLowerCase();
    if (event === 'spent' && /puissance|ajust|pioche|redress/.test(t)) return 4;
    if (event === 'steal' && /pioche|augmente|défauss/.test(t)) return 3;
    if (event === 'attack' && /puissance|ajust/.test(t)) return 2;
    return 0;
  }
  // L'instant du déclenchement photographie les sources (snapshot), non les effets.
  async emit(ev, data) {
    for (const i of [this.s.active, this.opp(this.s.active)]) {
      for (const src of this.sources(i).slice()) {
        const d = this.def(src.inst), h = d.on && d.on[ev];
        if (!h) continue;
        if (src.zone !== 'gear' && !this.where(src.inst.uid)) continue;
        const inst = src.inst;
        this.queueEffect(i, `${this.name(inst)} — ${ev}`, () => h(this, inst, data, src), { event: ev, source: inst.uid, priority: this.triggerPriority(inst, ev) });
      }
    }
    if (!this._timingDepth && !this._resolvingEffects) await this.resolvePending();
  }

  // --------------------------------------------------------- Défaites -----
  async defeat(inst, by) {
    const w = this.where(inst.uid);
    if (!w || w.zone !== 'field') return false;
    // protections
    if (this.hasFlag(inst, 'protect')) { this.log(`${this.name(inst)} est protégé.`); return false; }
    const d = this.def(inst);
    if (d.preventDefeat && await d.preventDefeat(this, inst, by)) return false;
    for (const gr of inst.gear.slice()) { const gd = this.def(gr); if (gd.hostPreventDefeat && await gd.hostPreventDefeat(this, gr, inst, by)) return false; }
    const ctrl = w.p;
    for (const src of this.sources(ctrl)) { const sd = this.def(src.inst); if (sd.replaceFriendlyDefeat && src.inst !== inst && await sd.replaceFriendlyDefeat(this, src.inst, inst, by, src)) return false; }
    const gearsBefore = inst.gear.slice();
    // A global, per-turn fact: even an ARASAKA defeat before Yorinobu
    // enters play consumes "the first time ... this turn". Compute only
    // after prevention/replacement effects have all been checked.
    const isArasaka = (d.tags || []).includes('ARASAKA');
    const firstArasakaDefeat = isArasaka && this.s.firstArasakaDefeatTurn !== this.s.turn;
    if (isArasaka) this.s.firstArasakaDefeatTurn = this.s.turn;
    const res = this.moveTo(inst, 'trash');
    this.log(`${this.name(inst)} est vaincu${res === 'removed' ? ' (retiré du jeu)' : ''}.`, 'defeat');
    await this.ui('defeat', { inst, p: ctrl });
    if (d.onDefeated) this.queueEffect(ctrl,this.name(inst)+' — VAINCU',()=>d.onDefeated(this,inst,ctrl,by));
    // FAQ: Yorinobu is itself an ARASAKA Unit and draws when it is the
    // first defeated one. It has already left the field at emit() time.
    if (firstArasakaDefeat && inst.id === 'yorinobu-arasaka-steel-dragon')
      this.queueEffect(ctrl, this.name(inst)+' — première défaite ARASAKA', () => this.draw(ctrl, 1));
    for (const gr of gearsBefore) { const gd = this.def(gr); if (gd.onHostDefeated) this.queueEffect(ctrl,this.name(gr)+' — HÔTE VAINCU',()=>gd.onHostDefeated(this,gr,inst,ctrl)); }
    await this.emit('defeated', { inst, p: ctrl, by, gears: gearsBefore, firstArasakaDefeat });
    return true;
  }
  async bottomDeckUnit(inst) {
    const w = this.where(inst.uid); if (!w || w.zone !== 'field') return false;
    const r = this.moveTo(inst, 'deckBottom');
    this.log(`${this.name(inst)} est placé sous le deck${r === 'removed' ? ' (Légende retirée du jeu)' : ''}.`);
    return true;
  }
  async returnToHand(inst) {
    const w = this.where(inst.uid); if (!w) return false;
    const r = this.moveTo(inst, 'hand');
    this.log(`${this.name(inst)} retourne en main${r === 'removed' ? ' (Légende retirée du jeu)' : ''}.`);
    return true;
  }

  // ----------------------------------------------------- Valeur d'une carte (IA)
  cardValue(c, i) { const d = this.def(c); return (d.cost ?? 0) + (d.power ?? 0) * 0.5 + (d.aiValue || 0); }

  // ============================================================ ACTIONS ===
  canSell(i) { return !this.P(i).soldThisTurn; }
  sellable(c) { return !!c && this.def(c).sell === true; }

  gearHosts(i) { return [...this.P(i).field, ...this.P(i).legends.filter(l => l.faceUp)]; }

  canPlay(i, c) {
    const d = this.def(c);
    if (d.type === 'Legend') return false;
    if (d.type === 'Program' && d.canPlay && !d.canPlay(this, i, c)) return false;
    if (d.type === 'Gear') { const hosts = this.gearHosts(i).filter(h => !d.hostFilter || d.hostFilter(this, h, i)); if (!hosts.length) return false; }
    if (d.type === 'Unit' && d.canPlay && !d.canPlay(this, i, c)) return false;
    return this.avail(i) >= this.costOf(c, i, 'play');
  }

  legalActions(i, opts = {}) {
    const p = this.P(i), A = [];
    const reaction = !!opts.reaction;
    if (!reaction) {
      if (!p.soldThisTurn) for (const c of p.hand) if (this.sellable(c)) A.push({ type: 'sell', uid: c.uid });
      for (const c of p.hand) {
        const d = this.def(c);
        if (!this.canPlay(i, c)) continue;
        if (d.type === 'Gear') {
          for (const h of this.gearHosts(i)) if (!d.hostFilter || d.hostFilter(this, h, i)) A.push({ type: 'play', uid: c.uid, host: h.uid });
        } else A.push({ type: 'play', uid: c.uid });
      }
      for (const l of p.legends) {
        if (!l.faceUp) continue;
        const d = this.def(l);
        if (d.cost === null || d.cost === undefined) continue;
        if (this.hasKw(l, 'GO_SOLO')) { const c = this.costOf(l, i, 'solo'); if (this.avail(i) >= c) A.push({ type: 'solo', uid: l.uid }); }
        else if (this.avail(i) >= this.costOf(l, i, 'field')) A.push({ type: 'legendField', uid: l.uid });
      }
    } else {
      // programmes RAPIDE depuis la main
      for (const c of p.hand) { const d = this.def(c); if (d.type === 'Program' && d.quick && this.canPlay(i, c)) A.push({ type: 'play', uid: c.uid }); }
    }
    if (!p.calledThisTurn && p.legends.some(l => !l.faceUp) && this.avail(i) >= this.callCost(i)) A.push({ type: 'call' });
    // capacités activées
    for (const src of this.sources(i)) {
      const d = this.def(src.inst);
      (d.abilities || []).forEach((ab, k) => {
        if (reaction && !ab.quick) return;
        if (!this.canActivate(i, src, ab)) return;
        A.push({ type: 'activate', uid: src.inst.uid, idx: k });
      });
    }
    if (reaction) {
      const A0 = this.s.attack;
      const unblockable = A0 && A0.unblockable;
      if (!unblockable) for (const u of p.field) if (u.ready && this.hasKw(u, 'BLOCKER') && this.canBlock(u) && !(A0 && A0.target.kind === 'unit' && A0.target.uid === u.uid)) A.push({ type: 'block', uid: u.uid });
      A.push({ type: 'pass' });
      return A;
    }
    // attaques
    for (const u of p.field) {
      if (!this.canAttackNow(u)) continue;
      for (const t of this.attackTargets(u)) A.push({ type: 'attack', uid: u.uid, target: t });
    }
    const forced = p.field.some(u => this.hasFlag(u, 'mustAttack') && this.canAttackNow(u) && this.attackTargets(u).length);
    if (forced) return A;
    A.push({ type: 'end' });
    return A;
  }

  callCost(i) {
    if (this.s.active === i) for (const src of this.sources(i)) { const sd = this.def(src.inst); if (sd.freeCallOnYourTurn && src.zone === 'field') return 0; }
    return 1;
  }
  abCost(ab, inst, i) { return Math.max(0, typeof ab.cost === 'function' ? ab.cost(this, inst, i) : (ab.cost || 0)); }
  canActivate(i, src, ab) {
    const inst = src.inst;
    const host = src.host || inst;
    if (ab.spend) {
      const spender = ab.spendHost ? host : inst;
      if (!spender.ready) return false;
      if (this.where(spender.uid)?.zone === 'field' && spender.lag) return false;
    }
    if (ab.oncePerTurn && inst.flags['used' + ab.key]) return false;
    if (ab.cond && !ab.cond(this, inst, i, src)) return false;
    const exclude = ab.spend ? [(ab.spendHost ? host : inst).uid] : [];
    return this.avail(i, exclude) >= this.abCost(ab, inst, i);
  }

  canAttackNow(u) {
    if (!u.ready) return false;
    if (this.hasFlag(u, 'cantAttack')) return false;
    const d = this.def(u);
    if (d.cantAttack && d.cantAttack(this, u)) return false;
    for (let i = 0; i < 2; i++) for (const src of this.sources(i)) { const sd = this.def(src.inst); if (sd.auraCantAttack && sd.auraCantAttack(this, src.inst, u, src)) return false; }
    if (u.lag && !this.hasKw(u, 'ADRENALINE') && !u.flags.solo && !this.rushKind(u)) return false;
    return true;
  }
  // 'units' | 'gigs' | null : attaque autorisée pendant le Lag mais restreinte
  rushKind(u) {
    if (this.hasFlag(u, 'rushUnits')) return 'units';
    const d = this.def(u);
    if (d.rush) { const r = d.rush(this, u); if (r) return r; }
    return null;
  }
  canBlock(u) {
    if (this.hasFlag(u, 'cantBlock')) return false;
    return true;
  }
  attackTargets(u) {
    const i = this.controllerOf(u), o = this.opp(i), T = [];
    const d = this.def(u);
    const lagOnly = u.lag && !this.hasKw(u, 'ADRENALINE') && !u.flags.solo ? this.rushKind(u) : null;
    for (const t of this.P(o).field) {
      if (lagOnly === 'gigs') break;
      let ok = !t.ready;
      if (!ok && this.hasFlag(u, 'attackReady')) ok = true;
      if (!ok && d.canAttackReady && d.canAttackReady(this, u, t)) ok = true;
      if (!ok) for (const gr of u.gear) { const gd = this.def(gr); if (gd.hostCanAttackReady && gd.hostCanAttackReady(this, gr, u, t)) ok = true; }
      if (this.hasFlag(t, 'untargetableAttack')) ok = false;
      if (ok) T.push({ kind: 'unit', uid: t.uid });
    }
    if (lagOnly !== 'units' && this.P(o).gigs.length && !(d.cantAttackGigs && d.cantAttackGigs(this, u)) && !this.hasFlag(u, 'cantAttackGigs')) T.push({ kind: 'gigs' });
    return T;
  }

  // ------------------------------------------------------- Exécution -----
  async doAction(i, a) {
    const p = this.P(i);
    switch (a.type) {
      case 'sell': {
        const c = p.hand.find(x => x.uid === a.uid); if (!c || p.soldThisTurn || !this.sellable(c) || this.s.phase !== 'main' || this.s.active !== i) return;
        p.hand.splice(p.hand.indexOf(c), 1); p.soldThisTurn = true;
        p.eddies.push({ uid: c.uid, ready: true, card: c });
        this.log(`${p.name} vend ${this.name(c)} (+1 €$).`, 'sell');
        await this.ui('sell', { p: i, c });
        await this.emit('sold', { p: i, card: c });
        return;
      }
      case 'call': return await this.withTimingWindow(() => this.callLegend(i));
      case 'play': return await this.withTimingWindow(() => this.playCard(i, a.uid, a.host));
      case 'solo': return await this.withTimingWindow(() => this.goSolo(i, a.uid, true));
      case 'legendField': return await this.withTimingWindow(() => this.goSolo(i, a.uid, false));
      case 'activate': return await this.withTimingWindow(() => this.activate(i, a.uid, a.idx));
      case 'attack': return await this.attack(i, a.uid, a.target);
    }
  }

  async callLegend(i, free = false) {
    const p = this.P(i);
    const fd = p.legends.filter(l => !l.faceUp);
    if (!fd.length) return null;
    if (!free) { if (p.calledThisTurn) return null; if (!(await this.pay(i, this.callCost(i)))) return null; p.calledThisTurn = true; }
    // Le joueur choisit l'emplacement face cachée (11.14.1.1) ; son identité demeure secrète.
    const chosenUid = await this.pickOne(i, 'Choisissez une Légende face cachée',
      fd.map((l, k) => ({ label: 'Légende face cachée ' + (k + 1), value: l.uid, score: 0 })));
    const l = fd.find(x => x.uid === chosenUid) || fd[0];
    l.faceUp = true;
    this.log(`${p.name} appelle une Légende : ${this.name(l)} !`, 'legend');
    await this.ui('call', { p: i, inst: l });
    const d = this.def(l);
    if (d.onCall) this.queueEffect(i, this.name(l)+" — APPEL", () => d.onCall(this, l, i));
    await this.emit('legendCalled', { p: i, inst: l });
    return l;
  }

  async callFree(i, specific) {
    const p = this.P(i);
    if (p.calledThisTurn) return null;
    const fd = p.legends.filter(l => !l.faceUp); if (!fd.length) return null;
    p.calledThisTurn = true;
    if (specific) { const l = specific; l.faceUp = true; this.log(`${p.name} appelle ${this.name(l)} gratuitement !`, 'legend'); await this.ui('call', { p: i, inst: l }); const d = this.def(l); if (d.onCall) this.queueEffect(i, this.name(l)+" — APPEL", () => d.onCall(this, l, i)); await this.emit('legendCalled', { p: i, inst: l }); return l; }
    return await this.callLegend(i, true);
  }
  readyEddies(i, n) { let k = 0; for (const e of this.P(i).eddies) if (!e.ready && k < n) { e.ready = true; k++; } if (k) this.log(`${this.pname(i)} redresse ${k} Eddie(s).`); return k; }
  async spendUnit(u) { if (!u || !u.ready) return false; u.ready = false; await this.emit('spent', { inst: u, p: this.controllerOf(u) }); return true; }

  async playCard(i, uid, hostUid, opt = {}) {
    const p = this.P(i);
    const c = p.hand.find(x => x.uid === uid) || (opt.from ? opt.from.find(x => x.uid === uid) : null);
    if (!c) return;
    const d = this.def(c);
    if (!opt.free) {
      const cost = this.costOf(c, i, 'play');
      if (!(await this.pay(i, cost))) return;
    }
    // "Next Program" is consumed by the next Program actually played even
    // when its payment is waived by another effect (Alt Cunningham).
    if (d.type === 'Program' && p.tf.progDiscount) p.tf.progDiscount = 0;
    // A free play is still a play: once-per-turn "first Gear played" effects
    // must be consumed even if the card's payment was waived (Viktor Vektor).
    for (const src of this.sources(i)) { const sd = this.def(src.inst); if (sd.afterPay) sd.afterPay(this, src.inst, c, i); }
    const src = p.hand.includes(c) ? p.hand : opt.from;
    src.splice(src.indexOf(c), 1);
    if (opt.rushUnits && d.type === 'Unit') { /* appliqué après l'entrée */ }
    if (d.type === 'Unit') {
      c.ready = true; c.lag = true; c.mods = []; c.grants = []; c.flags = {}; c.gear = [];
      p.field.push(c);
      if (opt.rushUnits) this.flag(c, 'rushUnits', 'turn');
      this.log(`${p.name} joue ${this.name(c)} (unité, ${this.basePower(c)} de puissance).`, 'play');
      await this.ui('play', { p: i, c });
      if (d.onPlay) this.queueEffect(i, this.name(c)+" — JEU", () => d.onPlay(this, c, i));
    } else if (d.type === 'Gear') {
      let host = hostUid ? this.byUid(hostUid) : null;
      if (!host || !this.gearHosts(i).includes(host)) {
        const hosts = this.gearHosts(i).filter(h => !d.hostFilter || d.hostFilter(this, h, i));
        host = await this.pickUnit(i, `Équiper ${d.name} sur…`, hosts, h => this.eff(h) + (h.ready ? 1 : 0));
      }
      if (!host) { p.trash.push(c); return; }
      c.mods = []; c.grants = []; c.flags = {};
      host.gear.push(c);
      this.log(`${p.name} équipe ${this.name(c)} sur ${this.name(host)}.`, 'play');
      await this.ui('play', { p: i, c, host });
      if (d.onPlay) this.queueEffect(i, this.name(c)+" — JEU", () => d.onPlay(this, c, i, host));
    } else if (d.type === 'Program') {
      p.tf.playedProgram = true;
      this.log(`${p.name} lance le programme ${this.name(c)}.`, 'play');
      await this.ui('play', { p: i, c });
      p.limbo = c;
      if (d.onPlay) await d.onPlay(this, c, i);
      p.limbo = null;
      if (!this.where(c.uid)) { if (opt.bottomAfter) p.deck.push(c); else p.trash.push(c); }
    }
    await this.emit('cardPlayed', { p: i, inst: c, def: d });
  }

  async goSolo(i, uid, solo) {
    const p = this.P(i);
    const l = p.legends.find(x => x.uid === uid); if (!l || !l.faceUp) return;
    const cost = this.costOf(l, i, solo ? 'solo' : 'field');
    if (!(await this.pay(i, cost, [], l.uid))) return;
    // Nocturne grants one Go Solo discount usable later this turn by any
    // eligible friendly Legend; consume it only on a successful Go Solo.
    if (solo && p.tf.soloDiscount > 0) p.tf.soloDiscount = 0;
    p.legends.splice(p.legends.indexOf(l), 1);
    l.lag = true; l.flags = { solo }; if (solo) l.ready = true;
    p.field.push(l);
    this.log(`${p.name} : ${this.name(l)} ${solo ? 'passe EN SOLO' : 'entre sur le terrain'} !`, 'legend');
    await this.ui('play', { p: i, c: l });
    const d = this.def(l);
    if (d.onPlay) this.queueEffect(i, this.name(l)+" — JEU", () => d.onPlay(this, l, i));
    await this.emit('cardPlayed', { p: i, inst: l, def: d, solo });
  }

  async activate(i, uid, idx) {
    const src = this.sources(i).find(s => s.inst.uid === uid); if (!src) return;
    const d = this.def(src.inst), ab = d.abilities[idx];
    if (!this.canActivate(i, src, ab)) return;
    const host = src.host || src.inst;
    const spender = ab.spendHost ? host : src.inst;
    if (ab.payExtra && !(await ab.payExtra(this, src.inst, i, src))) return;
    if (!(await this.pay(i, this.abCost(ab, src.inst, i), ab.spend ? [spender.uid] : []))) return;
    if (ab.spend) { spender.ready = false; }
    if (ab.oncePerTurn) src.inst.flags['used' + ab.key] = true;
    this.log(`${this.pname(i)} active ${this.name(src.inst)}${ab.label ? ' : ' + ab.label : ''}.`, 'ability');
    await this.ui('ability', { p: i, inst: src.inst });
    if (ab.spend) await this.emit('spent', { inst: spender, p: i });
    await ab.run(this, src.inst, i, src);
  }

  // ------------------------------------------------------------ Attaque ---
  async attack(i, uid, target) {
    const u = this.byUid(uid);
    if (!u || !this.canAttackNow(u)) return;
    const o = this.opp(i);
    const du0 = this.def(u);
    const A = { attacker: u.uid, p: i, target: { ...target }, ended: false, redirected: false, noSteal: false, blockers: [], unblockable: !!(du0.cantBeBlocked && du0.cantBeBlocked(this, u)) };
    if (this.hasFlag(u, 'attackReady')) u.mods = u.mods.filter(m => m.flag !== 'attackReady');
    this.s.attack = A;
    u.ready = false;
    const tgtName = target.kind === 'gigs' ? 'les Gigs adverses' : this.name(this.byUid(target.uid));
    this.log(`${this.pname(i)} : ${this.name(u)} attaque ${tgtName} !`, 'attack');
    await this.ui('attack', { p: i, u, target });
    try {
      await this.withTimingWindow(async () => {
        await this.emit('spent', { inst: u, p: i, forAttack: true });
        const d = this.def(u);
        if (d.onAttack) this.queueEffect(i, this.name(u)+' — ATTAQUE', () => d.onAttack(this,u,i,A));
        for (const gr of u.gear.slice()) { const gd = this.def(gr); if (gd.onHostAttack) this.queueEffect(i, this.name(gr)+' — ATTAQUE', () => gd.onHostAttack(this,gr,u,i,A)); }
        await this.emit('attack', { attacker: u, p: i, A });
      });
      if (this.attackBroken(A)) return this.endAttack(A);
      // ---- Étape de réaction (défenseur)
      let guard = 0;
      while (guard++ < 30) {
        if (this.attackBroken(A)) break;
        const acts = this.legalActions(o, { reaction: true });
        if (acts.length <= 1) break;
        const r = await this.dec(o).react(this, o, A, acts);
        if (!r || r.type === 'pass') break;
        await this.doReaction(o, r, A);
      }
      if (this.attackBroken(A)) return this.endAttack(A);
      // ---- Combat ou vol
      if (A.target.kind === 'unit') await this.fight(A);
      else if (!A.noSteal && !A.redirected) await this.stealStep(A);
    } finally { this.endAttack(A); }
  }
  async doReaction(o, r, A) {
    if (r.type === 'block') {
      const b = this.byUid(r.uid); if (!b || !b.ready) return;
      b.ready = false;
      A.redirected = true; A.target = { kind: 'unit', uid: b.uid }; A.blockers.push(b.uid);
      this.log(`${this.pname(o)} : ${this.name(b)} BLOQUE l'attaque !`, 'block');
      await this.ui('block', { p: o, b });
      await this.withTimingWindow(async () => {
        await this.emit('spent', { inst: b, p: o });
        await this.emit('blocked', { blocker: b, p: o, A });
      });
    } else await this.doAction(o, r);
  }
  // termine une attaque en cours (utilisé par les simulations de l'IA)
  async resolveAttack(A) {
    try {
      if (this.attackBroken(A)) return;
      if (A.target.kind === 'unit') await this.fight(A);
      else if (!A.noSteal && !A.redirected) await this.stealStep(A);
    } finally { this.endAttack(A); }
  }
  attackBroken(A) {
    if (A.ended) return true;
    const u = this.byUid(A.attacker);
    if (!u || !this.onField(u)) return true;
    if (A.target.kind === 'unit') { const t = this.byUid(A.target.uid); if (!t || !this.onField(t)) return true; }
    return false;
  }
  endAttack(A) { if (this.s.attack === A) this.s.attack = null; }

  async fight(A) {
    return this.withTimingWindow(async () => {
    const u = this.byUid(A.attacker), t = this.byUid(A.target.uid);
    if (!u || !t) return;
    const pu = this.eff(u, { fight: true, vs: t }), pt = this.eff(t, { fight: true, defending: true, vs: u });
    let uLoses = pu < pt, tLoses = pt < pu;
    if (pu === pt) uLoses = tLoses = true;
    // effets "gagne/perd le combat"
    const du = this.def(u), dt = this.def(t);
    if (du.winsFight && du.winsFight(this, u, t)) { uLoses = false; tLoses = true; }
    if (dt.winsFight && dt.winsFight(this, t, u)) { tLoses = false; uLoses = true; }
    this.log(`Combat : ${this.name(u)} (${pu}) contre ${this.name(t)} (${pt}).`, 'fight');
    await this.ui('fight', { u, t, pu, pt });
    await this.emit('fight', { attacker: u, defender: t, A, uLoses, tLoses });
    if (du.onFight) this.queueEffect(this.controllerOf(u), this.name(u)+' — COMBAT',()=>du.onFight(this,u,t,A));
    if (dt.onFight) this.queueEffect(this.controllerOf(t), this.name(t)+' — COMBAT',()=>dt.onFight(this,t,u,A));
    // une unité à 0 de puissance ne peut vaincre personne
    const kills = [];
    // Reboot Optics : la protection est consommée lors du PROCHAIN combat
    // opposant une Unité rivale, même si aucune défaite n'aurait eu lieu.
    // Un effet qui ne se déclenche qu'au moment d'une défaite dure trop longtemps.
    const pU = this.controllerOf(u), pT = this.controllerOf(t);
    const protectU = pU !== pT && !!this.P(pU).tf.rebootOptics;
    const protectT = pU !== pT && !!this.P(pT).tf.rebootOptics;
    if (protectU) this.P(pU).tf.rebootOptics = false;
    if (protectT) this.P(pT).tf.rebootOptics = false;
    if (tLoses && pu > 0 && !this.hasFlag(t, 'noFightDefeat') && !protectT) kills.push([t, u]);
    else if (tLoses && pu > 0 && protectT) this.log(`Reboot Optics : ${this.name(t)} n'est pas vaincu.`);
    if (uLoses && pt > 0 && !this.hasFlag(u, 'noFightDefeat') && !protectU) kills.push([u, t]);
    else if (uLoses && pt > 0 && protectU) this.log(`Reboot Optics : ${this.name(u)} n'est pas vaincu.`);
    A.margin = pu - pt; A.uWon = tLoses && !uLoses; A.tWon = uLoses && !tLoses;
    if (tLoses && pu === 0) this.log(`${this.name(u)} a 0 de puissance : il ne peut pas vaincre.`);
    for (const [x, by] of kills) if (this.onField(x)) await this.defeat(x, { fight: true, by: by.uid });
    if (A.uWon) { await this.emit('fightWon', { winner: u, loser: t, A, margin: pu - pt }); const dw = this.def(u); if (dw.onWinFight && this.onField(u)) this.queueEffect(this.controllerOf(u),this.name(u)+' — COMBAT GAGNÉ',()=>dw.onWinFight(this,u,t,A)); for (const gr of u.gear) { const gd = this.def(gr); if (gd.onHostWinFight) this.queueEffect(this.controllerOf(u),this.name(gr)+' — COMBAT GAGNÉ',()=>gd.onHostWinFight(this,gr,u,t,A)); } }
    if (A.tWon) { await this.emit('fightWon', { winner: t, loser: u, A, margin: pt - pu }); const dw = this.def(t); if (dw.onWinFight && this.onField(t)) this.queueEffect(this.controllerOf(t),this.name(t)+' — COMBAT GAGNÉ',()=>dw.onWinFight(this,t,u,A)); for (const gr of t.gear) { const gd = this.def(gr); if (gd.onHostWinFight) this.queueEffect(this.controllerOf(t),this.name(gr)+' — COMBAT GAGNÉ',()=>gd.onHostWinFight(this,gr,t,u,A)); } }
    for (const x of [u, t]) if (this.hasFlag(x, 'psycho')) x.flags.psychoDoom = true;
    for (const [loser, other] of [[u, t], [t, u]]) {
      const lost = loser === u ? uLoses : tLoses;
      const pl = this.P(this.controllerOf(loser) >= 0 ? this.controllerOf(loser) : loser.owner);
      if (lost && pl.tf.safetyOverride && this.onField(other)) { pl.tf.safetyOverride = false; this.log('Safety Override !'); await this.defeat(other, { effect: true }); }
    }
    for (const [winner, margin] of [[u, pu - pt], [t, pt - pu]]) {
      const wc = this.controllerOf(winner); if (wc < 0) continue;
      const pl = this.P(wc);
      if (margin >= 3 && pl.tf.appetite && this.onField(winner) && this.P(this.opp(wc)).gigs.length) {
        pl.tf.appetite = false; this.log(`Appetite for Destruction : ${this.name(winner)} vole aussi un Gig !`);
        const pool = this.P(this.opp(wc)).gigs.filter(gd => this.stealAllowed(winner, gd, this.opp(wc)));
        const die = await this.pickGig(wc, 'Gig à voler', pool, gd => gd.value);
        if (die) { await this.stealGig(wc, die, winner); }
      }
    }
    if (uLoses) { const dl = this.def(u); if (dl.onLoseFight) this.queueEffect(this.controllerOf(u),this.name(u)+' — COMBAT PERDU',()=>dl.onLoseFight(this,u,t,A)); }
    if (tLoses) { const dl = this.def(t); if (dl.onLoseFight) this.queueEffect(this.controllerOf(t), this.name(t)+' — COMBAT PERDU',()=>dl.onLoseFight(this,t,u,A)); }
    });
  }

  stealCount(u) { const pw = this.eff(u, { steal: true }); let n = pw <= 0 ? 0 : Math.floor(pw / 10) + 1; const d = this.def(u); if (d.extraSteal) n += d.extraSteal(this, u) || 0; for (const gr of u.gear) { const gd = this.def(gr); if (gd.hostExtraSteal && pw > 0) n += gd.hostExtraSteal(this, gr, u) || 0; } n -= u.mods.filter(m => m.flag === 'stealMinus1').length; if (this.hasFlag(u, 'stealZero')) n = 0; return Math.max(0, n); }
  stealAllowed(u, die, victim) {
    for (const r of this.P(victim).prules || []) {
      if (r.kind === 'chromeFang' && die.value > this.eff(u)) return false;
      if (r.kind === 'westbrook' && this.isLegend(u) && die.value < this.eff(u)) return false;
    }
    return true;
  }
  async stealStep(A) {
    const u = this.byUid(A.attacker);
    if (!u || !this.onField(u)) return;
    const i = A.p, o = this.opp(i);
    let n = this.stealCount(u);
    const selected = [];
    // Règle 11.5.1.4 : choisir tous les dés avant de changer leur contrôle.
    while (selected.length < n) {
      let pool = this.P(o).gigs.filter(d => !selected.includes(d));
      const def = this.def(u);
      if (def.stealFilter) pool = pool.filter(d => def.stealFilter(this,u,d));
      pool = pool.filter(d => this.stealAllowed(u,d,o));
      if (!pool.length) break;
      const die = await this.pickGig(i,'Choisissez un Gig à voler',pool,d=>d.value+d.sides*.1);
      if (!die) break;
      selected.push(die);
    }
    const valid=await this.stealGigs(i,selected,u);
    if(!valid.length)this.log('Aucun Gig volé.');
  }

  // ============================================================== TOURS ===
  async setup() {
    const s = this.s;
    // jet de d20 pour le premier joueur
    let r0, r1; do { r0 = 1 + this.randInt(20); r1 = 1 + this.randInt(20); } while (r0 === r1);
    const winner = r0 > r1 ? 0 : 1;
    this.log(`Jet de d20 : ${this.pname(0)} ${r0} — ${this.pname(1)} ${r1}.`);
    const goFirst = await this.yesNo(winner, `Vous avez gagné le jet de d20 (${winner === 0 ? r0 : r1}). Jouer en premier ?`, true);
    s.first = goFirst ? winner : this.opp(winner);
    s.active = s.first;
    this.log(`${this.pname(s.first)} joue en premier.`);
    for (let i = 0; i < 2; i++) {
      const p = this.P(i);
      this.shuffle(p.deck); this.shuffle(p.legends);
      await this.draw(i, 6);
    }
    // Mettre à jour le plateau AVANT le mulligan : éviter les mains fantômes à 0 carte.
    await this.ui('initialHands', { p: s.first });
    // les 2 Légendes de gauche du premier joueur sont épuisées
    const fp = this.P(s.first); fp.legends[0].ready = false; fp.legends[1].ready = false;
    for (let i = 0; i < 2; i++) {
      const p = this.P(i);
      const mull = await this.dec(i).mulligan(this, i);
      if (mull) {
        p.deck.push(...p.hand.splice(0)); this.shuffle(p.deck); await this.draw(i, 6); p.mulliganed = true;
        this.log(`${p.name} fait un mulligan.`);
      }
    }
    s.phase = 'main';
    await this.ui('setupComplete', { p: s.first });
  }

  async startTurn() {
    const s = this.s, i = s.active, p = this.P(i);
    s.turn++;
    s.phase = 'start';
    // prolongation : suivi des tours où les deux fixers sont vides
    const bothEmpty = !this.P(0).fixer.length && !this.P(1).fixer.length;
    s.emptyStreak = bothEmpty ? s.emptyStreak + 1 : 0;
    // 1. condition de victoire
    if (this.gigCount(i) >= 7) throw new GameOver(i, `${p.name} commence son tour avec ${this.gigCount(i)} Gigs !`);
    // 2. effets de début de tour / fin des effets "jusqu'à votre prochain tour"
    for (const u of this.allUnits().concat(this.P(0).legends, this.P(1).legends)) {
      u.mods = u.mods.filter(m => !(m.dur === 'next' && m.pf === i));
      u.grants = u.grants.filter(m => !(m.dur === 'next' && m.pf === i));
    }
    for (const pl of s.players) pl.prules = (pl.prules || []).filter(r => !(r.dur === 'next' && r.pf === i));
    await this.ui('turn', { p: i });
    this.log(`— Tour ${Math.ceil(s.turn / 2)} : ${p.name} —`, 'turn');
    await this.emit('turnStart', { p: i });
    // 3. redresser
    const firstTurnOfFirst = (i === s.first && !s.firstTurnDone[i]);
    if (!firstTurnOfFirst) { for (const l of p.legends) l.ready = true; }
    for (const u of p.field) { if (!this.hasFlag(u, 'noReady')) u.ready = true; }
    for (const e of p.eddies) e.ready = true;
    // 4. pioche
    await this.draw(i, 1);
    // 5. Gig
    await this.rollIn(i);
    s.firstTurnDone[i] = true;
    s.phase = 'main';
  }

  async endTurn() {
    const s = this.s, i = s.active, p = this.P(i);
    s.phase = 'end';
    await this.emit('turnEnd', { p: i });
    for (const pl of s.players) for (const u of pl.field.slice()) if (u.flags.psychoDoom) { this.log(`Cyberpsychose : ${this.name(u)} s'effondre.`); await this.defeat(u, { effect: true }); }
    for (const pl of s.players) {
      for (const u of [...pl.field, ...pl.legends]) {
        u.mods = u.mods.filter(m => m.dur !== 'turn');
        u.grants = u.grants.filter(m => m.dur !== 'turn');
        u.lag = false;
        for (const k of Object.keys(u.flags)) if (k.startsWith('used')) delete u.flags[k];
        for (const gr of u.gear) { gr.mods = gr.mods.filter(m => m.dur !== 'turn'); for (const k of Object.keys(gr.flags)) if (k.startsWith('used')) delete gr.flags[k]; }
      }
      pl.soldThisTurn = false; pl.calledThisTurn = false; pl.tf = {}; pl.prules = (pl.prules || []).filter(r => r.dur !== 'turn');
      for (const u of pl.field) delete u.flags.stoleThisTurn;
    }
    p.turnsTaken++;
    if (!s.overtime && s.emptyStreak >= 2) { s.overtime = true; this.log('⚡ PROLONGATION : le premier joueur à contrôler 7 Gigs gagne immédiatement !', 'turn'); }
    this.checkOT();
    s.active = this.opp(i);
  }

  async mainPhase() {
    const i = this.s.active;
    let guard = 0;
    while (guard++ < 200) {
      const acts = this.legalActions(i);
      const a = await this.dec(i).mainAction(this, i, acts);
      if (!a || a.type === 'end') break;
      await this.doAction(i, a);
      this.checkOT();
    }
  }

  async playTurn() {
    await this.startTurn();
    await this.mainPhase();
    await this.endTurn();
  }

  async run(maxTurns = null) {
    try {
      await this.setup();
      // Le moteur de jeu humain n'a PAS de vainqueur lié à un plafond de tours.
      while (maxTurns == null || this.s.turn < maxTurns) await this.playTurn();
      // Un benchmark peut être interrompu; il ne s'agit jamais d'un GameOver.
      return {status:'incomplete',winner:null,complete:false,
        reason:'Limite de simulation atteinte (aucun vainqueur désigné).',
        turns:this.s.turn};
    } catch (e) {
      if (e instanceof GameOver) { this.s.winner = e.winner; this.s.winReason = e.reason; this.s.phase = 'over'; this.log(e.reason, 'win'); return e; }
      throw e;
    }
  }
}

// ================================================================ DECKS =====
function deckRamLimits(legendIds) {
  const lim = { Red: 0, Yellow: 0, Green: 0, Blue: 0 };
  for (const id of legendIds) { const d = CARDS[id]; if (d && d.ram) lim[d.color] += d.ram; }
  return lim;
}
function validateDeck(deck) {
  const errs = [];
  if (!deck || !Array.isArray(deck.legends) || !Array.isArray(deck.main)) {
    return ['Deck invalide : la liste des cartes ou des Légendes est illisible.'];
  }
  if (deck.legends.length !== 3) errs.push('Il faut exactement 3 Légendes.');
  const names = deck.legends.map(id => CARDS[id]?.name || String(id));
  for (const id of deck.legends) {
    if (!CARDS[id] || CARDS[id].type !== 'Legend') errs.push('Légende inconnue ou invalide : ' + String(id).slice(0, 80));
  }
  if (new Set(names).size !== names.length) errs.push('Deux Légendes ne peuvent pas porter le même nom.');
  if (deck.main.length < 40 || deck.main.length > 50) errs.push(`Le deck principal doit contenir 40 à 50 cartes (actuellement ${deck.main.length}).`);
  const cnt = {};
  for (const id of deck.main) cnt[id] = (cnt[id] || 0) + 1;
  for (const [id,n] of Object.entries(cnt)) {
    if (!CARDS[id] || CARDS[id].type === 'Legend') {
      errs.push('Carte inconnue ou invalide dans le deck : ' + String(id).slice(0, 80));
      continue;
    }
    if (n > 3) errs.push(`Max 3 exemplaires : ${CARDS[id].name}.`);
  }
  const lim = deckRamLimits(deck.legends);
  for (const id of Object.keys(cnt)) {
    const d = CARDS[id];
    if (d && (d.ram || 0) > lim[d.color]) errs.push(`RAM insuffisante pour ${d.name}${d.sub ? ' — ' + d.sub : ''} (${COLOR_FR[d.color]} ${d.ram} > ${lim[d.color]}).`);
  }
  return errs;
}
const COLOR_FR = { Red: 'Rouge', Yellow: 'Jaune', Green: 'Vert', Blue: 'Bleu' };
const TYPE_FR = { Legend: 'Légende', Unit: 'Unité', Gear: 'Équipement', Program: 'Programme' };

const ENGINE_API = { Game, GameOver, CARDS, DICE_ORDER, validateDeck, deckRamLimits, COLOR_FR, TYPE_FR, clamp0, scVal };
if (typeof module !== 'undefined') module.exports = ENGINE_API; else Object.assign(globalThis, ENGINE_API);

// ============================================================================
//  LES 150 CARTES JOUABLES — textes FR + implémentation des effets
//  Jetons : [JEU] [ATTAQUE] [APPEL] [VAINCU] [RAPIDE] [SOLO] [BLOQUEUR]
//           [ADRÉNALINE] [⟳] = épuiser cette carte, €$ = Eddies, ☆ = Street Cred
// ============================================================================
'use strict';
(function (root) {
const E = (typeof module !== 'undefined') ? require('./engine.js') : root;
const CARDS = E.CARDS;

// ------------------------------------------------------------ utilitaires --
const opp = (g, i) => g.opp(i);
const rU = (g, i) => g.P(g.opp(i)).field;
const fU = (g, i) => g.P(i).field;
const tags = (g, u) => g.def(u).tags || [];
const hasTag = (g, u, t) => tags(g, u).includes(t);
function val(g, u) {
  const d = g.def(u);
  return g.eff(u) + (d.cost ?? 4) * 0.6 + (d.type === 'Legend' ? 3 : 0) + u.gear.length * 1.5 + (g.hasKw(u, 'BLOCKER') ? 1 : 0) + (d.aiValue || 0);
}
function inFight(g, u) { const A = g.s.attack; return !!(A && (A.attacker === u.uid || (A.target.kind === 'unit' && A.target.uid === u.uid))); }
const gigs8 = (g, i) => g.P(i).gigs.filter(d => d.value >= 8).length;
const minGigs = (g, i) => g.P(i).gigs.filter(d => d.value === 1).length;
const scEven = (g, i) => { const s = g.sc(i); return s !== null && s % 2 === 0; };
const distinctVals = (g, i) => new Set(g.P(i).gigs.map(d => d.value)).size;
const friendlyGigValue = (g, i, v) => g.P(i).gigs.some(d => d.value === v);
const faceUpCount = (g, i) => g.P(i).legends.filter(l => l.faceUp).length + g.P(i).field.filter(u => g.isLegend(u)).length;

async function defeatPick(g, i, pool, title, opt = {}) {
  if (!pool.length) return null;
  const u = await g.pickUnit(i, title, pool, x => (g.controllerOf(x) === i ? -val(g, x) : val(g, x)), opt);
  if (u) await g.defeat(u, { effect: true, p: i });
  return u;
}
async function spendPick(g, i, pool, title, opt = {}) {
  pool = pool.filter(u => u.ready);
  if (!pool.length) return null;
  const u = await g.pickUnit(i, title, pool, x => val(g, x), opt);
  if (u) { await g.spendUnit(u); g.log(`${g.name(u)} est épuisé.`); }
  return u;
}
async function buffPick(g, i, n, title, pool, dur = 'turn', opt = {}) {
  pool = pool || fU(g, i);
  if (!pool.length) return null;
  const u = await g.pickUnit(i, title, pool, x => (inFight(g, x) ? 20 : 0) + (g.canAttackNow(x) ? 5 : 0) + g.eff(x) * 0.1, opt);
  if (u) { g.buff(u, n, dur, i); g.log(`${g.name(u)} : ${n >= 0 ? '+' : ''}${n} de puissance.`); }
  return u;
}
async function debuffPick(g, i, n, title, opt = {}) {
  const pool = rU(g, i);
  if (!pool.length) return null;
  const u = await g.pickUnit(i, title, pool, x => (inFight(g, x) ? 20 : 0) + val(g, x) * 0.2, opt);
  if (u) { g.buff(u, -n, 'turn', i); g.log(`${g.name(u)} : -${n} de puissance.`); }
  return u;
}
async function bottomPick(g, i, pool, title, opt = {}) {
  if (!pool.length) return null;
  const u = await g.pickUnit(i, title, pool, x => (g.controllerOf(x) === i ? -val(g, x) : val(g, x)), opt);
  if (u) await g.bottomDeckUnit(u);
  return u;
}
// chercher dans les n cartes du dessus
async function searchTop(g, i, n, filter, maxPick, title, rest = 'bottom', minPick = 0) {
  const p = g.P(i);
  const top = p.deck.splice(0, Math.min(n, p.deck.length));
  if (!top.length) return [];
  const ok = top.filter(c => filter(g.def(c), c));
  let picked = [];
  if (ok.length && maxPick > 0) picked = await g.pickCards(i, title, ok, Math.min(minPick, ok.length), Math.min(maxPick, ok.length), c => g.cardValue(c, i), { revealCards: top });
  for (const c of picked) p.hand.push(c);
  const others = top.filter(c => !picked.includes(c));
  if (picked.length) g.log(`${p.name} ajoute ${picked.map(c => g.name(c)).join(', ')} à sa main.`);
  if (rest === 'bottom') g.bottomDeck(i, others); else if (rest === 'trash') p.trash.push(...others); else p.deck.unshift(...others);
  return picked;
}
async function trashThenTake(g, i, n, filter, title) {
  const cs = g.trashTop(i, n);
  const ok = cs.filter(c => filter(g.def(c)));
  if (!ok.length) return null;
  const c = (await g.pickCards(i, title, ok, 1, 1, x => g.cardValue(x, i)))[0];
  if (c) { g.P(i).trash.splice(g.P(i).trash.indexOf(c), 1); g.P(i).hand.push(c); g.log(`${g.pname(i)} récupère ${g.name(c)}.`); }
  return c;
}
async function fromTrashToHand(g, i, filter, title, optional = true) {
  const p = g.P(i), pool = p.trash.filter(c => filter(g.def(c), c));
  if (!pool.length) return null;
  const c = (await g.pickCards(i, title, pool, optional ? 0 : 1, 1, x => g.cardValue(x, i)))[0];
  if (c) { p.trash.splice(p.trash.indexOf(c), 1); p.hand.push(c); g.log(`${p.name} reprend ${g.name(c)} de son rebut.`); }
  return c;
}
async function playFreeFrom(g, i, pool, title, opt = {}) {
  if (!pool.length) return null;
  const c = (await g.pickCards(i, title, pool, 0, 1, x => g.cardValue(x, i)))[0];
  if (!c) return null;
  const zone = g.P(i).hand.includes(c) ? g.P(i).hand : g.P(i).trash;
  await g.playCard(i, c.uid, opt.host, { free: true, from: zone, rushUnits: opt.rushUnits, bottomAfter: opt.bottomAfter });
  return c;
}
async function pickMode(g, i, title, modes) { // modes: [{label, score, run}]
  const v = await g.pickOne(i, title, modes.map((m, k) => ({ label: m.label, value: k, score: m.score })));
  if (v === null) return;
  await modes[v].run();
}
async function increaseUpTo(g, i, X, title) { return await g.adjustUpTo(i, X, { dir: 1, title: title || `Augmentez un Gig de ${X} maximum` }); }
async function decreaseUpTo(g, i, X, title, whose) { return await g.adjustUpTo(i, X, { dir: -1, whose, title: title || `Diminuez un Gig de ${X} maximum` }); }
async function rivalDiscards(g, i, n = 1) { return await g.discard(g.opp(i), n, `Votre Rival vous fait défausser ${n} carte(s)`); }
async function setGigToOther(g, i, title) {
  const all = [...g.P(i).gigs, ...g.P(g.opp(i)).gigs];
  const options = [];
  for (const a of all) for (const b of all) if (a !== b && b.value !== a.value && b.value <= a.sides) {
    const mine = g.P(i).gigs.includes(a);
    const pairBonus = mine && g.P(i).gigs.some(x => x !== a && x.value === b.value) ? 3 : 0;
    options.push({ label: `${mine ? 'Votre' : 'Adverse'} d${a.sides} (${a.value}) → ${b.value}`, value: `${a.uid}:${b.value}`, gig: a, score: (mine ? 1 : -1) * (b.value - a.value) * 0.5 + pairBonus });
  }
  if (!options.length) return null;
  const v = await g.pickOne(i, title || 'Réglez un Gig sur la valeur d\'un autre Gig', options, { optional: true });
  if (!v) return null;
  const [uid, nv] = v.split(':').map(Number);
  const d = all.find(x => x.uid === uid);
  await g.setGig(d, nv, i);
  return d;
}
async function swapPick(g, i) {
  const mine = g.P(i).gigs, theirs = g.P(g.opp(i)).gigs;
  if (!mine.length || !theirs.length) return false;
  const a = await g.pickGig(i, 'Votre Gig à échanger', mine, d => -d.value);
  const b = await g.pickGig(i, 'Gig adverse à prendre', theirs, d => d.value);
  if (a && b) { await g.swapGigs(a, b); await g.emit('gigSwapped', { p: i, a, b }); return true; }
  return false;
}

// --------------------------------------------------------------- fabrique --
function C(id, name, sub, type, color, cost, ram, power, tg, kw, txt, impl = {}) {
  CARDS[id] = Object.assign({ id, name, sub, type, color, cost, ram, power, tags: tg ? tg.split('|') : [], kw: kw || [], txt, sell: type === 'Program' || type === 'Gear' || type === 'Legend' || id === 'mt0d12-flathead' }, impl);
}
const L = 'Legend', U = 'Unit', G = 'Gear', P = 'Program';
const R = 'Red', Y = 'Yellow', V = 'Green', B = 'Blue';

// =============================================================== ROUGE =====
C('adam-smasher-ender-of-legends', 'Adam Smasher', 'Ender of Legends', L, R, 9, 2, 9, 'ARASAKA|MERC', ['GO_SOLO'],
  '[SOLO]\n[JEU] Vainquez une Unité rivale.',
  { onPlay: async (g, u, i) => { await defeatPick(g, i, rU(g, i), 'Adam Smasher : vainquez une Unité rivale'); }, aiValue: 3 });
C('dexter-deshawn-off-the-grid', 'Dexter DeShawn', 'Off the Grid', L, R, null, 2, null, 'FIXER', [],
  '[APPEL] Choisissez : une Unité amie gagne +2 de puissance ce tour ; ou piochez 1.\n[⟳] : Augmentez un Gig de 2 maximum.',
  { onCall: async (g, l, i) => pickMode(g, i, 'Dexter DeShawn : choisissez', [
      { label: 'Une Unité amie gagne +2 ce tour', score: fU(g, i).length ? 1 : -1, run: () => buffPick(g, i, 2, '+2 de puissance à…') },
      { label: 'Piochez 1', score: 0.5, run: () => g.draw(i, 1) }]),
    abilities: [{ label: 'Augmenter un Gig (2 max)', spend: true, cost: 0, run: async (g, l, i) => { await increaseUpTo(g, i, 2); } }] });
C('johnny-silverhand-rocking-renegade', 'Johnny Silverhand', 'Rocking Renegade', L, R, null, 2, null, 'MERC|ROCKER|SAMURAI', [],
  '2 €$, [⟳] : Une Unité amie peut attaquer des Unités rivales épuisées le tour où elle est jouée. Si c\'est une Unité ROCKER, elle gagne aussi +2 ce tour. Coûte -1 €$ par Gig ami de valeur 8+.',
  { abilities: [{ label: 'Rocking Renegade', spend: true, cost: (g, l, i) => 2 - gigs8(g, i),
      cond: (g, l, i) => fU(g, i).some(u => u.lag),
      run: async (g, l, i) => {
        const u = await g.pickUnit(i, 'Unité jouée ce tour qui pourra attaquer', fU(g, i).filter(x => x.lag), x => g.eff(x));
        if (u) { g.flag(u, 'rushUnits', 'turn', i); if (hasTag(g, u, 'ROCKER')) g.buff(u, 2, 'turn', i); g.log(`${g.name(u)} peut attaquer des Unités dès ce tour.`); }
      } }] });
C('royce-psycho-on-the-edge', 'Royce', 'Psycho on the Edge', L, R, 6, 2, 6, 'MAELSTROM|GANGER', ['GO_SOLO'],
  '[SOLO]\nPendant votre tour, cette Légende a +2 de puissance par Équipement qui lui est attaché.',
  { selfPower: (g, u) => (g.s.active === g.controllerOf(u) ? 2 * u.gear.length : 0) });
C('v-streetkid', 'V', 'Streetkid', L, R, 5, 2, 6, 'MERC', ['GO_SOLO'],
  '[APPEL] Mettez au rebut les 3 cartes du dessus de votre deck. Puis ajoutez 1 Programme BRAINDANCE de votre rebut à votre main.\n[SOLO]',
  { onCall: async (g, l, i) => { g.trashTop(i, 3); await fromTrashToHand(g, i, d => d.type === 'Program' && d.tags.includes('BRAINDANCE'), 'Programme BRAINDANCE à reprendre', false); } });
C('6th-street-recruits', '6th Street Recruits', null, U, R, 4, 1, 6, '6TH STREET|GANGER', [],
  'Quand une Unité amie vole un d6, augmentez un Gig de 6 maximum.',
  { on: { steal: async (g, self, d) => { if (d.p !== g.controllerOf(self)) return; for (const die of d.gigs) if (die.sides === 6) await increaseUpTo(g, d.p, 6); } } });
C('animals-wrecker', 'Animals Wrecker', null, U, R, 6, 3, 10, 'ANIMAL|GANGER', [], '');
C('chrome-fang', 'Chrome Fang', null, U, R, 5, 1, 6, 'GANGER|NETRUNNER|TYGER CLAWS', [],
  '[JEU] Jusqu\'à votre prochain tour, les Unités rivales ne peuvent pas voler de Gigs amis de valeur supérieure à leur puissance.',
  { onPlay: async (g, u, i) => { g.P(i).prules.push({ kind: 'chromeFang', dur: 'next', pf: i }); g.log('Chrome Fang protège vos Gigs de forte valeur.'); } });
C('el-sombrero-n-la-venganza-lenta', 'El Sombrerón', 'La Venganza Lenta', U, R, 5, 4, 4, 'GANGER|VALENTINO', [],
  '[ATTAQUE] Vous pouvez payer 2 €$. Si vous le faites, cette Unité gagne ce tour une puissance égale à la valeur d\'un Gig maximum ami.',
  { onAttack: async (g, u, i) => {
      const mx = g.P(i).gigs.filter(d => g.isMaxGig(d)).map(d => d.value);
      if (!mx.length || g.avail(i) < 2) return;
      const v = Math.max(...mx);
      if (await g.yesNo(i, `El Sombrerón : payer 2 €$ pour +${v} ?`, v >= 4)) { if (await g.pay(i, 2)) { g.buff(u, v, 'turn', i); g.log(`El Sombrerón gagne +${v}.`); } }
    } });
C('japantown-jonin', 'Japantown Jonin', null, U, R, 2, 2, 0, 'TYGER CLAWS', [],
  '[JEU] Une Unité amie gagne +2 de puissance ce tour.\n(Une Unité à 0 de puissance ne vole pas de Gigs.)',
  { onPlay: async (g, u, i) => { await buffPick(g, i, 2, 'Japantown Jonin : +2 à…'); } });
C('johnny-silverhand-never-stop-fighting', 'Johnny Silverhand', 'Never Stop Fighting', U, R, 6, 2, 8, 'MERC|ROCKER|SAMURAI', [],
  'La première fois que cette Unité gagne un combat à chaque tour, redressez-la.\nCette Unité gagne tous ses combats contre les Unités CORPO.',
  { winsFight: (g, u, o) => hasTag(g, o, 'CORPO'),
    onWinFight: async (g, u) => { if (!u.flags.usedJohnny) { u.flags.usedJohnny = true; u.ready = true; g.log('Johnny Silverhand se redresse !'); } }, aiValue: 2 });
C('kerry-eurodyne-the-last-rockerboy', 'Kerry Eurodyne', 'The Last Rockerboy', U, R, 4, 1, 5, 'ROCKER|SAMURAI', [],
  '[⟳] : Si vous contrôlez un Gig de valeur 8+, piochez 2.',
  { abilities: [{ label: 'Piocher 2', spend: true, cost: 0, cond: (g, u, i) => gigs8(g, i) > 0, run: async (g, u, i) => { if (gigs8(g, i)) await g.draw(i, 2); } }] });
C('la-llorona-ghost-of-the-past', 'La Llorona', 'Ghost of the Past', U, R, 3, 1, 3, 'GANGER|VALENTINO', ['BLOCKER'],
  '[BLOQUEUR]\nQuand cette Unité utilise BLOQUEUR, augmentez un Gig de 3 maximum.',
  { on: { blocked: async (g, self, d) => { if (d.blocker === self) await increaseUpTo(g, g.controllerOf(self), 3); } } });
C('meredith-stout-stone-cold-corpo', 'Meredith Stout', 'Stone Cold Corpo', U, R, 4, 1, 5, 'CORPO|MILITECH', ['BLOCKER'],
  '[BLOQUEUR]\nCette Unité a +2 de puissance lorsqu\'elle combat une Légende.\nQuand un Rival ajuste ou échange 1 ou plusieurs de vos Gigs, vous pouvez ajouter une carte de votre rebut à votre main.',
  { selfPower: (g, u, ctx) => (ctx.fight && ctx.vs && g.isLegend(ctx.vs) ? 2 : 0),
    on: { gigAdjusted: async (g, self, d) => { const me = g.controllerOf(self); if (d.by === g.opp(me) && g.P(me).gigs.includes(d.die)) await fromTrashToHand(g, me, () => true, 'Meredith Stout : reprendre une carte du rebut'); },
          gigSwapped: async (g, self, d) => { const me = g.controllerOf(self); if (d.p === g.opp(me)) await fromTrashToHand(g, me, () => true, 'Meredith Stout : reprendre une carte du rebut'); } } });
C('octant', 'Octant', null, U, R, 7, 4, 8, 'DRONE|MILITECH|ZETATECH', [],
  'Jouez cette Unité pour -1 €$ par Gig ami de valeur 8+ (minimum 1 €$).',
  { discount: (g, c, i) => Math.min(gigs8(g, i), 6) });
C('royce-don-t-call-me-simon', 'Royce', 'Don\'t Call Me Simon', U, R, 5, 2, 4, 'GANGER|MAELSTROM', [],
  '[JEU] Vainquez une Unité rivale de puissance 2 ou moins. Si vous avez plus de ☆ qu\'un Rival, vainquez à la place une Unité rivale de puissance 3 ou moins.',
  { onPlay: async (g, u, i) => { const lim = g.moreSC(i) ? 3 : 2; await defeatPick(g, i, rU(g, i).filter(x => g.eff(x) <= lim), `Royce : vainquez une Unité rivale (puissance ≤ ${lim})`); } });
C('ruthless-lowlife', 'Ruthless Lowlife', null, U, R, 2, 1, 4, 'GANGER|MAELSTROM', [],
  'Cette Unité ne peut attaquer que des Unités rivales.',
  { cantAttackGigs: () => true });
C('screw-lovelorn-fool', 'Screw', 'Lovelorn Fool', U, R, 5, 2, 7, 'GANGER|MAELSTROM', [],
  '[VAINCU] Ajoutez une autre Unité de votre rebut à votre main.',
  { onDefeated: async (g, u, i) => { await fromTrashToHand(g, i, (d, c) => d.type === 'Unit' && c.uid !== u.uid, 'Screw : Unité à reprendre', false); } });
C('swordwise-huscle', 'Swordwise Huscle', null, U, R, 3, 2, 3, 'MERC', [],
  '[ATTAQUE] Si cette Unité a 5 de puissance ou plus, piochez 1.',
  { onAttack: async (g, u, i) => { if (g.eff(u) >= 5) await g.draw(i, 1); } });
C('v-roamer-of-the-badlands', 'V', 'Roamer of the Badlands', U, R, 5, 2, 6, 'MERC|NOMAD', [],
  'Quand cette Unité vole un Gig, augmentez ce Gig de 5 maximum.\nÀ la fin de votre tour, si vous contrôlez 2 Gigs ou plus de valeur 8+, piochez 1.',
  { onSteal: async (g, u, i, gigs) => { for (const die of gigs) await g.adjustUpTo(i, 5, { pool: [die], dir: 1, title: 'V : augmentez le Gig volé (5 max)' }); },
    on: { turnEnd: async (g, self, d) => { const i = g.controllerOf(self); if (d.p === i && gigs8(g, i) >= 2) await g.draw(i, 1); } }, aiValue: 1 });
C('valentino-guerrera', 'Valentino Guerrera', null, U, R, 3, 2, 4, 'GANGER|VALENTINO', [],
  'Si vous avez plus de ☆ qu\'un Rival, cette Unité peut attaquer des Unités prêtes ayant BLOQUEUR.',
  { canAttackReady: (g, u, t) => g.moreSC(g.controllerOf(u)) && g.hasKw(t, 'BLOCKER') });
C('yorinobu-arasaka-steel-dragon', 'Yorinobu Arasaka', 'Steel Dragon', U, R, 7, 3, 9, 'ARASAKA|CORPO', [],
  '[JEU] Vous pouvez jouer gratuitement une Unité de coût 4 ou moins depuis votre main ou votre rebut. Elle peut attaquer des Unités rivales ce tour.\nLa première fois qu\'une Unité ARASAKA est vaincue à chaque tour, piochez 1.',
  { onPlay: async (g, u, i) => { const p = g.P(i); await playFreeFrom(g, i, [...p.hand, ...p.trash].filter(c => g.def(c).type === 'Unit' && (g.def(c).cost ?? 99) <= 4), 'Yorinobu : Unité gratuite (coût ≤ 4)', { rushUnits: true }); },
    on: { defeated: async (g, self, d) => {
      // Only the *first* ARASAKA defeat of the whole game turn counts.
      // The event is not restricted to friendly Units (printed text).
      if (d.firstArasakaDefeat) await g.draw(g.controllerOf(self), 1);
    } }, aiValue: 2 });
C('arasaka-emergency-radioport', 'Arasaka Emergency Radioport', null, G, R, 2, 2, 2, 'ARASAKA|CYBERWARE', [],
  'Équipement.\nQuand cette Unité ou Légende est épuisée, vous pouvez regarder une de vos Légendes face cachée. Si elle est ARASAKA ou a EN SOLO, vous pouvez l\'Appeler gratuitement (un seul Appel par tour).',
  { on: { spent: async (g, self, d, src) => {
      if (!src.host || d.inst !== src.host) return;
      const i = g.controllerOf(src.host); const p = g.P(i);
      const fd = p.legends.filter(l => !l.faceUp); if (!fd.length) return;
      if (!(await g.yesNo(i, 'Radioport : regarder une Légende face cachée ?', true))) return;
      const l = await g.pickFaceDownLegend(i, 'Radioport : choisissez une Légende face cachée',
        x => (g.def(x).tags.includes('ARASAKA') || (g.def(x).kw || []).includes('GO_SOLO') ? 2 : 0));
      if (!l) return;
      const ld = g.def(l);
      l.known = true;
      await g.ui('peek', { p: i, inst: l });
      if (!p.calledThisTurn && (ld.tags.includes('ARASAKA') || (ld.kw || []).includes('GO_SOLO')) && await g.yesNo(i, `Appeler ${g.name(l)} gratuitement ?`, true)) await g.callFree(i, l);
    } } });
C('deadman-transmitter', 'Deadman Transmitter', null, G, R, 3, 3, 1, 'CYBERWARE|TRAUMA TEAM', [],
  'Équipement.\nSi cette Unité devait être vaincue, vainquez cet ÉMETTEUR DEADMAN à la place.',
  { hostPreventDefeat: async (g, gr, host) => { const k = host.gear.indexOf(gr); if (k < 0) return false; host.gear.splice(k, 1); g.P(gr.owner).trash.push(gr); g.log(`Deadman Transmitter est détruit à la place de ${g.name(host)} !`); return true; } });
C('mantis-blades', 'Mantis Blades', null, G, R, 1, 1, 2, 'CYBERWARE', [], 'Équipement.');
C('satori-sword-of-saburo', 'Satori', 'Sword of Saburo', G, R, 2, 1, 2, 'ARASAKA|WEAPON', [],
  'Équipement.\nQuand cette Unité gagne un combat contre une Unité rivale, piochez 1.',
  { onHostWinFight: async (g, gr, host) => { await g.draw(g.controllerOf(host), 1); } });
C('all-is-lost', 'All is Lost', null, P, R, 1, 2, null, 'ZETATECH', [],
  'Mettez au rebut les 3 cartes du dessus de votre deck. Ajoutez une Unité parmi elles à votre main.',
  { onPlay: async (g, c, i) => { await trashThenTake(g, i, 3, d => d.type === 'Unit', 'All is Lost : Unité à prendre'); } });
C('appetite-for-destruction', 'Appetite for Destruction', null, P, R, 3, 4, null, 'GANGER', [],
  'La prochaine fois ce tour qu\'une Unité amie gagne un combat avec 3+ de puissance d\'écart, elle vole aussi un Gig.',
  { onPlay: async (g, c, i) => { g.P(i).tf.appetite = true; } });
C('bonnie-and-clyde', 'Bonnie and Clyde', null, P, R, 3, 3, null, 'BRAINDANCE', [],
  'Vainquez une Unité rivale de puissance 4 ou moins. Si un Rival contrôle au moins 2 Gigs de plus que vous, vous pouvez en vaincre 2 à la place.',
  { canPlay: (g, i) => rU(g, i).some(x => g.eff(x) <= 4),
    onPlay: async (g, c, i) => { const n = g.gigCount(g.opp(i)) >= g.gigCount(i) + 2 ? 2 : 1; for (let k = 0; k < n; k++) await defeatPick(g, i, rU(g, i).filter(x => g.eff(x) <= 4), 'Bonnie and Clyde : vainquez (puissance ≤ 4)', { optional: k > 0 }); } });
C('carnage-at-the-colosseum', 'Carnage at the Colosseum', null, P, R, 6, 3, null, 'BRAINDANCE|EXTREME', [],
  'Jouez ce Programme pour -1 €$ par Gig ami de valeur 8+ (minimum 1 €$).\nVainquez une Unité rivale ayant moins de puissance qu\'une Unité amie.',
  { discount: (g, c, i) => Math.min(gigs8(g, i), 5),
    canPlay: (g, i) => fU(g, i).length && rU(g, i).some(x => g.eff(x) < Math.max(...fU(g, i).map(u => g.eff(u)))),
    onPlay: async (g, c, i) => { const mx = fU(g, i).length ? Math.max(...fU(g, i).map(u => g.eff(u))) : -1; await defeatPick(g, i, rU(g, i).filter(x => g.eff(x) < mx), 'Carnage : vainquez une Unité rivale'); } });
C('detonate', 'Detonate', null, P, R, 1, 2, null, 'QUICKHACK', [],
  '[RAPIDE] Vainquez un Équipement rival de puissance 2 ou moins.',
  { quick: true, canPlay: (g, i) => rU(g, i).some(u => u.gear.some(x => (g.def(x).power ?? 0) <= 2)) || g.P(g.opp(i)).legends.some(l => l.gear.some(x => (g.def(x).power ?? 0) <= 2)),
    onPlay: async (g, c, i) => {
      const hosts = [...rU(g, i), ...g.P(g.opp(i)).legends];
      const opts = []; for (const h of hosts) for (const x of h.gear) if ((g.def(x).power ?? 0) <= 2) opts.push({ label: `${g.name(x)} (sur ${g.name(h)})`, value: x.uid, card: x, score: (g.def(x).cost ?? 1) + (inFight(g, h) ? 5 : 0) });
      const uid = await g.pickOne(i, 'Detonate : Équipement à détruire', opts);
      if (uid) { const x = g.byUid(uid); const w = g.where(uid); if (w && w.zone === 'gear') { w.host.gear.splice(w.idx, 1); g.P(x.owner).trash.push(x); g.log(`${g.name(x)} est détruit.`); } }
    } });
C('gunpoint-diplomacy', 'Gunpoint Diplomacy', null, P, R, 4, 3, null, 'GANGER|PLAN', [],
  'Une Unité amie reçoit : (1) la prochaine fois qu\'elle attaque ce tour, elle peut attaquer des Unités prêtes ; (2) +3 de puissance ce tour. Si vous avez moins de ☆ qu\'un Rival, il choisit un seul de ces effets pour vous.',
  { canPlay: (g, i) => fU(g, i).length > 0,
    onPlay: async (g, c, i) => {
      const u = await g.pickUnit(i, 'Gunpoint Diplomacy : Unité amie', fU(g, i), x => (g.canAttackNow(x) ? 5 : 0) + g.eff(x));
      if (!u) return;
      let both = !g.lessSC(i), pick = null;
      if (!both) pick = await g.pickOne(g.opp(i), 'Gunpoint Diplomacy : choisissez l\'effet que reçoit l\'Unité rivale', [{ label: 'Peut attaquer des Unités prêtes', value: 1, score: rU(g, i).filter(x => x.ready).length ? 0 : 1 }, { label: '+3 de puissance ce tour', value: 2, score: 0.5 }]);
      if (both || pick === 1) g.flag(u, 'attackReady', 'turn', i);
      if (both || pick === 2) g.buff(u, 3, 'turn', i);
      g.log(`${g.name(u)} est armé par Gunpoint Diplomacy.`);
    } });
C('industrial-assembly', 'Industrial Assembly', null, P, R, 1, 1, null, 'ARASAKA|BRAINDANCE', [],
  'Augmentez un Gig de 4 maximum. Si vous contrôlez un Gig de valeur 8+, piochez 1.',
  { onPlay: async (g, c, i) => { await increaseUpTo(g, i, 4); if (gigs8(g, i)) await g.draw(i, 1); } });
C('over-the-edge', 'Over the Edge', null, P, R, 3, 2, null, 'MERC', [],
  'Vainquez une Unité de puissance inférieure ou égale à la valeur d\'un d20 ami.',
  { canPlay: (g, i) => g.P(i).gigs.some(d => d.sides === 20),
    onPlay: async (g, c, i) => { const d20 = g.P(i).gigs.filter(d => d.sides === 20); if (!d20.length) return; const lim = Math.max(...d20.map(d => d.value)); await defeatPick(g, i, g.allUnits().filter(x => g.eff(x) <= lim), `Over the Edge : vainquez une Unité (puissance ≤ ${lim})`); } });
C('shattered-memories', 'Shattered Memories', null, P, R, 4, 2, null, 'BRAINDANCE', [],
  'Chaque joueur défausse sa main et peut piocher 5. Si le nombre total de cartes défaussées est égal à la valeur d\'un Gig ami, piochez 2.',
  { onPlay: async (g, c, i) => {
      let total = 0;
      for (const k of [i, g.opp(i)]) { const p = g.P(k); total += p.hand.length; p.trash.push(...p.hand.splice(0)); }
      g.log(`Shattered Memories : ${total} cartes défaussées.`);
      for (const k of [i, g.opp(i)]) { if (await g.yesNo(k, 'Shattered Memories : piocher 5 ?', g.P(k).deck.length > 8)) await g.draw(k, 5); }
      if (friendlyGigValue(g, i, total)) await g.draw(i, 2);
    } });
C('yorinobu-arasaka-embracing-destruction', 'Yorinobu Arasaka', 'Embracing Destruction', L, R, null, 2, null, 'ARASAKA|CORPO', [],
  'La première fois qu\'une Unité ARASAKA amie attaque à chaque tour, piochez 1, puis si vous avez moins de 20 ☆, défaussez 1.',
  { on: { attack: async (g, self, d) => { const i = g.controllerOf(self); if (d.p !== i || !hasTag(g, d.attacker, 'ARASAKA') || g.P(i).tf.yoriDraw) return; g.P(i).tf.yoriDraw = true; await g.draw(i, 1); if (scVal(g.sc(i)) < 20) await g.discard(i, 1); } } });
C('minotaur', 'Minotaur', null, U, R, 7, 2, 9, 'ARASAKA|DRONE|MILITECH', [],
  '[JEU] Si vous avez plus de ☆ qu\'un Rival, vainquez une Unité rivale de puissance 5 ou moins.',
  { onPlay: async (g, u, i) => { if (g.moreSC(i)) await defeatPick(g, i, rU(g, i).filter(x => g.eff(x) <= 5), 'Minotaur : vainquez (puissance ≤ 5)'); } });

// =============================================================== JAUNE =====
C('dum-dum-maelstrom-triggerman', 'Dum Dum', 'Maelstrom Triggerman', L, Y, null, 2, null, 'GANGER|MAELSTROM', [],
  '[APPEL] Vous pouvez vaincre un de vos Équipements. Si vous le faites, piochez 2. Sinon, piochez 1.\n[RAPIDE] 1 €$, [⟳] : Une Unité amie gagne +1 de puissance ce tour par Équipement qui lui est attaché.',
  { onCall: async (g, l, i) => {
      const gears = []; for (const h of g.gearHosts(i)) for (const x of h.gear) gears.push({ label: `${g.name(x)} (sur ${g.name(h)})`, value: x.uid, card: x, score: -(g.def(x).cost ?? 1) });
      let n = 1;
      if (gears.length) { const uid = await g.pickOne(i, 'Dum Dum : vaincre un Équipement ami ? (pioche 2)', gears, { optional: true, aiPass: true }); if (uid) { const w = g.where(uid); w.host.gear.splice(w.idx, 1); g.P(w.inst.owner).trash.push(w.inst); g.log(`${g.name(w.inst)} est sacrifié.`); n = 2; } }
      await g.draw(i, n);
    },
    abilities: [{ label: '+1 par Équipement', quick: true, spend: true, cost: 1, cond: (g, l, i) => fU(g, i).some(u => u.gear.length),
      run: async (g, l, i) => { const u = await g.pickUnit(i, 'Dum Dum : Unité amie équipée', fU(g, i).filter(x => x.gear.length), x => (inFight(g, x) ? 20 : 0) + x.gear.length); if (u) { g.buff(u, u.gear.length, 'turn', i); g.log(`${g.name(u)} gagne +${u.gear.length}.`); } } }] });
C('kerry-eurodyne-axe-attitude-audience', 'Kerry Eurodyne', 'Axe, Attitude, Audience', L, Y, null, 2, null, 'ROCKER|SAMURAI', [],
  'Quand vous lancez un Gig depuis votre zone Fixer, vous pouvez ignorer le résultat et le relancer une fois.\nQuand vous obtenez la valeur minimum ou maximum sur un Gig, piochez 1 (3 si c\'est un d20).',
  { mayReroll: async (g, l, i, die) => { return await g.yesNo(i, `Kerry : relancer le d${die.sides} (${die.value}) ?`, die.value < die.sides / 2); },
    on: { gigRolled: async (g, self, d) => { if (d.p !== g.controllerOf(self)) return; if (d.die.value === 1 || d.die.value === d.die.sides) await g.draw(d.p, d.die.sides === 20 ? 3 : 1); } } });
C('muamar-reyes-el-capita-n', 'Muamar Reyes', 'El Capitán', L, Y, null, 2, null, 'FIXER', [],
  '[APPEL] Choisissez : une Unité amie ne peut pas être vaincue en combat ce tour ; ou piochez 1.\n[⟳] : Ajustez un Gig de 1.',
  { onCall: async (g, l, i) => pickMode(g, i, 'Muamar Reyes : choisissez', [
      { label: 'Une Unité amie ne peut pas être vaincue en combat ce tour', score: fU(g, i).some(u => inFight(g, u)) ? 2 : -1, run: async () => { const u = await g.pickUnit(i, 'Unité protégée', fU(g, i), x => (inFight(g, x) ? 20 : 0) + val(g, x)); if (u) g.flag(u, 'noFightDefeat', 'turn', i); } },
      { label: 'Piochez 1', score: 0.5, run: () => g.draw(i, 1) }]),
    abilities: [{ label: 'Ajuster un Gig de 1', spend: true, cost: 0, run: async (g, l, i) => {
      const all = [...g.P(i).gigs, ...g.P(g.opp(i)).gigs], opts = [];
      for (const d of all) for (const dir of [1, -1]) { const nv = d.value + dir; if (nv < 1 || nv > d.sides) continue; const mine = g.P(i).gigs.includes(d); opts.push({ label: `${mine ? 'Votre' : 'Adverse'} d${d.sides} : ${d.value} → ${nv}`, value: `${d.uid}:${nv}`, gig: d, score: (mine ? 1 : -1) * dir }); }
      const v = await g.pickOne(i, 'Ajustez un Gig de 1', opts); if (!v) return; const [uid, nv] = v.split(':').map(Number); await g.setGig(all.find(x => x.uid === uid), nv, i);
    } }] });
C('river-ward-detective-on-the-hunt', 'River Ward', 'Detective on the Hunt', L, Y, null, 2, null, 'NCPD', [],
  '[RAPIDE] [⟳] : Jouez gratuitement un Équipement de coût 2 ou moins depuis votre main.\nQuand une Unité amie équipée est vaincue, regardez les 2 cartes du dessus de votre deck et mettez-en 1 au rebut.',
  { abilities: [{ label: 'Équipement gratuit (≤ 2)', quick: true, spend: true, cost: 0, cond: (g, l, i) => g.gearHosts(i).length && g.P(i).hand.some(c => g.def(c).type === 'Gear' && (g.def(c).cost ?? 9) <= 2),
      run: async (g, l, i) => { await playFreeFrom(g, i, g.P(i).hand.filter(c => g.def(c).type === 'Gear' && (g.def(c).cost ?? 9) <= 2), 'River Ward : Équipement gratuit'); } }],
    on: { defeated: async (g, self, d) => { const i = g.controllerOf(self); if (d.p !== i || !d.gears || !d.gears.length) return; const p = g.P(i); const top = p.deck.slice(0, 2); if (!top.length) return; const c = (await g.pickCards(i, 'River Ward : carte à mettre au rebut', top, 1, 1, x => -g.cardValue(x, i)))[0]; if (c) { p.deck.splice(p.deck.indexOf(c), 1); p.trash.push(c); } } } });
C('rogue-amendiares-preem-solo', 'Rogue Amendiares', 'Preem Solo', L, Y, 7, 2, 7, 'MERC', ['GO_SOLO'],
  '[SOLO]\nQuand une Légende amie vole un Gig, regardez sa valeur : si elle est paire, piochez 1 ; si elle est impaire, un Rival défausse 1.',
  { on: { steal: async (g, self, d) => { const i = g.controllerOf(self); if (d.p !== i || !g.isLegend(d.unit)) return; for (const die of d.gigs) { if (die.value % 2 === 0) await g.draw(i, 1); else await rivalDiscards(g, i, 1); } } } });
C('adam-smasher-metal-over-meat', 'Adam Smasher', 'Metal Over Meat', U, Y, 9, 6, 15, 'ARASAKA|MERC', [],
  '[JEU] Vainquez toutes les autres Unités.',
  { onPlay: async (g, u, i) => { for (const x of g.allUnits().filter(x => x !== u)) await g.defeat(x, { effect: true, p: i }); }, aiValue: 3 });
C('alt-cunningham-mother-of-daemons', 'Alt Cunningham', 'Mother of Daemons', U, Y, 7, 3, 8, 'MERC|NETRUNNER', [],
  'Quand une Unité ou Légende amie équipée est épuisée, piochez 1.\nQuand une Unité rivale devrait voler un Gig, vous pouvez défausser 1 carte de coût égal à la valeur de ce Gig. Si vous le faites, ce Gig n\'est pas volé.',
  { on: { spent: async (g, self, d) => { const i = g.controllerOf(self); if (d.p === i && d.inst.gear && d.inst.gear.length) await g.draw(i, 1); } },
    preventSteal: async (g, self, unit, die) => {
      const i = g.controllerOf(self); const p = g.P(i);
      const ok = p.hand.filter(c => (g.def(c).cost ?? -1) === die.value); if (!ok.length) return false;
      const c = (await g.pickCards(i, `Alt : défausser une carte de coût ${die.value} pour empêcher le vol ?`, ok, 0, 1, x => 6 - g.cardValue(x, i) * 0.3))[0];
      if (!c) return false; p.hand.splice(p.hand.indexOf(c), 1); p.trash.push(c); return true; }, aiValue: 2 });
C('augmented-negotiators', 'Augmented Negotiators', null, U, Y, 3, 1, 2, 'ARASAKA|CORPO', ['BLOCKER'],
  '[BLOQUEUR]\nQuand cette Unité utilise BLOQUEUR, un Rival défausse 1.',
  { on: { blocked: async (g, self, d) => { if (d.blocker === self) await rivalDiscards(g, g.controllerOf(self), 1); } } });
C('caliber-totentanz-s-top-dog', 'Caliber', 'Totentanz\'s Top Dog', U, Y, 5, 2, 5, 'GANGER|MAELSTROM', [],
  '[JEU] Vainquez une Unité rivale de coût 2 ou moins.\n[VAINCU] Un Rival défausse 1. Si le coût de cette carte est égal à la valeur d\'un Gig ami, il défausse 1 de plus.',
  { onPlay: async (g, u, i) => { await defeatPick(g, i, rU(g, i).filter(x => (g.def(x).cost ?? 0) <= 2), 'Caliber : vainquez (coût ≤ 2)'); },
    onDefeated: async (g, u, i) => { await rivalDiscards(g, i, friendlyGigValue(g, i, 5) ? 2 : 1); } });
C('gilded-mato-n', 'Gilded Matón', null, U, Y, 4, 2, 3, 'GANGER|VALENTINO', [],
  '[JEU] Vous pouvez vaincre un de vos Équipements. Si vous le faites, vainquez une Unité rivale de coût 3 ou moins.',
  { onPlay: async (g, u, i) => {
      // Le sacrifice de Gear est facultatif indépendamment de la présence d’une cible rivale.
      // Si aucune Unité éligible n’existe, on résout seulement la première instruction.
      const gears = []; for (const h of g.gearHosts(i)) for (const x of h.gear) gears.push({ label: `${g.name(x)} (sur ${g.name(h)})`, value: x.uid, card: x, score: 3 - (g.def(x).cost ?? 1) });
      if (!gears.length) return;
      const uid = await g.pickOne(i, 'Gilded Matón : sacrifier un Équipement ?', gears, { optional: true });
      if (!uid) return; const w = g.where(uid); w.host.gear.splice(w.idx, 1); g.P(w.inst.owner).trash.push(w.inst);
      await defeatPick(g, i, rU(g, i).filter(x => (g.def(x).cost ?? 0) <= 3), 'Gilded Matón : vainquez (coût ≤ 3)');
    } });
C('hanako-arasaka-in-a-gilded-cage', 'Hanako Arasaka', 'In a Gilded Cage', U, Y, 4, 2, 1, 'ARASAKA|CORPO|NETRUNNER', [],
  '[JEU] Regardez les 4 cartes du dessus de votre deck. Révélez autant de cartes que vous voulez dont le coût est égal à la valeur d\'un Gig ami et ajoutez-les à votre main. Placez le reste sous votre deck.',
  { onPlay: async (g, u, i) => { await searchTop(g, i, 4, d => d.cost !== null && friendlyGigValue(g, i, d.cost), 4, 'Hanako : cartes à prendre'); } });
C('heywood-ripperdoc', 'Heywood Ripperdoc', null, U, Y, 6, 1, 8, 'RIPPERDOC', [],
  '[JEU] Vous pouvez vaincre un Équipement. Si son coût est égal à la valeur d\'un Gig ami, piochez 1.',
  { onPlay: async (g, u, i) => {
      const opts = []; for (const k of [0, 1]) for (const h of g.gearHosts(k)) for (const x of h.gear) opts.push({ label: `${g.name(x)} (sur ${g.name(h)})`, value: x.uid, card: x, score: (k === i ? -1 : 1) * (g.def(x).cost ?? 1) + (friendlyGigValue(g, i, g.def(x).cost) ? 1 : 0) });
      const uid = await g.pickOne(i, 'Heywood : vaincre un Équipement ?', opts, { optional: true });
      if (!uid) return; const w = g.where(uid); w.host.gear.splice(w.idx, 1); g.P(w.inst.owner).trash.push(w.inst); g.log(`${g.name(w.inst)} est retiré.`);
      if (friendlyGigValue(g, i, g.def(w.inst).cost)) await g.draw(i, 1);
    } });
C('jackie-welles-ride-or-die-choom', 'Jackie Welles', 'Ride or Die Choom', U, Y, 6, 2, 8, 'MERC|VALENTINO', [],
  '[ATTAQUE] Cette Unité gagne +2 de puissance ce tour par Gig ami de valeur paire.\n[VAINCU] Piochez 1 par Gig ami de valeur impaire.',
  { onAttack: async (g, u, i) => { const n = g.P(i).gigs.filter(d => d.value % 2 === 0).length; if (n) { g.buff(u, 2 * n, 'turn', i); g.log(`Jackie gagne +${2 * n}.`); } },
    onDefeated: async (g, u, i) => { const n = g.P(i).gigs.filter(d => d.value % 2 === 1).length; if (n) await g.draw(i, n); }, aiValue: 1 });
C('maelstrom-goons', 'Maelstrom Goons', null, U, Y, 3, 2, 3, 'GANGER|MAELSTROM', [],
  'Quand cette Unité vole un Gig, si elle est équipée, un Rival défausse 1.',
  { onSteal: async (g, u, i, gigs) => { if (u.gear.length) for (const die of gigs) await rivalDiscards(g, i, 1); } });
C('maxtac-suppression-team', 'MaxTac Suppression Team', null, U, Y, 5, 1, 7, 'NCPD', [],
  'Les Unités rivales ne peuvent pas attaquer le tour où elles sont jouées.',
  { auraCantAttack: (g, self, u) => g.controllerOf(u) !== g.controllerOf(self) && u.lag });
C('offduty-malfini', 'Offduty Malfini', null, U, Y, 4, 2, 5, 'GANGER|VOODOO BOYS', [],
  '[JEU] Épuisez cette Unité et une Unité rivale.',
  { onPlay: async (g, u, i) => { await g.spendUnit(u); await spendPick(g, i, rU(g, i), 'Offduty Malfini : Unité rivale à épuiser'); } });
C('rockn-rockerboy', 'Rockn\' Rockerboy', null, U, Y, 5, 1, 8, 'ROCKER', [], '');
C('secondhand-bombus', 'Secondhand Bombus', null, U, Y, 2, 2, 0, 'DRONE|ZETATECH', ['BLOCKER'], '[BLOQUEUR]\n(Une Unité à 0 de puissance ne vole pas de Gigs.)');
C('sketchy-ripper', 'Sketchy Ripper', null, U, Y, 2, 2, 0, 'GANGER|RIPPERDOC|SCAVENGER', [],
  '[ATTAQUE] Regardez les 3 cartes du dessus de votre deck. Révélez un Équipement parmi elles et ajoutez-le à votre main. Placez le reste sous votre deck.',
  { onAttack: async (g, u, i) => { await searchTop(g, i, 3, d => d.type === 'Gear', 1, 'Sketchy Ripper : Équipement à prendre'); } });
C('t-bug-amateur-philosopher', 'T-Bug', 'Amateur Philosopher', U, Y, 4, 2, 4, 'MERC|NETRUNNER', [],
  '[VAINCU] Regardez toutes vos Légendes face cachée. Vous pouvez ensuite en Appeler une gratuitement (un seul Appel par tour).',
  { onDefeated: async (g, u, i) => { const p = g.P(i); const fd = p.legends.filter(l => !l.faceUp); for (const hidden of fd) { hidden.known = true; await g.ui('peek', { p: i, inst: hidden }); } if (!fd.length || p.calledThisTurn) return; const l = await g.pickUnit(i, 'T-Bug : Légende à Appeler', fd, x => val(g, x), { optional: true, reveal: true }); if (l) await g.callFree(i, l); } });
C('trauma-team-operatives', 'Trauma Team Operatives', null, U, Y, 6, 2, 7, 'MEDTECH|TRAUMA TEAM', [],
  'Jouez cette Unité pour -1 €$ par Unité dans votre rebut (minimum 1 €$).',
  { discount: (g, c, i) => Math.min(5, g.P(i).trash.filter(x => g.def(x).type === 'Unit').length) });
C('viktor-vektor-drop-your-illusions', 'Viktor Vektor', 'Drop Your Illusions', U, Y, 5, 2, 5, 'RIPPERDOC', [],
  'Jouez votre premier Équipement CYBERWARE à chaque tour pour -3 €$ (minimum 1 €$).',
  { costMod: (g, self, c, i, mode) => { const d = g.def(c); if (mode !== 'play' || d.type !== 'Gear' || !d.tags.includes('CYBERWARE') || g.P(i).tf.cyberPlayed) return 0; const base = d.cost ?? 0; return -Math.min(3, Math.max(0, base - 1)); },
    afterPay: (g, self, c, i) => { const d = g.def(c); if (d.type === 'Gear' && d.tags.includes('CYBERWARE')) g.P(i).tf.cyberPlayed = true; } });
C('viktor-vektor-you-might-feel-a-little-pinch', 'Viktor Vektor', 'You Might Feel a Little Pinch', U, Y, 3, 2, 3, 'RIPPERDOC', [],
  '[JEU] Vous pouvez jouer gratuitement un Équipement CYBERWARE de coût 2 ou moins depuis votre rebut, en l\'attachant à une autre Unité amie.',
  { onPlay: async (g, u, i) => {
      const others = fU(g, i).filter(x => x !== u); if (!others.length) return;
      const pool = g.P(i).trash.filter(c => g.def(c).type === 'Gear' && g.def(c).tags.includes('CYBERWARE') && (g.def(c).cost ?? 9) <= 2);
      if (!pool.length) return;
      const c = (await g.pickCards(i, 'Viktor : Équipement CYBERWARE à récupérer', pool, 0, 1, x => g.cardValue(x, i)))[0]; if (!c) return;
      const h = await g.pickUnit(i, 'Sur quelle Unité ?', others, x => g.eff(x));
      if (h) await g.playCard(i, c.uid, h.uid, { free: true, from: g.P(i).trash });
    } });
C('viktor-vektor-sit-down-and-relax', 'Viktor Vektor', 'Sit Down and Relax', L, Y, null, 2, null, 'RIPPERDOC', [],
  '[APPEL] Regardez les 5 cartes du dessus de votre deck. Révélez jusqu\'à 2 Équipements de coût 2 ou moins et ajoutez-les à votre main. Placez le reste sous votre deck dans un ordre aléatoire.',
  { onCall: async (g, l, i) => { await searchTop(g, i, 5, d => d.type === 'Gear' && (d.cost ?? 9) <= 2, 2, 'Viktor : Équipements à prendre'); } });
C('dexter-deshawn-one-last-chance', 'Dexter DeShawn', 'One Last Chance', U, Y, 3, 2, 4, 'FIXER', [],
  '[JEU] [ATTAQUE] Ajustez un Gig de 1 maximum.\n[VAINCU] Si votre ☆ diffère de celle d\'un Rival de 10 ou plus, piochez 2.',
  { onPlay: async (g, u, i) => { await g.adjustUpTo(i, 1); }, onAttack: async (g, u, i) => { await g.adjustUpTo(i, 1); },
    onDefeated: async (g, u, i) => { if (Math.abs((g.sc(i) ?? 0) - (g.sc(g.opp(i)) ?? 0)) >= 10) await g.draw(i, 2); } });
C('adrenaline-converter', 'Adrenaline Converter', null, G, Y, 2, 4, 3, 'CYBERWARE|MEDTECH', [],
  'Équipement.\nSi un Rival contrôle au moins 2 Gigs de plus que vous, cette Unité a ADRÉNALINE.',
  { hostKwIf: (g, gr, host, kw) => kw === 'ADRENALINE' && g.gigCount(g.opp(g.controllerOf(host))) >= g.gigCount(g.controllerOf(host)) + 2 });
C('gorilla-arms', 'Gorilla Arms', null, G, Y, 4, 3, 3, 'CYBERWARE', [],
  'Équipement.\nLa première fois que cette Unité vole 1 ou plusieurs Gigs à chaque tour, elle vole aussi un Gig rival dont la valeur n\'est partagée par aucun Gig ami.',
  { onHostSteal: async (g, gr, host, i) => {
      if (gr.flags.usedGorilla) return; gr.flags.usedGorilla = true;
      const mine = new Set(g.P(i).gigs.map(d => d.value));
      const pool = g.P(g.opp(i)).gigs.filter(d => !mine.has(d.value) && g.stealAllowed(host, d, g.opp(i)));
      const die = await g.pickGig(i, 'Gorilla Arms : Gig supplémentaire à voler', pool, d => d.value);
      if (die) { await g.stealGig(i, die, host); g.checkOT(); }
    } });
C('kiroshi-optics', 'Kiroshi Optics', null, G, Y, 1, 1, 1, 'CYBERWARE', [],
  'Équipement.\n[ATTAQUE] Regardez une de vos Légendes face cachée.',
  { onHostAttack: async (g, gr, host, i) => {
      const l = await g.pickFaceDownLegend(i, 'Kiroshi Optics : choisissez une Légende face cachée');
      if (!l) return;
      l.known = true;
      await g.ui('peek', { p: i, inst: l });
    } });
C('mandibular-upgrade', 'Mandibular Upgrade', null, G, Y, 1, 2, 0, 'CYBERWARE', [],
  'Équipement.\nCette Unité a BLOQUEUR.', { hostKw: ['BLOCKER'] });
C('the-relic-experimental-biochip', 'The Relic', 'Experimental Biochip', G, Y, 5, 4, 3, 'ARASAKA|CYBERWARE', [],
  'Équipement.\n[VAINCU] (de cette Unité) Jouez gratuitement une autre Unité de coût 9 ou moins depuis votre rebut. Puis placez l\'Unité vaincue sous votre deck.',
  { onHostDefeated: async (g, gr, host, i) => {
      const p = g.P(i);
      const pool = p.trash.filter(c => c.uid !== host.uid && g.def(c).type === 'Unit' && (g.def(c).cost ?? 99) <= 9);
      await playFreeFrom(g, i, pool, 'The Relic : Unité à rejouer');
      const k = p.trash.findIndex(c => c.uid === host.uid); if (k >= 0) { p.deck.push(p.trash.splice(k, 1)[0]); }
    }, aiValue: 1 });
C('zetatech-faceplate', 'Zetatech Faceplate', null, G, Y, 2, 2, 2, 'CYBERWARE|ZETATECH', [],
  'Équipement.\nQuand cette Unité ou Légende est épuisée, ajustez un Gig de 1 maximum. Puis, si vous contrôlez 3 Gigs ou plus de valeurs différentes, piochez 1.',
  { on: { spent: async (g, self, d, src) => { if (!src.host || d.inst !== src.host) return; const i = g.controllerOf(src.host); await g.adjustUpTo(i, 1); if (distinctVals(g, i) >= 3) await g.draw(i, 1); } } });
C('afterparty-at-lizzie-s', 'Afterparty at Lizzie\'s', null, P, Y, 1, 1, null, 'BRAINDANCE|MOX', [],
  'Ajustez un Gig de 1 maximum. Puis, si vous contrôlez 2 Gigs ou plus de valeurs différentes, piochez 1.',
  { onPlay: async (g, c, i) => { await g.adjustUpTo(i, 1); if (distinctVals(g, i) >= 2) await g.draw(i, 1); } });
C('bootleg-black-sapphire-show', 'Bootleg Black Sapphire Show', null, P, Y, 5, 4, null, 'BRAINDANCE', [],
  'Vendez la carte du dessus de votre deck.\nSi vous contrôlez un Gig de valeur paire et un Gig de valeur impaire, piochez 2.',
  { onPlay: async (g, c, i) => { const p = g.P(i); if (p.deck.length) { const x = p.deck.shift(); p.eddies.push({ uid: x.uid, ready: true, card: x }); g.log(`${p.name} vend la carte du dessus de son deck (+1 €$).`); }
      if (p.gigs.some(d => d.value % 2 === 0) && p.gigs.some(d => d.value % 2 === 1)) await g.draw(i, 2); } });
C('cyberpsychosis', 'Cyberpsychosis', null, P, Y, 3, 2, null, 'QUICKHACK', [],
  '[RAPIDE] Une Unité équipée gagne +3 de puissance ce tour par Équipement qui lui est attaché. Si elle vole ou combat ce tour, elle est vaincue à la fin du tour.',
  { quick: true, canPlay: (g, i) => g.allUnits().some(u => u.gear.length),
    onPlay: async (g, c, i) => { const u = await g.pickUnit(i, 'Cyberpsychose : Unité équipée', g.allUnits().filter(x => x.gear.length), x => (g.controllerOf(x) === i ? (inFight(g, x) ? 10 : 2) : (inFight(g, x) && g.s.attack.attacker === x.uid ? 3 : -5)));
      if (u) { g.buff(u, 3 * u.gear.length, 'turn', i); g.flag(u, 'psycho', 'turn', i); g.log(`${g.name(u)} sombre dans la cyberpsychose (+${3 * u.gear.length}).`); } } });
C('live-with-the-aftermath', 'Live with the Aftermath', null, P, Y, 3, 3, null, 'PLAN', [],
  'Chaque joueur vainc une de ses Unités.',
  { onPlay: async (g, c, i) => { for (const k of [i, g.opp(i)]) { const pool = fU(g, k); if (pool.length) { const u = await g.pickUnit(k, 'Live with the Aftermath : vainquez une de vos Unités', pool, x => -val(g, x)); if (u) await g.defeat(u, { effect: true, p: i }); } } } });
C('safety-override', 'Safety Override', null, P, Y, 2, 3, null, 'QUICKHACK', [],
  '[RAPIDE] La prochaine fois ce tour qu\'une Unité amie perd un combat, vainquez l\'Unité rivale adverse.',
  { quick: true, canPlay: (g, i) => fU(g, i).length > 0, onPlay: async (g, c, i) => { g.P(i).tf.safetyOverride = true; } });
C('the-heist', 'The Heist', null, P, Y, 2, 2, null, 'MERC', [],
  'Mettez au rebut les 4 cartes du dessus de votre deck. Ajoutez un Équipement parmi elles à votre main. Si son coût est égal à la valeur d\'un Gig ami, vous pouvez le jouer gratuitement à la place.',
  { onPlay: async (g, c, i) => {
      const x = await trashThenTake(g, i, 4, d => d.type === 'Gear', 'The Heist : Équipement à prendre');
      if (x && friendlyGigValue(g, i, g.def(x).cost) && g.gearHosts(i).length && await g.yesNo(i, `Jouer ${g.name(x)} gratuitement ?`, true)) await g.playCard(i, x.uid, null, { free: true });
    } });

// ================================================================ VERT =====
C('goro-takemura-vengeful-bodyguard', 'Goro Takemura', 'Vengeful Bodyguard', L, V, null, 2, null, 'ARASAKA|CORPO', [],
  '[RAPIDE] 1 €$, [⟳] : Une Unité amie de coût 4 ou moins gagne BLOQUEUR ce tour. Si vous contrôlez une paire de valeurs, elle gagne aussi +1 de puissance ce tour.\nQuand une Unité amie utilise BLOQUEUR, vous pouvez défausser 1. Si vous le faites, piochez 1.',
  { abilities: [{ label: 'Donner BLOQUEUR', quick: true, spend: true, cost: 1, cond: (g, l, i) => fU(g, i).some(u => (g.def(u).cost ?? 9) <= 4),
      run: async (g, l, i) => { const u = await g.pickUnit(i, 'Goro : Unité (coût ≤ 4) qui gagne BLOQUEUR', fU(g, i).filter(x => (g.def(x).cost ?? 9) <= 4), x => (x.ready ? 5 : 0) + g.eff(x)); if (u) { g.grant(u, 'BLOCKER', 'turn', i); if (g.valuePairs(i)) g.buff(u, 1, 'turn', i); g.log(`${g.name(u)} gagne BLOQUEUR.`); } } }],
    on: { blocked: async (g, self, d) => { const i = g.controllerOf(self); if (d.p !== i || !g.P(i).hand.length) return; if (await g.yesNo(i, 'Goro : défausser 1 pour piocher 1 ?', g.P(i).hand.some(c => g.cardValue(c, i) < 4))) { const x = await g.discard(i, 1); if (x.length) await g.draw(i, 1); } } } });
C('hanako-arasaka-daughter-of-the-emperor', 'Hanako Arasaka', 'Daughter of the Emperor', L, V, null, 2, null, 'ARASAKA|CORPO|NETRUNNER', [],
  '[⟳] : Échangez un Gig ami avec un Gig rival.\nAu début de votre tour, piochez 1 par paire de valeurs parmi vos Gigs.',
  { abilities: [{ label: 'Échanger des Gigs', spend: true, cost: 0, cond: (g, l, i) => g.P(i).gigs.length && g.P(g.opp(i)).gigs.length, run: async (g, l, i) => { await swapPick(g, i); } }],
    on: { turnStart: async (g, self, d) => { const i = g.controllerOf(self); if (d.p === i) { const n = g.valuePairs(i); if (n) await g.draw(i, n); } } } });
C('jackie-welles-mama-s-favorite', 'Jackie Welles', 'Mama\'s Favorite', L, V, 6, 2, 8, 'MERC', ['GO_SOLO'],
  '[SOLO]\nSi une Unité amie devait être vaincue, vous pouvez payer 1 €$ pour vaincre cette Légende à la place.',
  { replaceFriendlyDefeat: async (g, self, victim) => {
      const i = g.controllerOf(self); if (g.avail(i, [self.uid]) < 1) return false;
      if (!(await g.yesNo(i, `Jackie : payer 1 €$ et sacrifier Jackie pour sauver ${g.name(victim)} ?`, val(g, victim) >= 9))) return false;
      if (!(await g.pay(i, 1, [self.uid]))) return false;
      g.moveTo(self, 'trash'); g.log(`Jackie Welles se sacrifie pour ${g.name(victim)} !`, 'legend'); return true; } });
C('padre-man-of-the-cross', 'Padre', 'Man of the Cross', L, V, null, 2, null, 'FIXER|GANGER|VALENTINO', [],
  '[APPEL] Choisissez : épuisez une Unité rivale ; ou piochez 1.\n[⟳] : Réglez la valeur d\'un Gig sur celle d\'un autre Gig.',
  { onCall: async (g, l, i) => pickMode(g, i, 'Padre : choisissez', [
      { label: 'Épuisez une Unité rivale', score: rU(g, i).some(u => u.ready) ? 1 : -1, run: () => spendPick(g, i, rU(g, i), 'Padre : Unité rivale à épuiser') },
      { label: 'Piochez 1', score: 0.5, run: () => g.draw(i, 1) }]),
    abilities: [{ label: 'Copier une valeur de Gig', spend: true, cost: 0, cond: (g, l, i) => g.P(i).gigs.length + g.P(g.opp(i)).gigs.length >= 2, run: async (g, l, i) => { await setGigToOther(g, i); } }] });
C('panam-palmer-nomad-cavalry', 'Panam Palmer', 'Nomad Cavalry', L, V, null, 2, null, 'ALDECALDO|MERC|NOMAD', [],
  '2 €$, [⟳] : Déplacez un Équipement de cette Légende vers une Unité amie non équipée. Si vous le faites, redressez cette Unité.\nÀ la fin de votre tour, si 5 Unités et/ou Légendes amies ou plus sont équipées, redressez-les.',
  { abilities: [{ label: 'Transférer un Équipement', spend: true, cost: 2, cond: (g, l, i) => l.gear.length && fU(g, i).some(u => !u.gear.length),
      run: async (g, l, i) => { const gr = (await g.pickCards(i, 'Équipement à déplacer', l.gear, 1, 1, x => g.def(x).power ?? 0))[0]; const u = await g.pickUnit(i, 'Unité non équipée', fU(g, i).filter(x => !x.gear.length), x => g.eff(x)); if (gr && u) { l.gear.splice(l.gear.indexOf(gr), 1); u.gear.push(gr); u.ready = true; g.log(`${g.name(gr)} passe sur ${g.name(u)}, qui se redresse.`); } } }],
    on: { turnEnd: async (g, self, d) => { const i = g.controllerOf(self); if (d.p !== i) return; const eq = [...fU(g, i), ...g.P(i).legends].filter(x => x.gear.length); if (eq.length >= 5) { for (const x of eq) x.ready = true; g.log('Panam : vos cartes équipées se redressent.'); } } } });
C('corpo-security', 'Corpo Security', null, U, V, 2, 1, 2, 'CORPO', ['BLOCKER'],
  'Cette Unité ne peut pas attaquer.\n[BLOQUEUR]', { cantAttack: () => true });
C('emergency-atlus', 'Emergency Atlus', null, U, V, 3, 1, 4, 'TRAUMA TEAM|VEHICLE|ZETATECH', [], '');
C('field-operator', 'Field Operator', null, U, V, 3, 2, 2, 'ARASAKA|CORPO|TECHIE', [],
  '[JEU] Si votre ☆ est paire, piochez 1.', { onPlay: async (g, u, i) => { if (scEven(g, i)) await g.draw(i, 1); } });
C('maelstrom-zealots', 'Maelstrom Zealots', null, U, V, 4, 1, 0, 'GANGER|MAELSTROM', [],
  'Quand cette Unité perd un combat, vainquez l\'Unité rivale qu\'elle a combattue.\n(Une Unité à 0 de puissance ne vole pas de Gigs.)',
  { onLoseFight: async (g, u, o) => { if (g.onField(o) && g.controllerOf(o) !== g.controllerOf(u)) { g.log('Maelstrom Zealots emporte son adversaire !'); await g.defeat(o, { effect: true }); } } });
C('maxtac-av', 'MaxTac AV', null, U, V, 5, 2, 8, 'NCPD|VEHICLE', [],
  '[JEU] Vous pouvez échanger un Gig ami avec un Gig rival.',
  { onPlay: async (g, u, i) => { if (g.P(i).gigs.length && g.P(g.opp(i)).gigs.length) { const mine = Math.min(...g.P(i).gigs.map(d => d.value)), theirs = Math.max(...g.P(g.opp(i)).gigs.map(d => d.value)); if (await g.yesNo(i, 'MaxTac AV : échanger un Gig ?', theirs > mine)) await swapPick(g, i); } } });
C('maxtac-heavy', 'MaxTac Heavy', null, U, V, 7, 3, 8, 'NCPD', [],
  'Jouez cette Unité pour -1 €$ par Unité rivale (minimum 1 €$).', { discount: (g, c, i) => Math.min(6, rU(g, i).length) });
C('maxtac-squadron', 'MaxTac Squadron', null, U, V, 3, 3, 4, 'NCPD', [],
  'À la fin de votre tour, si cette Unité est épuisée, redressez une de vos Légendes face visible.',
  { on: { turnEnd: async (g, self, d) => { const i = g.controllerOf(self); if (d.p !== i || self.ready) return; const pool = g.P(i).legends.filter(l => l.faceUp && !l.ready); const l = await g.pickUnit(i, 'MaxTac Squadron : Légende à redresser', pool, x => (g.def(x).abilities || []).length); if (l) { l.ready = true; g.log(`${g.name(l)} se redresse.`); } } } });
C('nadia-fighting-through-grief', 'Nadia', 'Fighting Through Grief', U, V, 6, 2, 8, 'MEDTECH|TRAUMA TEAM', [],
  'Tant qu\'un Rival contrôle plus de Gigs que vous, cette Unité peut attaquer la zone de Gigs rivale le tour où elle est jouée.',
  { rush: (g, u) => (g.gigCount(g.opp(g.controllerOf(u))) > g.gigCount(g.controllerOf(u)) ? 'gigs' : null) });
C('pacifica-netrunner', 'Pacifica Netrunner', null, U, V, 4, 2, 1, 'NETRUNNER', [],
  '[JEU] Si votre ☆ est paire, choisissez une Unité rivale : elle ne peut pas se redresser jusqu\'à votre prochain tour.',
  { onPlay: async (g, u, i) => { if (!scEven(g, i)) return; const t = await g.pickUnit(i, 'Pacifica Netrunner : Unité rivale bloquée', rU(g, i), x => (x.ready ? 0 : 5) + val(g, x)); if (t) { g.flag(t, 'noReady', 'next', i); g.log(`${g.name(t)} ne pourra pas se redresser.`); } } });
C('panam-palmer-strength-through-family', 'Panam Palmer', 'Strength Through Family', U, V, 6, 4, 6, 'ALDECALDO|MERC|NOMAD', [],
  'Pendant votre tour, vous pouvez Appeler une Légende gratuitement.\n[ATTAQUE] Défaussez 1. Si vous le faites, piochez 1 par Légende amie face visible.',
  { freeCallOnYourTurn: true, onAttack: async (g, u, i) => { if (!g.P(i).hand.length) return; const x = await g.discard(i, 1); if (x.length) await g.draw(i, faceUpCount(g, i)); } });
C('pepe-najarro-working-doubles', 'Pepe Najarro', 'Working Doubles', U, V, 4, 2, 6, 'VALENTINO', [],
  '[ATTAQUE] Si vous contrôlez une paire de valeurs, redressez jusqu\'à 2 Légendes MERC dans votre zone de Légendes.',
  { onAttack: async (g, u, i) => { if (!g.valuePairs(i)) return; const available = g.P(i).legends.filter(l => !l.ready && l.faceUp && g.def(l).tags.includes('MERC')); const chosen = await g.pickCards(i, 'Pepe : choisissez jusqu’à 2 Légendes MERC à redresser', available, 0, Math.min(2, available.length), l => val(g, l)); for (const l of chosen) l.ready = true; if (chosen.length) g.log(`Pepe redresse ${chosen.length} Légende(s) MERC.`); } });
C('riding-nomad', 'Riding Nomad', null, U, V, 5, 4, 4, 'NOMAD', ['ADRENALINE'], '[ADRÉNALINE]');
C('sandayu-oda-hanako-s-guardian', 'Sandayu Oda', 'Hanako\'s Guardian', U, V, 7, 2, 8, 'ARASAKA|CORPO', [],
  '[JEU] Épuisez une Unité rivale par paire de valeurs parmi vos Gigs.\nCette Unité peut attaquer des Unités rivales le tour où elle est jouée.',
  { onPlay: async (g, u, i) => { const n = g.valuePairs(i); for (let k = 0; k < n; k++) await spendPick(g, i, rU(g, i), 'Sandayu Oda : Unité rivale à épuiser'); }, rush: () => 'units', aiValue: 1 });
C('saul-bright-stormrider', 'Saul Bright', 'Stormrider', U, V, 8, 2, 14, 'ALDECALDO|NOMAD', [],
  'Vos autres Unités ont +2 de puissance lorsqu\'elles attaquent.\nÀ la fin de votre tour, vous pouvez redresser jusqu\'à 3 Unités amies.',
  { aura: (g, self, t) => (t !== self && g.controllerOf(t) === g.controllerOf(self) && g.attacking(t) ? 2 : 0),
    on: { turnEnd: async (g, self, d) => { const i = g.controllerOf(self); if (d.p !== i) return; const pool = fU(g, i).filter(u => !u.ready); const cs = await g.pickCards(i, 'Saul Bright : Unités à redresser (3 max)', pool, 0, Math.min(3, pool.length), x => val(g, x)); for (const u of cs) u.ready = true; if (cs.length) g.log(`Saul Bright redresse ${cs.length} Unité(s).`); } }, aiValue: 2 });
C('tyger-s-whisper', 'Tyger\'s Whisper', null, U, V, 2, 1, 0, 'FIXER|TYGER CLAWS', [],
  '[JEU] Vous pouvez Appeler une Légende gratuitement (un seul Appel par tour).',
  { onPlay: async (g, u, i) => { if (!g.P(i).calledThisTurn && g.P(i).legends.some(l => !l.faceUp) && await g.yesNo(i, 'Tyger\'s Whisper : Appeler une Légende gratuitement ?', true)) await g.callFree(i); } });
C('valentino-street-racer', 'Valentino Street Racer', null, U, V, 3, 2, 3, 'VALENTINO|VEHICLE', [],
  '[JEU] Une autre Unité amie de coût 5 ou moins gagne ADRÉNALINE ce tour.',
  { onPlay: async (g, u, i) => { const pool = fU(g, i).filter(x => x !== u && (g.def(x).cost ?? 9) <= 5); const t = await g.pickUnit(i, 'Valentino : Unité qui gagne ADRÉNALINE', pool, x => (x.lag ? 5 : 0) + g.eff(x)); if (t) { g.grant(t, 'ADRENALINE', 'turn', i); g.log(`${g.name(t)} gagne ADRÉNALINE.`); } } });
C('wraith-marauders', 'Wraith Marauders', null, U, V, 5, 2, 4, 'GANGER|NOMAD|RAFFEN SHIV', [],
  'Quand cette Unité vole un Gig, redressez une autre Unité amie dont la puissance est égale à la valeur du Gig volé.',
  { onSteal: async (g, u, i, gigs) => { for (const die of gigs) { const pool = fU(g, i).filter(x => x !== u && !x.ready && g.eff(x) === die.value); const t = await g.pickUnit(i, 'Wraith Marauders : Unité à redresser', pool, x => val(g, x)); if (t) { t.ready = true; g.log(`${g.name(t)} se redresse.`); } } } });
C('overwatch-panam-s-gift', 'Overwatch', 'Panam\'s Gift', G, V, 4, 4, 4, 'WEAPON', [],
  'Équipement.\n[RAPIDE] 1 €$, [⟳] (cette Unité), défaussez 1 carte : Vainquez une Unité rivale épuisée de coût inférieur ou égal au coût de la carte défaussée.',
  { abilities: [{ label: 'Tir de précision', quick: true, spend: true, spendHost: true, cost: 1,
      cond: (g, gr, i) => g.P(i).hand.length && rU(g, i).some(u => !u.ready),
      payExtra: async (g, gr, i) => { const p = g.P(i); const maxC = Math.max(...rU(g, i).filter(u => !u.ready).map(u => g.def(u).cost ?? 0));
        const c = (await g.pickCards(i, 'Overwatch : carte à défausser (coût ≥ cible)', p.hand, 1, 1, x => ((g.def(x).cost ?? 0) >= maxC ? 5 : 0) - g.cardValue(x, i) * 0.2))[0];
        if (!c) return false; p.hand.splice(p.hand.indexOf(c), 1); p.trash.push(c); gr.flags.owCost = g.def(c).cost ?? 0; return true; },
      run: async (g, gr, i) => { const lim = gr.flags.owCost ?? 0; await defeatPick(g, i, rU(g, i).filter(u => !u.ready && (g.def(u).cost ?? 0) <= lim), `Overwatch : vainquez une Unité épuisée (coût ≤ ${lim})`); } }], aiValue: 1 });
C('riot-shield', 'Riot Shield', null, G, V, 2, 2, 1, 'WEAPON', [],
  'Équipement.\nCette Unité a BLOQUEUR.\nLes Rivaux doivent payer +2 €$ pour utiliser EN SOLO.',
  { hostKw: ['BLOCKER'], rivalCostMod: (g, self, c, p, mode) => (mode === 'solo' ? 2 : 0) });
C('sandevistan', 'Sandevistan', null, G, V, 3, 3, 2, 'CYBERWARE', [],
  'Équipement.\nÀ la fin de votre tour, redressez cette Unité ou Légende.',
  { on: { turnEnd: async (g, self, d, src) => { if (!src.host) return; if (d.p === g.controllerOf(src.host)) { src.host.ready = true; } } } });
C('zetatech-berserk', 'Zetatech Berserk', null, G, V, 6, 2, 3, 'CYBERWARE|ZETATECH', [],
  'Équipement.\nJouez cet Équipement pour -1 €$ par Légende amie face visible (minimum 1 €$).', { discount: (g, c, i) => Math.min(5, faceUpCount(g, i)) });
C('corporate-surveillance', 'Corporate Surveillance', null, P, V, 2, 1, null, 'CORPO', [],
  'Épuisez une Unité rivale de coût 4 ou moins.',
  { canPlay: (g, i) => rU(g, i).some(u => u.ready && (g.def(u).cost ?? 9) <= 4), onPlay: async (g, c, i) => { await spendPick(g, i, rU(g, i).filter(u => (g.def(u).cost ?? 9) <= 4), 'Corporate Surveillance : Unité à épuiser'); } });
C('don-t-fear-the-reaper', '(Don\'t Fear) The Reaper', null, P, V, 7, 3, null, 'SAMURAI', [],
  'Épuisez toutes les Unités rivales. Puis vainquez une Unité épuisée.',
  { canPlay: (g, i) => rU(g, i).length > 0 || g.allUnits().some(u => !u.ready), onPlay: async (g, c, i) => { for (const u of rU(g, i)) await g.spendUnit(u); await defeatPick(g, i, g.allUnits().filter(u => !u.ready), 'The Reaper : vainquez une Unité épuisée'); } });
C('fool-on-the-hill', 'Fool on the Hill', null, P, V, 2, 3, null, 'MERC', [],
  'Révélez les 2 cartes du dessus de votre deck. Un Rival choisit : vous les ajoutez à votre main, ou vous les mettez au rebut et piochez 2.',
  { onPlay: async (g, c, i) => { const p = g.P(i); const top = p.deck.splice(0, Math.min(2, p.deck.length)); if (!top.length) return;
      g.log(`Fool on the Hill révèle : ${top.map(x => g.name(x)).join(', ')}.`);
      const v = top.reduce((a, x) => a + g.cardValue(x, i), 0);
      const ch = await g.pickOne(g.opp(i), `Fool on the Hill : ${top.map(x => g.name(x)).join(' + ')}`, [{ label: 'Il les ajoute à sa main', value: 'hand', score: v < 8 ? 1 : 0 }, { label: 'Il les met au rebut et pioche 2', value: 'trash', score: v >= 8 ? 1 : 0 }], { revealCards: top });
      if (ch === 'trash') { p.trash.push(...top); await g.draw(i, 2); } else p.hand.push(...top); } });
C('memory-relapse', 'Memory Relapse', null, P, V, 4, 2, null, 'BRAINDANCE', [],
  'Épuisez une Unité rivale. Elle ne peut pas se redresser jusqu\'à votre prochain tour. Si votre ☆ est paire, piochez 1.',
  { onPlay: async (g, c, i) => { const u = await g.pickUnit(i, 'Memory Relapse : Unité rivale', rU(g, i), x => val(g, x) + (x.ready ? 3 : 0)); if (u) { await g.spendUnit(u); g.flag(u, 'noReady', 'next', i); } if (scEven(g, i)) await g.draw(i, 1); } });
C('peace-offering', 'Peace Offering', null, P, V, 1, 1, null, 'BRAINDANCE', [],
  'Vous pouvez régler la valeur d\'un Gig sur celle d\'un autre Gig. Puis, si vous contrôlez une paire de valeurs, piochez 1.',
  { onPlay: async (g, c, i) => { await setGigToOther(g, i); if (g.valuePairs(i)) await g.draw(i, 1); } });
C('synapse-burnout', 'Synapse Burnout', null, P, V, 1, 1, null, 'QUICKHACK', [],
  '[RAPIDE] Une Unité amie gagne ce tour +1 de puissance par Légende amie face visible, uniquement lorsqu\'elle combat des Unités rivales.',
  { quick: true, canPlay: (g, i) => fU(g, i).length > 0, onPlay: async (g, c, i) => { const n = faceUpCount(g, i); const u = await g.pickUnit(i, 'Synapse Burnout : Unité amie', fU(g, i), x => (inFight(g, x) ? 20 : 0) + g.eff(x) * 0.1); if (u) { u.mods.push({ power: n, dur: 'turn', pf: i, fightOnly: true, vsRival: true }); g.log(`${g.name(u)} : +${n} en combat.`); } } });
C('take-control', 'Take Control', null, P, V, 2, 2, null, 'QUICKHACK', [],
  '[RAPIDE] Une Unité rivale vole 1 Gig de moins ce tour. Si c\'est une Unité AI, DRONE ou VEHICLE, piochez 1.',
  { quick: true, canPlay: (g, i) => rU(g, i).length > 0, onPlay: async (g, c, i) => { const u = await g.pickUnit(i, 'Take Control : Unité rivale', rU(g, i), x => (g.s.attack && g.s.attack.attacker === x.uid && g.s.attack.target.kind === 'gigs' ? 20 : 0) + g.eff(x) * 0.2); if (!u) return; g.flag(u, 'stealMinus1', 'turn', i); if (['AI', 'DRONE', 'VEHICLE'].some(t => hasTag(g, u, t))) await g.draw(i, 1); } });
C('we-gotta-live-together', 'We Gotta Live Together', null, P, V, 5, 2, null, 'ALDECALDO|NOMAD', [],
  'Si un Rival contrôle au moins 2 Gigs de plus que vous, jouez ce Programme pour 3 €$.\nJouez gratuitement jusqu\'à 2 Unités de coût 3 ou moins depuis votre rebut.',
  { fixedPay: (g, c, i, mode) => (mode === 'play' && g.gigCount(g.opp(i)) >= g.gigCount(i) + 2 ? 3 : null),
    // 'up to 2' legally includes 0 units; do not restrict casting to nonempty trash.
    onPlay: async (g, c, i) => { for (let k = 0; k < 2; k++) await playFreeFrom(g, i, g.P(i).trash.filter(x => g.def(x).type === 'Unit' && (g.def(x).cost ?? 9) <= 3), 'We Gotta Live Together : Unité à rejouer'); } });
C('wild-in-the-streets', 'Wild in the Streets', null, P, V, 5, 4, null, 'GANGER', [],
  'Vainquez une Unité épuisée.',
  { canPlay: (g, i) => g.allUnits().some(u => !u.ready), onPlay: async (g, c, i) => { await defeatPick(g, i, g.allUnits().filter(u => !u.ready), 'Wild in the Streets : vainquez une Unité épuisée'); } });
C('goro-takemura-hands-unclean', 'Goro Takemura', 'Hands Unclean', L, V, 5, 2, 7, 'ARASAKA|CORPO', ['GO_SOLO', 'BLOCKER'], '[SOLO]\n[BLOQUEUR]');
C('saburo-arasaka-stubborn-patriarch', 'Saburo Arasaka', 'Stubborn Patriarch', L, V, null, 2, null, 'ARASAKA|CORPO', [],
  'Vos Unités ARASAKA ont +1 de puissance lorsqu\'elles attaquent.',
  { aura: (g, self, t) => (g.controllerOf(t) === g.controllerOf(self) && hasTag(g, t, 'ARASAKA') && g.attacking(t) ? 1 : 0) });
C('goro-takemura-losing-his-way', 'Goro Takemura', 'Losing His Way', U, V, 4, 3, 4, 'ARASAKA|CORPO', [],
  '[ATTAQUE] Si toutes vos Légendes sont face visible, cette Unité gagne +5 de puissance ce tour.',
  { onAttack: async (g, u, i) => { if (g.P(i).legends.every(l => l.faceUp)) { g.buff(u, 5, 'turn', i); g.log('Goro gagne +5 !'); } } });

// ================================================================ BLEU =====
C('alt-cunningham-soulkiller-architect', 'Alt Cunningham', 'Soulkiller Architect', L, B, null, 2, null, 'MERC|NETRUNNER', [],
  '[⟳] : Votre prochain Programme ce tour coûte -1 €$ par Gig minimum ami (minimum 1 €$).\n1 €$, [⟳] : Jouez un Programme depuis votre rebut (en payant son coût). Placez-le sous votre deck après l\'avoir joué.',
  { abilities: [
      { label: 'Réduction de Programme', spend: true, cost: 0, run: async (g, l, i) => { g.P(i).tf.progDiscount = minGigs(g, i); g.log(`Prochain Programme : -${minGigs(g, i)} €$.`); } },
      { label: 'Programme depuis le rebut', spend: true, cost: 1, cond: (g, l, i) => g.P(i).trash.some(c => g.def(c).type === 'Program' && (!g.def(c).canPlay || g.def(c).canPlay(g, i, c)) && g.avail(i, [l.uid]) >= 1 + g.costOf(c, i)),
        run: async (g, l, i) => { const p = g.P(i); const pool = p.trash.filter(c => g.def(c).type === 'Program' && (!g.def(c).canPlay || g.def(c).canPlay(g, i, c)) && g.avail(i) >= g.costOf(c, i)); const c = (await g.pickCards(i, 'Alt : Programme à rejouer', pool, 0, 1, x => g.cardValue(x, i)))[0]; if (c) await g.playCard(i, c.uid, null, { from: p.trash, bottomAfter: true }); } }] });
C('evelyn-parker-beautiful-enigma', 'Evelyn Parker', 'Beautiful Enigma', L, B, null, 2, null, 'DOLL', [],
  'Quand une Unité CORPO ou GANGER amie vole 1 ou plusieurs Gigs, redressez 1 Eddie.\n1 €$, [⟳] : Une Unité rivale doit attaquer au prochain tour si elle le peut.',
  { on: { steal: async (g, self, d) => { const i = g.controllerOf(self); if (d.p === i && (hasTag(g, d.unit, 'CORPO') || hasTag(g, d.unit, 'GANGER'))) g.readyEddies(i, 1); } },
    abilities: [{ label: 'Provocation', spend: true, cost: 1, cond: (g, l, i) => rU(g, i).length > 0, run: async (g, l, i) => { const u = await g.pickUnit(i, 'Evelyn : Unité rivale forcée d\'attaquer', rU(g, i), x => -g.eff(x)); if (u) { g.flag(u, 'mustAttack', 'next', i); g.log(`${g.name(u)} devra attaquer.`); } } }] });
C('judy-alvarez-braindance-maestro', 'Judy Álvarez', 'Braindance Maestro', L, B, null, 2, null, 'GANGER|MOX|TECHIE', [],
  'Quand vous jouez un Programme BRAINDANCE, une Unité amie gagne +1 de puissance ce tour.\n[⟳] : Mettez au rebut la carte du dessus de votre deck. Si c\'est un Programme, vous pouvez l\'ajouter à votre main.',
  { on: { cardPlayed: async (g, self, d) => { const i = g.controllerOf(self); if (d.p === i && d.def.type === 'Program' && d.def.tags.includes('BRAINDANCE')) await buffPick(g, i, 1, 'Judy : +1 à…'); } },
    abilities: [{ label: 'Fouiller le deck', spend: true, cost: 0, run: async (g, l, i) => { const [c] = g.trashTop(i, 1); if (c && g.def(c).type === 'Program' && await g.yesNo(i, `Judy : prendre ${g.name(c)} ?`, true)) { const p = g.P(i); p.trash.splice(p.trash.indexOf(c), 1); p.hand.push(c); } } }] });
C('sasha-yakovleva-won-t-let-you-down', 'Sasha Yakovleva', 'Won\'t Let You Down', L, B, 5, 2, 0, 'MAINE\'S CREW|MERC|NETRUNNER', ['GO_SOLO'],
  '[SOLO]\n[ATTAQUE] Révélez la carte du dessus de votre deck et ajoutez-la à votre main. Cette Unité gagne ce tour une puissance égale à son coût.\n[VAINCU] Un Rival défausse 1.',
  { onAttack: async (g, u, i) => { const p = g.P(i); if (!p.deck.length) return; const c = p.deck.shift(); p.hand.push(c); const n = g.def(c).cost ?? 0; g.buff(u, n, 'turn', i); g.log(`Sasha révèle ${g.name(c)} : +${n}.`); },
    onDefeated: async (g, u, i) => { await rivalDiscards(g, i, 1); } });
C('wakako-okada-peace-and-harmony', 'Wakako Okada', 'Peace and Harmony', L, B, null, 2, null, 'FIXER|TYGER CLAWS', [],
  '[APPEL] Choisissez : une Unité rivale reçoit -2 de puissance ce tour ; ou piochez 1.\n[⟳] : Diminuez un Gig de 2 maximum.',
  { onCall: async (g, l, i) => pickMode(g, i, 'Wakako : choisissez', [
      { label: 'Une Unité rivale reçoit -2 ce tour', score: rU(g, i).some(u => inFight(g, u)) ? 2 : -1, run: () => debuffPick(g, i, 2, 'Wakako : -2 à…') },
      { label: 'Piochez 1', score: 0.5, run: () => g.draw(i, 1) }]),
    abilities: [{ label: 'Diminuer un Gig (2 max)', spend: true, cost: 0, run: async (g, l, i) => { await decreaseUpTo(g, i, 2); } }] });
C('delamain-rideshare-ai', 'Delamain', 'Rideshare AI', U, B, 3, 3, 0, 'AI', [],
  '[JEU] Piochez 2.\n(Une Unité à 0 de puissance ne vole pas de Gigs.)', { onPlay: async (g, u, i) => { await g.draw(i, 2); }, aiValue: 2 });
C('delamain-cab', 'Delamain Cab', null, U, B, 4, 2, 4, 'VEHICLE', [],
  'À la fin de votre tour, si cette Unité a volé un Gig ce tour, redressez 1 Eddie.',
  { on: { turnEnd: async (g, self, d) => { const i = g.controllerOf(self); if (d.p === i && self.flags.stoleThisTurn) g.readyEddies(i, 1); } } });
C('evelyn-parker-scheming-siren', 'Evelyn Parker', 'Scheming Siren', U, B, 2, 3, 0, 'DOLL', [],
  '[ATTAQUE] Piochez 1. Puis, si vous avez plus de ☆ qu\'un Rival, défaussez 1.',
  { onAttack: async (g, u, i) => { await g.draw(i, 1); if (g.moreSC(i)) await g.discard(i, 1); } });
C('hacked-corpo', 'Hacked Corpo', null, U, B, 4, 1, 3, 'AI|CORPO', [],
  '[JEU] Mettez au rebut les 3 cartes du dessus de votre deck. Ajoutez un Programme parmi elles à votre main.',
  { onPlay: async (g, u, i) => { await trashThenTake(g, i, 3, d => d.type === 'Program', 'Hacked Corpo : Programme à prendre'); } });
C('judy-alvarez-nothing-to-doubt', 'Judy Álvarez', 'Nothing to Doubt', U, B, 6, 5, 6, 'GANGER|MOX|TECHIE', [],
  '1 €$, [⟳] : Révélez la carte du dessus de votre deck. Vous pouvez la jouer gratuitement. Sinon, ajoutez-la à votre main.',
  { abilities: [{ label: 'Révéler et jouer', spend: true, cost: 1, cond: (g, u, i) => g.P(i).deck.length > 0,
      run: async (g, u, i) => { const p = g.P(i); const c = p.deck[0]; if (!c) return; g.log(`Judy révèle ${g.name(c)}.`); const d = g.def(c);
        const playable = d.type !== 'Legend' && (d.type !== 'Gear' || g.gearHosts(i).length) && (!d.canPlay || d.canPlay(g, i, c));
        if (playable && await g.yesNo(i, `Jouer ${g.name(c)} gratuitement ?`, true)) { await g.playCard(i, c.uid, null, { free: true, from: p.deck }); }
        else { p.deck.shift(); p.hand.push(c); } } }], aiValue: 2 });
C('lizzy-wizzy-delicate-weapon', 'Lizzy Wizzy', 'Delicate Weapon', U, B, 5, 2, 2, 'ROCKER', ['BLOCKER'],
  '[JEU] Vous pouvez jouer gratuitement un Programme de coût 3 ou moins depuis votre main ou votre rebut. Placez-le sous votre deck après l\'avoir joué.\n[BLOQUEUR]',
  { onPlay: async (g, u, i) => { const p = g.P(i); await playFreeFrom(g, i, [...p.hand, ...p.trash].filter(c => g.def(c).type === 'Program' && (g.def(c).cost ?? 9) <= 3 && (!g.def(c).canPlay || g.def(c).canPlay(g, i, c))), 'Lizzy Wizzy : Programme gratuit', { bottomAfter: true }); } });
C('maman-brigitte-spirit-of-death', 'Maman Brigitte', 'Spirit of Death', U, B, 5, 4, 3, 'MYSTIC|NETRUNNER|VOODOO BOYS', [],
  '[JEU] Vous pouvez défausser 2 Programmes. Si vous le faites, placez sous son deck une Unité rivale non équipée.',
  { onPlay: async (g, u, i) => { const p = g.P(i); const progs = p.hand.filter(c => g.def(c).type === 'Program'); const tgt = rU(g, i).filter(x => !x.gear.length); if (progs.length < 2 || !tgt.length) return;
      const best = Math.max(...tgt.map(x => val(g, x)));
      if (!(await g.yesNo(i, 'Maman Brigitte : défausser 2 Programmes ?', best >= 8))) return;
      const cs = await g.pickCards(i, 'Programmes à défausser', progs, 2, 2, x => -g.cardValue(x, i)); for (const c of cs) { p.hand.splice(p.hand.indexOf(c), 1); p.trash.push(c); }
      await bottomPick(g, i, rU(g, i).filter(x => !x.gear.length), 'Unité rivale à placer sous le deck'); } });
C('misty-olszewski-mender-of-broken-spirits', 'Misty Olszewski', 'Mender of Broken Spirits', U, B, 3, 2, 0, 'MYSTIC', [],
  'Cette Unité ne peut pas attaquer.\nÀ la fin de votre tour, nommez un type de carte. Révélez la carte du dessus de votre deck. Si c\'est ce type, ajoutez-la à votre main et redressez 1 Eddie. Sinon, mettez-la au rebut.',
  { cantAttack: () => true,
    on: { turnEnd: async (g, self, d) => { const i = g.controllerOf(self); if (d.p !== i) return; const p = g.P(i); if (!p.deck.length) return;
      const counts = { Unit: 0, Gear: 0, Program: 0 }; for (const c of p.deck) counts[g.def(c).type] = (counts[g.def(c).type] || 0) + 1;
      const t = await g.pickOne(i, 'Misty : nommez un type', ['Unit', 'Gear', 'Program'].map(k => ({ label: E.TYPE_FR[k], value: k, score: counts[k] })));
      const c = p.deck.shift(); g.log(`Misty révèle ${g.name(c)}.`);
      if (g.def(c).type === t) { p.hand.push(c); g.readyEddies(i, 1); } else p.trash.push(c); } }, aiValue: 1 });
C('modded-muramasa', 'Modded Muramasa', null, U, B, 5, 2, 4, 'VEHICLE', [],
  'À la fin de votre tour, si vous avez moins de ☆ qu\'un Rival, redressez cette Unité.',
  { on: { turnEnd: async (g, self, d) => { const i = g.controllerOf(self); if (d.p === i && g.lessSC(i)) self.ready = true; } } });
C('mox-inciters', 'Mox Inciters', null, U, B, 3, 2, 2, 'GANGER|MOX', ['BLOCKER'],
  '[JEU] Une Unité rivale doit attaquer au prochain tour si elle le peut.\n[BLOQUEUR]',
  { onPlay: async (g, u, i) => { const t = await g.pickUnit(i, 'Mox Inciters : Unité rivale forcée d\'attaquer', rU(g, i), x => -g.eff(x)); if (t) { g.flag(t, 'mustAttack', 'next', i); g.log(`${g.name(t)} devra attaquer.`); } } });
C('placide-voodoo-sentinel', 'Placide', 'Voodoo Sentinel', U, B, 8, 2, 10, 'GANGER|NETRUNNER|VOODOO BOYS', [],
  '[JEU] [ATTAQUE] Vous pouvez défausser 1 Programme. Si vous le faites, placez une Unité rivale sous son deck.',
  { onPlay: async (g, u, i) => placideFx(g, i), onAttack: async (g, u, i) => placideFx(g, i), aiValue: 2 });
async function placideFx(g, i) { const p = g.P(i); const progs = p.hand.filter(c => g.def(c).type === 'Program'); if (!progs.length) return; // L’absence d’Unité rivale n’empêche pas la défausse facultative.
  const best = Math.max(...rU(g, i).map(x => val(g, x)));
  const c = (await g.pickCards(i, 'Placide : défausser un Programme ?', progs, 0, 1, x => best - g.cardValue(x, i) - 3))[0]; if (!c) return;
  p.hand.splice(p.hand.indexOf(c), 1); p.trash.push(c); await bottomPick(g, i, rU(g, i), 'Placide : Unité rivale à placer sous le deck'); }
C('psycho-squad', 'Psycho Squad', null, U, B, 4, 1, 6, 'NCPD', [], '');
C('rita-wheeler-no-stupid-questions', 'Rita Wheeler', 'No Stupid Questions', U, B, 4, 2, 4, 'GANGER|MOX', ['BLOCKER'],
  '[BLOQUEUR]\nLa première fois que cette Unité est épuisée à chaque tour, piochez 1, puis défaussez 1.',
  { on: { spent: async (g, self, d) => { if (d.inst !== self || self.flags.usedRita) return; self.flags.usedRita = true; const i = g.controllerOf(self); await g.draw(i, 1); await g.discard(i, 1); } } });
C('rogue-amendiares-queen-of-the-afterlife', 'Rogue Amendiares', 'Queen of the Afterlife', U, B, 5, 2, 4, 'FIXER|MERC', [],
  'La première fois à chaque tour qu\'une autre Unité amie vole un Gig de valeur inférieure à la puissance de cette Unité, redressez 2 Eddies.\n[RAPIDE] 2 €$, [⟳] : Une Unité rivale reçoit -X de puissance ce tour, X étant la puissance de cette Unité.',
  { on: { steal: async (g, self, d) => { const i = g.controllerOf(self); if (d.p !== i || d.unit === self || self.flags.usedRogue) return; if (d.unit && d.gigs.some(x => x.value < g.eff(d.unit))) { self.flags.usedRogue = true; g.readyEddies(i, 2); } } },
    abilities: [{ label: 'Affaiblir', quick: true, spend: true, cost: 2, cond: (g, u, i) => rU(g, i).length > 0, run: async (g, u, i) => { await debuffPick(g, i, g.eff(u), `Rogue : -${g.eff(u)} à…`); } }], aiValue: 1 });
C('westbrook-netrunner', 'Westbrook Netrunner', null, U, B, 4, 2, 5, 'NETRUNNER', [],
  '[JEU] Jusqu\'à votre prochain tour, les Légendes rivales ne peuvent pas voler de Gigs amis de valeur inférieure à leur puissance.',
  { onPlay: async (g, u, i) => { g.P(i).prules.push({ kind: 'westbrook', dur: 'next', pf: i }); } });
C('dying-night-v-s-pistol', 'Dying Night', 'V\'s Pistol', G, B, 2, 2, 2, 'MERC|WEAPON', [],
  'Équipement.\n[ATTAQUE] Diminuez un Gig de 2 maximum.\nÀ la fin de votre tour, si cette Unité s\'appelle « V », redressez 2 Eddies.',
  { onHostAttack: async (g, gr, host, i) => { await decreaseUpTo(g, i, 2); },
    on: { turnEnd: async (g, self, d, src) => { if (!src.host) return; const i = g.controllerOf(src.host); if (d.p === i && g.def(src.host).name === 'V') g.readyEddies(i, 2); } } });
C('netwatch-netdriver', 'NetWatch Netdriver', null, G, B, 3, 2, 2, 'CYBERWARE|NETRUNNER|NETWATCH', [],
  'Équipement.\nQuand cette Unité ou Légende est épuisée, piochez 1.',
  { on: { spent: async (g, self, d, src) => { if (src.host && d.inst === src.host) await g.draw(g.controllerOf(src.host), 1); } }, aiValue: 1 });
C('tetratronic-rippler', 'Tetratronic Rippler', null, G, B, 1, 2, 1, 'CYBERWARE', [],
  'Équipement.\nQuand cette Unité ou Légende est épuisée, regardez la carte du dessus de votre deck. Vous pouvez la mettre au rebut.',
  { on: { spent: async (g, self, d, src) => { if (!src.host || d.inst !== src.host) return; const i = g.controllerOf(src.host); const p = g.P(i); const c = p.deck[0]; if (!c) return;
      if (await g.yesNo(i, `Tetratronic : mettre ${g.name(c)} au rebut ?`, g.cardValue(c, i) < 4 && p.deck.length > 10)) { p.deck.shift(); p.trash.push(c); } } } });
C('chrome-reverie', 'Chrome Reverie', null, P, B, 3, 1, null, 'BRAINDANCE', [],
  'Une Unité rivale ne peut pas attaquer jusqu\'à votre prochain tour. Si vous contrôlez un Gig minimum, vous pouvez Appeler une Légende gratuitement (un seul Appel par tour).',
  { onPlay: async (g, c, i) => { const u = await g.pickUnit(i, 'Chrome Reverie : Unité rivale immobilisée', rU(g, i), x => g.eff(x)); if (u) { g.flag(u, 'cantAttack', 'next', i); g.log(`${g.name(u)} ne peut pas attaquer.`); } if (minGigs(g, i) && !g.P(i).calledThisTurn && g.P(i).legends.some(l => !l.faceUp) && await g.yesNo(i, 'Appeler une Légende gratuitement ?', true)) await g.callFree(i); } });
C('floor-it', 'Floor It', null, P, B, 1, 1, null, 'MERC|QUICKHACK', [],
  '[RAPIDE] Une Unité rivale reçoit -1 de puissance ce tour. Piochez 1.',
  { quick: true, onPlay: async (g, c, i) => { await debuffPick(g, i, 1, 'Floor It : -1 à…'); await g.draw(i, 1); } });
C('les-e-le-mens', 'Les Élémens', null, P, B, 5, 4, null, 'CORPO', [],
  'Placez sous son deck l\'Unité rivale ayant la plus faible puissance (en cas d\'égalité, choisissez).',
  { canPlay: (g, i) => rU(g, i).length > 0, onPlay: async (g, c, i) => { const r = rU(g, i); if (!r.length) return; const mn = Math.min(...r.map(x => g.eff(x))); await bottomPick(g, i, r.filter(x => g.eff(x) === mn), 'Les Élémens : Unité la plus faible'); } });
C('nocturne-op55-n1', 'Nocturne OP55 N1', null, P, B, 3, 2, null, 'ARASAKA|PLAN', [],
  'Si votre zone Fixer est vide, jouez ce Programme pour 1 €$.\nChoisissez : piochez 2 ; ou une Unité ne peut pas attaquer jusqu\'à votre prochain tour ; ou une Légende amie peut utiliser EN SOLO pour -2 €$ ce tour (minimum 1 €$).',
  { fixedPay: (g, c, i, mode) => (mode === 'play' && !g.P(i).fixer.length ? 1 : null),
    onPlay: async (g, c, i) => pickMode(g, i, 'Nocturne : choisissez', [
      { label: 'Piochez 2', score: 1, run: () => g.draw(i, 2) },
      { label: 'Une Unité ne peut pas attaquer jusqu\'à votre prochain tour', score: rU(g, i).some(u => u.ready) ? 0.8 : -1, run: async () => { const u = await g.pickUnit(i, 'Unité immobilisée', g.allUnits(), x => (g.controllerOf(x) === i ? -1 : 1) * g.eff(x)); if (u) g.flag(u, 'cantAttack', 'next', i); } },
      { label: 'EN SOLO coûte -2 €$ ce tour', score: g.P(i).legends.some(l => l.faceUp && g.hasKw(l, 'GO_SOLO')) ? 1.2 : -1, run: async () => { g.P(i).tf.soloDiscount = 2; } }]) });
C('pyramid-song', 'Pyramid Song', null, P, B, 3, 3, null, 'BRAINDANCE', [],
  'Choisissez un effet. Si un d4 ami est un Gig minimum, choisissez les deux.\n• Une Unité rivale reçoit -4 de puissance ce tour.\n• Placez sous son deck une Unité rivale de puissance 0.',
  { canPlay: (g, i) => rU(g, i).length > 0, onPlay: async (g, c, i) => {
      const both = g.P(i).gigs.some(d => d.sides === 4 && d.value === 1);
      const a = () => debuffPick(g, i, 4, 'Pyramid Song : -4 à…');
      const b = () => bottomPick(g, i, rU(g, i).filter(x => g.eff(x) <= 0), 'Pyramid Song : Unité à 0 sous le deck');
      if (both) { await a(); await b(); }
      else await pickMode(g, i, 'Pyramid Song : choisissez', [{ label: '-4 à une Unité rivale', score: 1, run: a }, { label: 'Unité rivale à 0 sous le deck', score: rU(g, i).some(x => g.eff(x) <= 0) ? 2 : -1, run: b }]);
    } });
C('reboot-optics', 'Reboot Optics', null, P, B, 2, 2, null, 'QUICKHACK', [],
  '[RAPIDE] La prochaine fois ce tour qu\'une Unité rivale combat, elle ne vainc pas l\'Unité amie adverse.',
  { quick: true, canPlay: (g, i) => fU(g, i).length > 0, onPlay: async (g, c, i) => { g.P(i).tf.rebootOptics = true; } });
C('three-mouths-one-desire', 'Three Mouths, One Desire', null, P, B, 2, 3, null, 'BRAINDANCE|DOLL', [],
  'Regardez les 3 cartes du dessus de votre deck. Ajoutez-en 1 à votre main, +1 de plus par Gig minimum ami. Placez le reste sous votre deck.',
  { onPlay: async (g, c, i) => { await searchTop(g, i, 3, () => true, 1 + minGigs(g, i), 'Three Mouths : cartes à prendre', 'bottom', 1); } });
C('towerfall', 'Towerfall', null, P, B, 6, 4, null, 'BRAINDANCE', [],
  'Choisissez un effet. Si vous avez moins de ☆ qu\'un Rival, choisissez les deux.\n• Toutes les Unités rivales reçoivent -5 de puissance ce tour.\n• Placez sous le deck toutes les Unités rivales de puissance 0.',
  { canPlay: (g, i) => rU(g, i).length > 0, onPlay: async (g, c, i) => {
      const a = async () => { for (const u of rU(g, i)) g.buff(u, -5, 'turn', i); g.log('Towerfall : -5 à toutes les Unités rivales.'); };
      const b = async () => { for (const u of rU(g, i).filter(x => g.eff(x) <= 0)) await g.bottomDeckUnit(u); };
      if (g.lessSC(i)) { await a(); await b(); }
      else await pickMode(g, i, 'Towerfall : choisissez', [{ label: '-5 à toutes les Unités rivales', score: 1, run: a }, { label: 'Unités rivales à 0 sous le deck', score: rU(g, i).filter(x => g.eff(x) <= 0).length * 2 - 0.5, run: b }]);
    }, aiValue: 1 });
C('unlikely-bond', 'Unlikely Bond', null, P, B, 4, 2, null, 'MAELSTROM|MOX', [],
  'Placez sous votre deck une de vos Unités prêtes. Si vous le faites, placez sous son deck une Unité rivale épuisée.',
  { canPlay: (g, i) => fU(g, i).some(u => u.ready), // la seconde instruction est conditionnelle
    onPlay: async (g, c, i) => { const mine = await g.pickUnit(i, 'Unlikely Bond : votre Unité prête', fU(g, i).filter(u => u.ready), x => -val(g, x)); if (!mine) return; await g.bottomDeckUnit(mine); await bottomPick(g, i, rU(g, i).filter(u => !u.ready), 'Unité rivale épuisée à placer sous le deck'); } });
C('jackie-welles-pour-one-out-for-me', 'Jackie Welles', 'Pour One Out For Me', L, B, null, 2, null, 'MERC', [],
  'La première fois à chaque tour que vous jouez une Unité ou un Équipement Bleu, vous pouvez diminuer un Gig ami de 2 maximum. S\'il devient un Gig minimum, piochez 1.',
  { on: { cardPlayed: async (g, self, d) => { const i = g.controllerOf(self); if (d.p !== i || d.def.color !== 'Blue' || !['Unit', 'Gear'].includes(d.def.type) || g.P(i).tf.jackieBlue) return; g.P(i).tf.jackieBlue = true;
      const opts = []; for (const die of g.P(i).gigs) for (let n = 1; n <= 2; n++) { const nv = die.value - n; if (nv < 1) continue; opts.push({ label: `d${die.sides} : ${die.value} → ${nv}`, value: `${die.uid}:${nv}`, gig: die, score: (nv === 1 ? 3 : -1) - (g.isMaxGig(die) ? 2 : 0) }); }
      const v = await g.pickOne(i, 'Jackie : diminuer un Gig ami ?', opts, { optional: true }); if (!v) return; const [uid, nv] = v.split(':').map(Number); const die = g.P(i).gigs.find(x => x.uid === uid); await g.setGig(die, nv, i); if (die.value === 1) await g.draw(i, 1); } } });
C('v-corporate-exile', 'V', 'Corporate Exile', L, B, 5, 2, 8, 'CORPO|MERC', ['GO_SOLO'], '[SOLO]');
C('mt0d12-flathead', 'MT0D12 Flathead', null, U, B, 5, 3, 7, 'DRONE|MILITECH', [],
  'Si vous avez moins de ☆ qu\'un Rival, cette Unité ne peut pas être bloquée.', { cantBeBlocked: (g, u) => g.lessSC(g.controllerOf(u)) });
C('jacked-in-voodoo-boy', 'Jacked-In Voodoo Boy', null, U, B, 2, 2, 2, 'NETRUNNER|VOODOO BOYS', [],
  'Cette Unité ne peut pas attaquer, sauf si vous avez joué un Programme ce tour.', { cantAttack: (g, u) => !g.P(g.controllerOf(u)).tf.playedProgram });
C('modded-kusanagi', 'Modded Kusanagi', null, U, B, 6, 2, 8, 'TYGER CLAWS|VEHICLE', ['ADRENALINE'],
  '[ADRÉNALINE]\nÀ la fin de votre tour, renvoyez cette Unité dans la main de son propriétaire.',
  { on: { turnEnd: async (g, self, d) => { if (d.p === g.controllerOf(self)) await g.returnToHand(self); } } });
C('trust-no-one', 'Trust No One', null, P, B, 1, 1, null, 'BRAINDANCE', [],
  'Diminuez un Gig de 3 maximum. Puis, si vous contrôlez un Gig minimum, piochez 1.',
  { onPlay: async (g, c, i) => { await decreaseUpTo(g, i, 3, 'Diminuez un Gig (3 max)'); if (minGigs(g, i)) await g.draw(i, 1); } });


// ------------------------------------------- noms officiels en français --
// Source : base officielle (impressions « Retail — FR »), relevé etw-tcg.com ; 7 noms
// d'exclusivités de decks de démarrage traduits ici (non officiels).
(function () {
  const FR = {
"adam-smasher-ender-of-legends": "Adam Smasher: Acheveur De Légendes",
"dexter-deshawn-off-the-grid": "Dexter DeShawn: Indétectable",
"johnny-silverhand-rocking-renegade": "Johnny Silverhand: Rock'n'Rebelle",
"royce-psycho-on-the-edge": "Royce: Psychoverdose",
"v-streetkid": "V: Gosse Des Rues",
"6th-street-recruits": "Recrues Des 6th Street",
"animals-wrecker": "Destructeur Des Animals",
"chrome-fang": "Croc Chromé",
"el-sombrero-n-la-venganza-lenta": "El Sombrerón: La Venganza Lenta",
"japantown-jonin": "Jônin De Japantown",
"johnny-silverhand-never-stop-fighting": "Johnny Silverhand: N'abandonne Jamais Le Combat",
"kerry-eurodyne-the-last-rockerboy": "Kerry Eurodyne: Le Dernier Rockerboy",
"la-llorona-ghost-of-the-past": "La Llorona: Fantôme Du Passé",
"meredith-stout-stone-cold-corpo": "Meredith Stout: Corpo Sans Pitié",
"octant": "Octant",
"royce-don-t-call-me-simon": "Royce: J'suis Pas Simon",
"ruthless-lowlife": "Racaille Impitoyable",
"screw-lovelorn-fool": "Screw: Seul En Amour",
"swordwise-huscle": "Gros Bras Sabreur",
"v-roamer-of-the-badlands": "V: Errance À Travers Les Badlands",
"valentino-guerrera": "Guerrera Des Valentinos",
"yorinobu-arasaka-steel-dragon": "Yorinobu Arasaka: Dragon D'acier",
"arasaka-emergency-radioport": "Radioport d'urgence d'Arasaka",
"deadman-transmitter": "Émetteur Deadman",
"mantis-blades": "Lames Mantis",
"satori-sword-of-saburo": "Satori: Lame De Saburo",
"all-is-lost": "Tout Est Perdu",
"appetite-for-destruction": "Soif de Destruction",
"bonnie-and-clyde": "Bonnie et Clyde",
"carnage-at-the-colosseum": "Massacre au Colisée",
"detonate": "Détonation",
"gunpoint-diplomacy": "Diplomatie du Pistolet",
"industrial-assembly": "Assemblage Industriel",
"over-the-edge": "Au Bord du Gouffre",
"shattered-memories": "Souvenirs en Lambeaux",
"yorinobu-arasaka-embracing-destruction": "Yorinobu Arasaka: Adepte de la Destruction",
"minotaur": "Minotaure",
"dum-dum-maelstrom-triggerman": "Dum Dum: As de la Gâchette du Maelstrom",
"kerry-eurodyne-axe-attitude-audience": "Kerry Eurodyne: Une Gratte, du Style et un Public",
"muamar-reyes-el-capita-n": "Muamar Reyes: El Capitán",
"river-ward-detective-on-the-hunt": "River Ward: Détective en Action",
"rogue-amendiares-preem-solo": "Rogue Amendiares: Solo Premios",
"adam-smasher-metal-over-meat": "Adam Smasher: Chair de Métal",
"alt-cunningham-mother-of-daemons": "Alt Cunningham: Mère des Daemons",
"augmented-negotiators": "Négociateurs Augmentés",
"caliber-totentanz-s-top-dog": "Caliber: La Meilleure du Totentanz",
"gilded-mato-n": "Matón Doré",
"hanako-arasaka-in-a-gilded-cage": "Hanako Arasaka: Mise en Cage Dorée",
"heywood-ripperdoc": "Charcudoc d'Heywood",
"jackie-welles-ride-or-die-choom": "Jackie Welles: Marche ou Crève",
"maelstrom-goons": "Sbires du Maelstrom",
"maxtac-suppression-team": "Escouade de Répression de la MaxTac",
"offduty-malfini": "Malfini Après le Boulot",
"rockn-rockerboy": "Rockn' Rockerboy",
"secondhand-bombus": "Bombus d'Occasion",
"sketchy-ripper": "Charcu Louche",
"t-bug-amateur-philosopher": "T-Bug: Philosophe Amatrice",
"trauma-team-operatives": "Agents de la Trauma Team",
"viktor-vektor-drop-your-illusions": "Viktor Vektor: Oublie tes Illusions",
"viktor-vektor-you-might-feel-a-little-pinch": "Viktor Vektor: Ça va Picoter un Peu",
"viktor-vektor-sit-down-and-relax": "Viktor Vektor: Assieds-toi et Détends-toi",
"dexter-deshawn-one-last-chance": "Dexter DeShawn: Une Dernière Chance",
"adrenaline-converter": "Convertisseur d'Adrénaline",
"gorilla-arms": "Bras de Gorille",
"kiroshi-optics": "Optiques Kiroshi",
"mandibular-upgrade": "Amélioration Mandibulaire",
"the-relic-experimental-biochip": "La Relic: Biopuce Expérimentale",
"zetatech-faceplate": "Plaque Faciale Zetatech",
"afterparty-at-lizzie-s": "After au Lizzie's",
"bootleg-black-sapphire-show": "Bootleg du Show au Black Sapphire",
"cyberpsychosis": "Cyberpsychose",
"live-with-the-aftermath": "Vis Avec les Conséquences",
"safety-override": "Détournement de Sécurité",
"the-heist": "Le Casse",
"goro-takemura-vengeful-bodyguard": "Goro Takemura: Garde du Corps Vindicatif",
"hanako-arasaka-daughter-of-the-emperor": "Hanako Arasaka: Fille de l'Empereur",
"jackie-welles-mama-s-favorite": "Jackie Welles: Chouchou de Mama",
"padre-man-of-the-cross": "Padre: Arborant sa Croix",
"panam-palmer-nomad-cavalry": "Panam Palmer: Cavalerie Nomade",
"corpo-security": "Sécurité Corpo",
"emergency-atlus": "Atlus d'Urgence",
"field-operator": "Agent de Terrain",
"maelstrom-zealots": "Zélotes du Maelstrom",
"maxtac-av": "Navi de la MaxTac",
"maxtac-heavy": "Artilleur Lourd de la MaxTac",
"maxtac-squadron": "Escadron de la MaxTac",
"nadia-fighting-through-grief": "Nadia: Combattant le Deuil",
"pacifica-netrunner": "Netrunner de Pacifica",
"panam-palmer-strength-through-family": "Panam Palmer: La Famille Fait la Force",
"pepe-najarro-working-doubles": "Pepe Najarro: Met les Bouchées Doubles",
"riding-nomad": "Nomade en Cavale",
"sandayu-oda-hanako-s-guardian": "Sandayu Oda: Garde d'Hanako",
"saul-bright-stormrider": "Saul Bright: Chevauche la Tempête",
"tyger-s-whisper": "Murmure du Tyger",
"valentino-street-racer": "Pilote des Valentinos",
"wraith-marauders": "Maraudeurs des Wraiths",
"overwatch-panam-s-gift": "Overwatch: Cadeau de Panam",
"riot-shield": "Bouclier Anti-Émeute",
"sandevistan": "Sandevistan",
"zetatech-berserk": "Zetatech Berserk",
"corporate-surveillance": "Surveillance Corpo",
"don-t-fear-the-reaper": "(Don't Fear) The Reaper",
"fool-on-the-hill": "Fool on the Hill",
"memory-relapse": "Rechute Mémoire",
"peace-offering": "Symbole de Paix",
"synapse-burnout": "Surmenage Synaptique",
"take-control": "Prise de Contrôle",
"we-gotta-live-together": "We Gotta Live Together",
"wild-in-the-streets": "Les Rues en Roue Libre",
"goro-takemura-hands-unclean": "Goro Takemura: Les Mains Souillées",
"saburo-arasaka-stubborn-patriarch": "Saburo Arasaka: Patriarche Entêté",
"goro-takemura-losing-his-way": "Goro Takemura: Égaré",
"alt-cunningham-soulkiller-architect": "Alt Cunningham: Conceptrice du Tueur d'Âmes",
"evelyn-parker-beautiful-enigma": "Evelyn Parker: Belle et Énigmatique",
"judy-alvarez-braindance-maestro": "Judy Álvarez: Maestro de la Danse Sensorielle",
"sasha-yakovleva-won-t-let-you-down": "Sasha Yakovleva: Tu Peux Compter Sur Moi",
"wakako-okada-peace-and-harmony": "Wakako Okada: Paix et Harmonie",
"delamain-rideshare-ai": "Delamain: IA Pilote",
"delamain-cab": "Taxi Delamain",
"evelyn-parker-scheming-siren": "Evelyn Parker: Une Sirène Qui Cache Son Jeu",
"hacked-corpo": "Corpo Piraté",
"judy-alvarez-nothing-to-doubt": "Judy Álvarez: Pas l'Ombre d'un Doute",
"lizzy-wizzy-delicate-weapon": "Lizzy Wizzy: Delicate Weapon",
"maman-brigitte-spirit-of-death": "Maman Brigitte: Esprit de la Mort",
"misty-olszewski-mender-of-broken-spirits": "Misty Olszewski: Répare les Âmes Brisées",
"modded-muramasa": "Muramasa Modifiée",
"mox-inciters": "Incitatrices des Mox",
"placide-voodoo-sentinel": "Placide: Sentinelle des Voodoos",
"psycho-squad": "Team Psycho",
"rita-wheeler-no-stupid-questions": "Rita Wheeler: Pas de Question Idiote",
"rogue-amendiares-queen-of-the-afterlife": "Rogue Amendiares: Reine de l'Afterlife",
"westbrook-netrunner": "Netrunner de Westbrook",
"dying-night-v-s-pistol": "Nuit Moribonde: Le Pistolet de V",
"netwatch-netdriver": "NetWatch Netdriver",
"tetratronic-rippler": "Tetratronic Rippler",
"chrome-reverie": "Rêverie de Chrome",
"floor-it": "Pleins Gaz",
"les-e-le-mens": "Les Élémens",
"nocturne-op55-n1": "Nocturne OP55 N1",
"pyramid-song": "Pyramid Song",
"reboot-optics": "Redémarrage d'Optiques",
"three-mouths-one-desire": "Trois Bouches, un Désir",
"towerfall": "Destruction de Tour",
"unlikely-bond": "Relation Improbable",
"jackie-welles-pour-one-out-for-me": "Jackie Welles: Un Verre en Ma Mémoire",
"v-corporate-exile": "V: Exil Corpo",
"mt0d12-flathead": "MT0D12 Flathead",
"jacked-in-voodoo-boy": "Voodoo Boy Connecté",
"modded-kusanagi": "Kusanagi Modifiée",
"trust-no-one": "N'aie Confiance en Personne"
};
  const UNOFFICIAL = ["minotaur", "viktor-vektor-sit-down-and-relax", "dexter-deshawn-one-last-chance", "goro-takemura-losing-his-way", "jackie-welles-pour-one-out-for-me", "v-corporate-exile", "mt0d12-flathead"];
  for (const [id, fr] of Object.entries(FR)) { const d = CARDS[id]; if (!d) continue; d.nameEn = d.name; d.subEn = d.sub; const k = fr.indexOf(': '); if (k > 0) { d.name = fr.slice(0, k); d.sub = fr.slice(k + 2); } else { d.name = fr; d.sub = null; } d.frUnofficial = UNOFFICIAL.includes(id); }
})();

const scVal = E.scVal || (v => (v === null || v === undefined ? -1 : v));

// ------------------------------------------------------------- Decks ------
const STARTERS = {
  'embracing-power': { name: 'Embrasser le pouvoir (Arasaka)', desc: 'Deck de démarrage officiel, rouge et vert', legends: ['goro-takemura-hands-unclean', 'saburo-arasaka-stubborn-patriarch', 'yorinobu-arasaka-embracing-destruction'],
    list: { 'ruthless-lowlife': 3, 'swordwise-huscle': 2, 'chrome-fang': 2, 'minotaur': 2, 'mantis-blades': 3, 'arasaka-emergency-radioport': 2, 'satori-sword-of-saburo': 3, 'industrial-assembly': 2, 'over-the-edge': 2, 'shattered-memories': 2, 'corpo-security': 3, 'emergency-atlus': 2, 'field-operator': 2, 'goro-takemura-losing-his-way': 2, 'maxtac-av': 2, 'sandevistan': 3, 'corporate-surveillance': 3 } },
  'the-heist': { name: 'Le Casse (Mercenaires)', desc: 'Deck de démarrage officiel, jaune et bleu', legends: ['v-corporate-exile', 'jackie-welles-pour-one-out-for-me', 'viktor-vektor-sit-down-and-relax'],
    list: { 'secondhand-bombus': 2, 'dexter-deshawn-one-last-chance': 2, 'offduty-malfini': 2, 't-bug-amateur-philosopher': 2, 'heywood-ripperdoc': 2, 'kiroshi-optics': 3, 'mandibular-upgrade': 3, 'zetatech-faceplate': 3, 'afterparty-at-lizzie-s': 2, 'evelyn-parker-scheming-siren': 3, 'delamain-cab': 3, 'psycho-squad': 2, 'mt0d12-flathead': 2, 'tetratronic-rippler': 2, 'dying-night-v-s-pistol': 2, 'floor-it': 3, 'reboot-optics': 2 } },
};
function expandList(list) { const out = []; for (const [id, n] of Object.entries(list)) for (let k = 0; k < n; k++) out.push(id); return out; }

// note IA d'une carte pour la construction automatique de decks
function cardRating(id) {
  const d = CARDS[id]; if (!d || d.type === 'Legend') return 0;
  const c = d.cost ?? 0;
  let r = 0;
  if (d.type === 'Unit') r = (d.power ?? 0) - c * 1.05 + 2 + (d.txt ? 1.2 : 0) + (d.kw.includes('BLOCKER') ? 0.8 : 0) + (d.kw.includes('ADRENALINE') ? 0.8 : 0);
  else if (d.type === 'Gear') r = (d.power ?? 0) * 0.9 - c * 0.6 + 1.5;
  else r = 2.2 - c * 0.15;
  if (d.cantAttack) r -= 1.5;
  return r + (d.aiValue || 0) * 0.6;
}
function autoDeck(legendIds, rng = Math.random, size = 40) {
  const lim = E.deckRamLimits(legendIds);
  const pool=Object.values(CARDS).filter(d=>d.type!=='Legend' && lim[d.color]>0 && (d.ram||0)<=lim[d.color]);
  const main=[], copies={}, types={Unit:0,Gear:0,Program:0}, curve=[0,0,0,0];
  const targets={Unit:Math.round(size*.56),Gear:Math.round(size*.19),Program:size-Math.round(size*.56)-Math.round(size*.19)};
  const legendColors=legendIds.map(id=>CARDS[id]?.color).filter(Boolean);
  for(let n=0;n<size;n++) {
    const available=pool.filter(d=>(copies[d.id]||0)<3);
    if (!available.length) break;
    const ranked=available.map(d=>{
      const c=d.cost??0, band=c<=2?0:c<=4?1:c<=6?2:3;
      const typeNeed=targets[d.type]-types[d.type];
      const targetCurve=[Math.round(size*.2),Math.round(size*.42),Math.round(size*.3),size][band];
      let score=cardRating(d)*.73 + Math.min(4,typeNeed)*.75;
      score += (legendColors.filter(x=>x===d.color).length-1)*.7;
      score += c<=4?1.5 : c>=7?-1.1:0;
      score -= Math.max(0,curve[band]-targetCurve)*1.8;
      score -= Math.max(0,types[d.type]-targets[d.type])*3.0;
      if((copies[d.id]||0)===1) score+=.35;
      if(d.kw?.includes('BLOCKER') && types.Unit<targets.Unit) score+=.6;
      return {d,band,score:score+rng()*.7};
    }).sort((a,b)=>b.score-a.score);
    const choice=ranked[0], d=choice.d;
    main.push(d.id);copies[d.id]=(copies[d.id]||0)+1;types[d.type]++;curve[choice.band]++;
  }
  return {legends:legendIds.slice(),main};
}
const PRESET_LEGENDS = {
  'maelstrom': { name: 'Chrome & Maelstrom', desc: 'Rouge et jaune, agressif', legends: ['royce-psycho-on-the-edge', 'adam-smasher-ender-of-legends', 'dum-dum-maelstrom-triggerman'] },
  'voodoo': { name: 'Voodoo Net', desc: 'Bleu et vert, contrôle', legends: ['alt-cunningham-soulkiller-architect', 'wakako-okada-peace-and-harmony', 'padre-man-of-the-cross'] },
  'nomades': { name: 'Famille Aldecaldo', desc: 'Vert et jaune, équipements', legends: ['panam-palmer-nomad-cavalry', 'jackie-welles-mama-s-favorite', 'rogue-amendiares-preem-solo'] },
  'rockers': { name: 'Samurai Reunion', desc: 'Jaune et rouge, Gigs et pioche', legends: ['kerry-eurodyne-axe-attitude-audience', 'river-ward-detective-on-the-hunt', 'johnny-silverhand-rocking-renegade'] },
  'netrunners': { name: 'Daemons de Night City', desc: 'Bleu et jaune, programmes', legends: ['judy-alvarez-braindance-maestro', 'evelyn-parker-beautiful-enigma', 'muamar-reyes-el-capita-n'] },
  'arasaka': { name: 'Dragon d\'acier', desc: 'Vert et rouge, Arasaka', legends: ['hanako-arasaka-daughter-of-the-emperor', 'goro-takemura-vengeful-bodyguard', 'v-streetkid'] },
};
// Deux adversaires de reference publics, ajoutes pour le laboratoire de self-play.
// Listes datees; leur popularite ne garantit pas leur taux de victoire.
const META_DECKS = {"RYY_River_Royce_Viktor":{"name":"Meta RYY — River / Royce / Viktor","desc":"Liste communautaire RYY 40 cartes, ripperdeck 17/11/2026","source":"https://ripperdeck.gg/decks/archetypes/river-ward-detective-on-the-hunt-royce-psycho-on-the-edge-viktor-vektor-sit-down-and-relax","legends":["river-ward-detective-on-the-hunt","royce-psycho-on-the-edge","viktor-vektor-sit-down-and-relax"],"main":["secondhand-bombus","secondhand-bombus","augmented-negotiators","augmented-negotiators","dexter-deshawn-one-last-chance","la-llorona-ghost-of-the-past","la-llorona-ghost-of-the-past","viktor-vektor-you-might-feel-a-little-pinch","6th-street-recruits","meredith-stout-stone-cold-corpo","meredith-stout-stone-cold-corpo","royce-don-t-call-me-simon","screw-lovelorn-fool","johnny-silverhand-never-stop-fighting","kiroshi-optics","kiroshi-optics","mandibular-upgrade","adrenaline-converter","adrenaline-converter","satori-sword-of-saburo","satori-sword-of-saburo","zetatech-faceplate","zetatech-faceplate","gorilla-arms","gorilla-arms","afterparty-at-lizzie-s","afterparty-at-lizzie-s","afterparty-at-lizzie-s","all-is-lost","all-is-lost","detonate","industrial-assembly","industrial-assembly","the-heist","live-with-the-aftermath","live-with-the-aftermath","live-with-the-aftermath","bootleg-black-sapphire-show","bootleg-black-sapphire-show","bootleg-black-sapphire-show"]},"BBG_Alt_Hanako_Jackie":{"name":"Meta BBG — Ctrl Alt Delete","desc":"Liste publiée Zatu 23/10/2026, contrôle des Gigs et Programmes","source":"https://zatu.com/en-au/blogs/reviews/cyberpunk-tcg-tech-deck-ctrl-alt-delete","legends":["alt-cunningham-soulkiller-architect","hanako-arasaka-daughter-of-the-emperor","jackie-welles-pour-one-out-for-me"],"main":["jacked-in-voodoo-boy","jacked-in-voodoo-boy","jacked-in-voodoo-boy","mox-inciters","mox-inciters","pepe-najarro-working-doubles","pepe-najarro-working-doubles","pepe-najarro-working-doubles","psycho-squad","lizzy-wizzy-delicate-weapon","lizzy-wizzy-delicate-weapon","maman-brigitte-spirit-of-death","maman-brigitte-spirit-of-death","placide-voodoo-sentinel","floor-it","floor-it","floor-it","peace-offering","peace-offering","peace-offering","trust-no-one","trust-no-one","trust-no-one","three-mouths-one-desire","three-mouths-one-desire","three-mouths-one-desire","chrome-reverie","chrome-reverie","chrome-reverie","nocturne-op55-n1","nocturne-op55-n1","pyramid-song","pyramid-song","pyramid-song","les-e-le-mens","les-e-le-mens","les-e-le-mens","towerfall","towerfall","towerfall"]}};
function presetDecks(seed = 7) {
  let s = seed; const rng = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const out = {};
  for (const [k, v] of Object.entries(STARTERS)) out[k] = { name: v.name, desc: v.desc, legends: v.legends, main: expandList(v.list), official: true };
  for (const [k, v] of Object.entries(PRESET_LEGENDS)) { const d = autoDeck(v.legends, rng, 42); out[k] = { name: v.name, desc: v.desc, legends: d.legends, main: d.main }; }
  // Decks adversaires publiques : 40 cartes et controle RAM valides lors de l'audit.
  for (const [k, v] of Object.entries(META_DECKS)) out['meta-'+k] = { ...v, main: v.main.slice(), legends:v.legends.slice(), official:false };
  return out;
}

const api = { STARTERS, presetDecks, autoDeck, cardRating, expandList };
if (typeof module !== 'undefined') module.exports = api; else Object.assign(root, api);
})(typeof window !== 'undefined' ? window : globalThis);

// ============================================================================
//  IA — 3 niveaux :
//   • facile  : politique heuristique rapide (+ bruit)
//   • normal  : 1 coup d'avance — chaque action est simulée sur une copie
//   • expert  : Monte-Carlo déterminisé (infos cachées rebattues) avec
//               simulation du reste du tour ET du tour adverse
// ============================================================================
'use strict';
(function (root) {
const E = (typeof module !== 'undefined') ? require('./engine.js') : root;
const { Game, GameOver } = E;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// ------------------------------------------------------------ évaluation --
function unitWorth(g, u) {
  const d = g.def(u);
  let w = 2 + g.eff(u) * 0.75 + (d.cost ?? 4) * 0.25 + u.gear.length * 0.6;
  if (g.hasKw(u, 'BLOCKER')) w += 0.8;
  if (d.cantAttack) w -= 1.5;
  if (d.type === 'Legend') w += 1.5;
  if (d.aiValue) w += d.aiValue * 0.5;
  return w;
}
function stealPot(g, u) { const p = g.eff(u); return p <= 0 ? 0 : Math.floor(p / 10) + 1; }

function evaluate(g, me, nextMover) {
  const s = g.s, o = 1 - me;
  if (s.winner !== null && s.winner !== undefined) return s.winner === me ? 100000 : s.winner === -1 ? 0 : -100000;
  const P = g.P(me), Q = g.P(o);
  if (nextMover === undefined) nextMover = 1 - s.active;
  const gm = P.gigs.length, go = Q.gigs.length;
  // Course aux sept Gigs : la valeur marginale devient décisive à l'approche du but.
  const race = n => 8*n + (n >= 4 ? (n-3)*5 : 0) + (n >= 6 ? 14 : 0);
  let v = race(gm) - race(go);
  if (gm >= 7) v += nextMover === me || s.overtime ? 3000 : 100;
  if (go >= 7) v -= nextMover === o || s.overtime ? 3000 : 100;
  // La Street Cred apporte une valeur secondaire, qui ne doit pas éclipser les Gigs.
  v += ((g.sc(me) ?? 0) - (g.sc(o) ?? 0)) * 0.13;
  const pieces = (side) => {
    let worth=0, offense=0, defense=0, readyBlock=0, attackers=0;
    for (const u of g.P(side).field) {
      const d=g.def(u), p=g.eff(u), ready=u.ready && !u.lag;
      const w=unitWorth(g,u);
      worth += w*(ready ? 1.08 : .88);
      if (g.hasKw(u,'BLOCKER')) { defense+=2.5; if (ready) readyBlock=Math.max(readyBlock,p); }
      if (!d.cantAttack && !d.cantAttackGigs && p>0) {
        attackers++; offense += (Math.floor(p/10)+1)*(ready ? 1.25 : .65);
      }
    }
    return {worth,offense,defense,readyBlock,attackers};
  };
  const A=pieces(me), B=pieces(o);
  v += A.worth - B.worth + .8*(A.defense-B.defense);
  // Anticipation du prochain tour adverse ; la défense monte en valeur avec 5+ Gigs adverses.
  const stealThreat=(side,other,block)=>{
    let value=0;
    for (const u of g.P(side).field) {
      const d=g.def(u); if (d.cantAttack || d.cantAttackGigs) continue;
      const power=g.eff(u), amount=power>0 ? Math.floor(power/10)+1 : 0;
      value += power>block ? amount : amount*.2;
    }
    return Math.min(value,g.P(other).gigs.length);
  };
  const threatMe=stealThreat(me,o,B.readyBlock), threatOpp=stealThreat(o,me,A.readyBlock);
  v += (nextMover===me ? 5.5:2.5)*threatMe;
  v -= (nextMover===o ? 8:3.5)*threatOpp;
  v += 1.0*(P.hand.length-Q.hand.length);
  const stage = s.turn<8 ? 1.7 : s.turn<20 ? 1.0 : .6;
  v += stage*(P.eddies.length-Q.eddies.length);
  v += .9*(P.legends.filter(l=>l.faceUp).length-Q.legends.filter(l=>l.faceUp).length);
  if (P.deck.length<5) v-=(5-P.deck.length)*4;
  if (Q.deck.length<5) v+=(5-Q.deck.length)*4;
  // Ne pas être à court de menaces quand l'adversaire possède déjà une armée.
  if (!A.attackers && B.attackers) v -= 5;
  if (!B.attackers && A.attackers) v += 5;
  return v;
}

// ----------------------------------------------------- politique rapide ---
function cardVal(g, c, i) { return g.cardValue(c, i); }
function fastScore(g, i, a) {
  const p = g.P(i), o = 1 - i;
  switch (a.type) {
    case 'end': return 0;
    case 'sell': {
      const c = p.hand.find(x => x.uid === a.uid); const d = g.def(c);
      if (d.sell !== true) return -999;
      const ed = p.eddies.length, available = g.avail(i), after = available + 1;
      const targets = p.hand.filter(x => x.uid !== c.uid && g.def(x).type !== 'Legend');
      const unlock = targets.some(x => g.costOf(x, i) > available && g.costOf(x, i) <= after && g.canPlay(i, x) === false);
      const useful = targets.some(x => g.costOf(x, i) <= after);
      const futureSell = targets.filter(x => g.def(x).sell === true).length;
      let want = ed < 2 ? 6.2 : ed < 4 ? 4.2 : ed < 6 ? 2.7 : ed < 8 ? 1.2 : -0.1;
      if (unlock) want += 2.6;
      if (!useful && ed >= 5) want -= 1.0;
      if (futureSell === 0 && ed >= 3) want -= .9;
      return want + (5 - cardVal(g, c, i)) * .30 - (d.quick && g.P(i).gigs.length >= 5 ? 2 : 0);
    }
    case 'call': return 3.2;
    case 'play': {
      const c = p.hand.find(x => x.uid === a.uid); const d = g.def(c);
      if (d.type === 'Unit') return 3 + (d.power ?? 0) * 0.45 + (d.cost ?? 0) * 0.3 + (d.aiValue || 0);
      if (d.type === 'Gear') { const h = g.byUid(a.host); return h ? 1.5 + (d.power ?? 0) * 0.5 + (h.ready && g.canAttackNow(h) ? 1 : 0) + (g.isLegend(h) && !g.P(i).field.includes(h) ? -1 : 0) : -1; }
      return 2.2 + (d.cost ?? 0) * 0.35 + (d.quick ? -1.5 : 0) + (d.aiValue || 0);
    }
    case 'solo': { const l = g.byUid(a.uid); return 3.5 + g.eff(l) * 0.4; }
    case 'legendField': return 0.5;
    case 'activate': { const src = g.byUid(a.uid); const d = g.def(src); const ab = d.abilities[a.idx]; return ab.quick && !g.s.attack ? 0.6 : 1.8; }
    case 'attack': {
      const u = g.byUid(a.uid); const pu = g.eff(u, { fight: true });
      if (a.target.kind === 'gigs') {
        const blockers = g.P(o).field.filter(b => b.ready && g.hasKw(b, 'BLOCKER'));
        const best = blockers.length ? Math.max(...blockers.map(b => g.eff(b))) : -1;
        const sp = stealPot(g, u);
        if (!sp) return -1;
        let sc = 5 + sp * 6;
        if (best >= pu) sc = 1.5; else if (blockers.length) sc -= 2;
        return sc;
      }
      const t = g.byUid(a.target.uid); const pt = g.eff(t, { fight: true });
      if (pu > pt) return 3 + unitWorth(g, t);
      if (pu === pt) return unitWorth(g, t) - unitWorth(g, u) + 0.5;
      return -3;
    }
  }
  return 0;
}
const FastPolicy = {
  noise: 0.3,
  async mainAction(g, i, acts) {
    let best = null, bs = -1e9;
    const forced = !acts.some(a => a.type === 'end');
    for (const a of acts) { const s = fastScore(g, i, a) + g.rand() * this.noise + (forced && a.type === 'attack' ? 50 : 0); if (s > bs) { bs = s; best = a; } }
    if (bs <= 0.2 && !forced) return { type: 'end' };
    return best;
  },
  async react(g, i, A, acts) {
    // bloquer si le bloqueur survit, ou s'il empêche un vol et coûte peu
    const att = g.byUid(A.attacker); if (!att) return { type: 'pass' };
    const pa = g.eff(att, { fight: true });
    let best = { type: 'pass' }, bs = 0;
    for (const a of acts) {
      if (a.type === 'block') {
        const b = g.byUid(a.uid); const pb = g.eff(b, { fight: true, defending: true });
        let s = 0;
        if (pb > pa) s = 6 + unitWorth(g, att);
        else if (A.target.kind === 'gigs') s = stealPot(g, att) * 9 - unitWorth(g, b) * (pb === pa ? 0.5 : 1);
        else { const t = g.byUid(A.target.uid); if (t && g.eff(t) < pa) s = unitWorth(g, t) - unitWorth(g, b); }
        if (s > bs) { bs = s; best = a; }
      } else if (a.type === 'play' || a.type === 'activate') {
        const s = 0.5 + g.rand(); if (s > bs && g.rand() < 0.35) { bs = s; best = a; }
      } else if (a.type === 'call') { if (g.rand() < 0.25 && bs < 1) { bs = 1; best = a; } }
    }
    return best;
  },
  async choose(g, i, req) { return aiChoose(g, i, req, 0.15); },
  async mulligan(g, i) { return mulliganRule(g, i); },
  dieScore(g, i, s) { return s === 6 ? 2 : s; },
};
function aiChoose(g, i, req, noise = 0) {
  const opts = req.options.map(o => ({ o, s: (o.score ?? 0) + (noise ? g.rand() * noise : 0) }));
  opts.sort((a, b) => b.s - a.s);
  const out = [];
  for (const { o, s } of opts) {
    if (out.length >= req.max) break;
    if (out.length < req.min || s > 0) out.push(o.value);
  }
  return out;
}
function mulliganRule(g, i) {
  const h = g.P(i).hand.map(c => g.def(c));
  const cheapUnits = h.filter(d => d.type === 'Unit' && (d.cost ?? 9) <= 4).length;
  const heavy = h.filter(d => (d.cost ?? 0) >= 6).length;
  const sellable = h.filter(d => d.sell === true).length;
  return sellable < 2 || (cheapUnits === 0 && sellable < 4) || (heavy >= 4 && sellable < 3);
}

// ----------------------------------------------------- simulation utils ---
function simDeciders() { const w = root.AIChampion?.(); const P = root.AdaptiveAI; const D=root.DeckPlanAI; const plans=root.AIPlanChampion?.(); return (w && P) ? [D?D.makePolicy(w,plans):P.makePolicy(w), D?D.makePolicy(w,plans):P.makePolicy(w)] : [FastPolicy, FastPolicy]; }
function determinize(g2, me, sampleSeed) {
  const s = g2.s;
  s.seed = (sampleSeed ?? (s.seed ^ Math.imul(s.turn+1,0x9e3779b9))) | 0;
  const o = 1 - me, Q = s.players[o], P = s.players[me];
  // main adverse inconnue : on rebat main + deck et on redistribue
  const n = Q.hand.length; const pool = Q.hand.concat(Q.deck); g2.shuffle(pool); Q.hand = pool.slice(0, n); Q.deck = pool.slice(n);
  g2.shuffle(P.deck);
  for (const pl of [P, Q]) { const fd = pl.legends.filter(l => !l.faceUp); const ids = fd.map(l => l.id); g2.shuffle(ids); fd.forEach((l, k) => { l.id = ids[k]; }); }
}
async function runSim(g2, fn) {
  try { await fn(); } catch (e) { if (e instanceof GameOver) { g2.s.winner = e.winner; return; } throw e; }
}
// applique une action principale puis termine le tour (politique rapide) puis joue le tour adverse
async function rollout(g, me, action, depthOpp = true, sampleSeed) {
  const g2 = g.clone(simDeciders(), { sim: true });
  determinize(g2, me, sampleSeed);
  await runSim(g2, async () => {
    await g2.doAction(me, action);
    g2.checkOT();
    if (action.type !== 'end') await g2.mainPhase();
    await g2.endTurn();
    if (depthOpp) { await g2.startTurn(); await g2.mainPhase(); await g2.endTurn(); }
  });
  return evaluate(g2, me, depthOpp ? me : 1 - me);
}
async function oneStep(g, me, action, sampleSeed) {
  const g2 = g.clone(simDeciders(), { sim: true });
  determinize(g2, me, sampleSeed);
  await runSim(g2, async () => { if (action.type !== 'end') await g2.doAction(me, action); g2.checkOT(); });
  return evaluate(g2, me, 1 - me);
}

// Audit tactique 19/11/2026 : règles officielles 17/11 + synergies documentées.
// Heuristique additionnelle (pas une garantie de victoire, ni un réseau neuronal).
function knowledgeScore(g,i,a){
  const p=g.P(i),q=g.P(1-i),hand=new Set(p.hand.map(x=>x.id)),
    field=new Set(p.field.map(x=>x.id)),leg=new Set(p.legends.filter(x=>x.faceUp).map(x=>x.id)),
    all=new Set([...field,...leg]), mine=p.gigs.length,other=q.gigs.length;
  const has=(id)=>hand.has(id)||all.has(id);
  const faceUp=(id)=>leg.has(id);
  const delta=(before,after)=> {
    if(after<=0)return 0;
    const b=before<=0?0:Math.floor(before/10)+1;
    const c=Math.floor(after/10)+1;
    return 3.8*(c-b); // palier 10, 20, 30 : vol d'un Gig additionnel
  };
  if(a.type==='sell'){
    const c=g.byUid(a.uid);if(!c)return -200;
    const id=c.id,d=g.def(c);
    if(d.sell!==true)return -200;
    let penalty=0;
    const preserve={
      'zetatech-faceplate':['royce-psycho-on-the-edge','swordwise-huscle','sketchy-ripper'],
      'satori-sword-of-saburo':['river-ward-detective-on-the-hunt'],
      'mantis-blades':['royce-psycho-on-the-edge','maxtac-heavy'],
      'three-mouths-one-desire':['alt-cunningham-soulkiller-architect','hanako-arasaka-daughter-of-the-emperor','jackie-welles-pour-one-out-for-me'],
      'pyramid-song':['hanako-arasaka-daughter-of-the-emperor','jackie-welles-pour-one-out-for-me'],
      'the-relic-experimental-biochip':['the-heist','live-with-the-aftermath'],
      'cyberpsychosis':['royce-psycho-on-the-edge','adrenaline-converter']
    };
    if(preserve[id]?.some(has))penalty+=2.7;
    if((id==='safety-override'||id==='bonnie-and-clyde'||id==='cyberpsychosis')&&other>=5)penalty+=2.6;
    if(id==='three-mouths-one-desire'&&p.gigs.some(x=>x.value===1))penalty+=2;
    if(id==='pyramid-song'&&p.gigs.some(x=>x.sides===4&&x.value===1))penalty+=3;
    if(id==='zetatech-faceplate'&&leg.has('royce-psycho-on-the-edge'))penalty+=2.6;
    if(p.hand.filter(x=>x.id===id).length>1) penalty*=.55;
    return -penalty;
  }
  if(a.type==='play'){
    const c=g.byUid(a.uid);if(!c)return 0;
    const d=g.def(c),id=c.id;let bonus=0;
    if(d.type==='Gear'){
      const h=g.byUid(a.host);if(!h)return 0;
      bonus+=delta(g.eff(h),g.eff(h)+(d.power||0));
      if(id==='zetatech-faceplate'){
        bonus+=1.8;
        if(p.gigs.length>=3&&new Set(p.gigs.map(x=>x.value)).size>=3)bonus+=2.7;
        if(h.id==='royce-psycho-on-the-edge')bonus+=1.7;
      }
      if(id==='satori-sword-of-saburo'&&g.canAttackNow(h))bonus+=1.4;
      if(id==='the-relic-experimental-biochip'&&p.trash.some(x=>g.def(x).type==='Unit'&&(g.def(x).cost||0)<=9))bonus+=3;
      if(id==='sandevistan'&&g.canAttackNow(h))bonus+=1.5;
    }
    if(id==='three-mouths-one-desire') bonus+=Math.min(4,p.gigs.filter(x=>x.value===1).length)*1.15;
    if(id==='pyramid-song'&&p.gigs.some(x=>x.sides===4&&x.value===1))bonus+=3.4;
    if(id==='towerfall'&&q.field.filter(x=>g.eff(x)<=5).length>=2)bonus+=2.4;
    if(id==='les-e-le-mens'&&q.field.length===1)bonus+=1.8;
    if(id==='maxtac-heavy'&&q.field.length>=3)bonus+=1.8;
    if(id==='cyberpsychosis'&&p.field.some(x=>x.gear.length>=2))bonus+=2.0;
    if(id==='pepe-najarro-working-doubles'&&p.legends.filter(x=>x.faceUp&&g.def(x).tags?.includes('MERC')).length>=2)bonus+=1.7;
    if(id==='mt0d12-flathead'&&g.lessSC(i))bonus+=1.4;
    if(d.type==='Unit'&&mine>=5&&other>=5)bonus+=Math.max(0,8-(d.cost||0))*.22;
    return bonus;
  }
  if(a.type==='attack'&&a.target.kind==='gigs'){
    const u=g.byUid(a.uid);if(!u)return 0;
    const n=g.stealCount(u);let bonus=Math.min(n,other)*.65;
    if(mine+Math.min(n,other)>=7)bonus+=(g.s.overtime?1000:45);
    if(other>=6)bonus+=2.5;
    return bonus;
  }
  if(a.type==='call'&&p.legends.some(x=>!x.faceUp)&&p.hand.some(x=>x.id==='three-mouths-one-desire'))return .6;
  return 0;
}

// ----------------------------------------------------------- deciders ----
function makeAI(level = 'normal') {
  const cfg = {
    facile: {noise: 2.1},
    normal: {candidates: 9, finalists: 4, budget: 135, rounds: 3, maxRounds: 6},
    expert: {candidates: 14, finalists: 7, budget: 510, rounds: 5, maxRounds: 15}
  }[level] || {candidates:7,lookahead:1};
  const ai = {
    level, decisions:0, thought: null,
    async mulligan(g,i) { return mulliganRule(g,i); },
    dieScore(g,i,s) { return s===6 ? 2 : s; },
    async choose(g,i,req) { return aiChoose(g,i,req,level==='facile'?1.2:.01); },
    async react(g,i,A,acts) {
      if (level==='facile') return FastPolicy.react(g,i,A,acts);
      let best={type:'pass'}, bestScore=-Infinity;
      const capped=acts.filter(a=>a.type==='pass'||a.type==='block'||a.type==='call'||a.type==='activate'||a.type==='play');
      for (const a of capped.slice(0,18)) {
        let total=0, tested=0;
        const n=level==='expert'?3:1;
        for (let k=0;k<n;k++) {
          const g2=g.clone(simDeciders(),{sim:true});
          determinize(g2,i);
          try {
            await runSim(g2, async()=>{
              const A2=g2.s.attack; if (!A2) return;
              if (a.type!=='pass') await g2.doReaction(i,a,A2);
              await g2.resolveAttack(A2);
            });
            total+=evaluate(g2,i,g2.s.active); tested++;
          } catch(_) { /* option incompatible dans ce contexte */ }
        }
        if (!tested) continue;
        const score=total/tested + (a.type==='pass'?.2:0)+(!g.hooks.sim&&root.RivalLearning?root.RivalLearning.biasReaction(g,i,a,A,root.RivalLearningSession?.(),root.RivalLearningData?.()):0);
        if(score>bestScore){bestScore=score;best=a;}
      }
      return best;
    },
    async mainAction(g,i,acts) {
      if (g.hooks.thinking) g.hooks.thinking(true);
      try {
        if (level==='facile') return FastPolicy.mainAction(g,i,acts);
        if (!acts.length) return {type:'end'};
        const forced=!acts.some(a=>a.type==='end');
        // Recherche à faisceau : le préfiltrage élimine les coups sans intérêt sans
        // éliminer les attaques gagnantes et le passage de tour.
        const source=dedupe(g,i,acts);
        const weights=root.AIChampion?.(); const ranked=source.map(a=>({a,score:(weights&&root.AdaptiveAI ? .82*root.AdaptiveAI.score(g,i,a,weights)+.18*fastScore(g,i,a) : fastScore(g,i,a))+knowledgeScore(g,i,a)+(root.DeckPlanAI?root.DeckPlanAI.bias(g,i,a,root.AIPlanChampion?.()):0)+(!g.hooks.sim&&root.RivalLearning?root.RivalLearning.bias(g,i,a,root.RivalLearningSession?.(),root.RivalLearningData?.()):0)})).sort((a,b)=>b.score-a.score);
        const shortlist=diverseShortlist(ranked,cfg.candidates);
        // On n'élague pas une attaque gagnante ni un équipement qui franchit 10/20 de puissance.
        for(const x of ranked) {
          if(shortlist.includes(x))continue;
          if((x.a.type==='attack'&&x.a.target?.kind==='gigs'&&g.P(i).gigs.length+Math.min(g.stealCount(g.byUid(x.a.uid)),g.P(1-i).gigs.length)>=7)
             ||(x.a.type==='play'&&knowledgeScore(g,i,x.a)>=3.8)) {
            shortlist.push(x);if(shortlist.length>=cfg.candidates+5)break;
          }
        }
        if (!forced && !shortlist.some(x=>x.a.type==='end')) shortlist.push({a:{type:'end'},score:0});
        if (!shortlist.length) return {type:'end'};
        const candidates=[];
        for (const item of shortlist) {
          try {
            const v=await oneStep(g,i,item.a, (g.s.seed ^ Math.imul(g.s.turn+1,0x9e3779b9))|0);
            candidates.push({a:item.a, pre:v + .22*item.score, heuristic:item.score});
          } catch (_) { /* la simulation est conservatrice si une action ne peut être reproduite */ }
        }
        if(!candidates.length) return ranked[0]?.a || {type:'end'};
        candidates.sort((a,b)=>b.pre-a.pre);
        const finalist=candidates.slice(0,cfg.finalists);
        if(!forced && !finalist.some(x=>x.a.type==='end')) {
          const end=candidates.find(x=>x.a.type==='end'); if(end) finalist.push(end);
        }
        const stats=finalist.map(x=>({a:x.a,n:0,total:0,pre:x.pre}));
        const t0=now(); let rounds=0;
        do {
          const sampleSeed=(g.s.seed ^ Math.imul(g.s.turn+1,0x9e3779b9) ^ Math.imul(rounds+1,0x85ebca6b))|0;
          for (const st of stats) {
            try { st.total+=await rollout(g,i,st.a,true,sampleSeed);st.n++; }
            catch (_) { st.total+=st.pre-10;st.n++; }
          }
          rounds++;
          // Laisser le navigateur afficher une image et traiter les interactions.
          if (rounds%2===0 && !g.hooks.sim) await new Promise(r=>setTimeout(r,0));
        } while ((rounds<cfg.rounds || (now()-t0<cfg.budget && rounds<cfg.maxRounds)) && rounds<cfg.maxRounds);
        stats.sort((a,b)=>(b.total/Math.max(1,b.n)+b.pre*.18)-(a.total/Math.max(1,a.n)+a.pre*.18));
        this.decisions++;
        return stats[0].a;
      } finally { if(g.hooks.thinking) g.hooks.thinking(false); }
    },
  };
  return ai;
}
// regroupe les actions équivalentes (même carte, même cible) pour réduire la recherche
function dedupe(g, i, acts) {
  // Regroupement uniquement des duplicata strictement identiques : chaque UID,
  // cible, hôte et capacité a son état propre. Ne jamais tronquer les ventes.
  const seen=new Set(),out=[];
  for(const a of acts){
    const key=[a.type,a.uid??'',a.host??'',a.idx??'',a.target?.kind??'',a.target?.uid??''].join(':');
    if(!seen.has(key)){seen.add(key);out.push(a);}
  }
  return out;
}
function diverseShortlist(ranked,capacity){
  const chosen=[],seen=new Set();
  const add=x=>{if(x&&!seen.has(x)){seen.add(x);chosen.push(x);}};
  for(const x of ranked.slice(0,capacity))add(x);
  // Une option pour chaque famille ET une issue défensive/tempo différente.
  for(const typ of ['end','sell','play','attack','activate','call','solo','legendField']) add(ranked.find(x=>x.a.type===typ));
  const firstHost=new Set(),firstUnit=new Set();
  for(const x of ranked){
    const a=x.a;
    if(a.type==='play'&&a.host&&!firstHost.has(a.host)){firstHost.add(a.host);add(x);}
    if(a.type==='attack'&&!firstUnit.has(a.uid)){firstUnit.add(a.uid);add(x);}
    if(chosen.length>=capacity+12)break;
  }
  return chosen.slice(0,capacity+12);
}

const api = { makeAI, FastPolicy, evaluate, aiChoose };
if (typeof module !== 'undefined') module.exports = api; else Object.assign(root, api);
})(typeof window !== 'undefined' ? window : globalThis);

/* 7 GIGS — Adaptive tactics (no external AI service)
 * 8-dimensional policy optimized by complete self-play matches.
 * Distinct from a neural network: an evolutionary linear-heuristic policy.
 */
'use strict';
(function(root) {
const E = typeof module !== 'undefined' ? require('./engine.js') : root;
const A = typeof module !== 'undefined' ? require('./ai.js') : root;
const {Game, CARDS}=E;
const {FastPolicy,evaluate,aiChoose}=A;
const DIM=['economy','deployment','steal','control','synergy','defense','tempo','abilities'];
const BASE=[1,1,1,1,1,1,1,1];
function clip(v){return Math.max(.25,Math.min(2.8,Number(v)||1));}
function normalize(w){return (Array.isArray(w)&&w.length===8?w:BASE).map(clip);}
function score(g,i,a,weights=BASE){
 const w=normalize(weights);const p=g.P(i), q=g.P(1-i), turn=g.s.turn;
 const feel=(key)=>w[DIM.indexOf(key)];
 const nG=p.gigs.length, oppG=q.gigs.length;
 const costFactor=1/(1+turn/15);
 switch(a.type){
 case 'end':return 0;
 case 'sell':{
   const c=g.byUid(a.uid); if(!c)return -99;const d=g.def(c);
   const avail=g.avail(i), income=p.eddies.length;
   if(d.sell!==true)return -999;
   const other=p.hand.filter(x=>x.uid!==c.uid && g.def(x).type!=='Legend');
   const unlock=other.some(x=>g.costOf(x,i)>avail&&g.costOf(x,i)<=avail+1);
   const canAfford=other.some(x=>g.costOf(x,i)<=avail+1);
   const alternative=other.filter(x=>g.def(x).sell===true).length;
   let v=(income<2?6.2:income<4?4.2:income<6?2.7:income<8?1.2:-.1) * feel('economy')*(.72+.28*costFactor);
   if(unlock)v+=2.6*feel('tempo');
   if(!canAfford&&income>=5)v-=1.0;
   if(!alternative&&income>=3)v-=.9;
   v+=(5-g.cardValue(c,i))*.30;
   if(d.type==='Program'&&d.quick&&nG>=5)v-=2*feel('abilities');
   return v;
 }
 case 'call':return (p.legends.filter(x=>x.faceUp).length===0 ? 3:1.3)*feel('abilities')*(g.avail(i)>2?1.2:.8);
 case 'play':{
   const c=g.byUid(a.uid); if(!c)return -99;const d=g.def(c);const cost=g.costOf(c,i);
   let eff=0;
   if(d.type==='Unit'){
     const power=Math.max(0,d.power||0);const active=q.field.filter(x=>x.ready).length;
     eff= (3.2+power*.43+(d.aiValue||0)*.45)*feel('deployment');
     if(g.hasKw(c,'BLOCKER')) eff+= (2+oppG*.7)*feel('defense');
     if(p.field.some(u=>g.def(u).tags?.some(t=>d.tags?.includes(t))))eff+=1.4*feel('synergy');
     if(q.field.length>p.field.length)eff+=1.7*feel('defense');
     if(nG>=6) eff+=2*feel('tempo');
   }else if(d.type==='Gear'){
     const host=g.byUid(a.host);if(!host)return -99;
     eff=(1.7+(d.power||0)*.57+Math.max(0,g.eff(host)-5)*.17)*feel('synergy');
     if(!host.lag&&host.ready)eff+=1.7*feel('tempo');
     if(g.hasKw(host,'BLOCKER') && oppG>=5)eff+=1.3*feel('defense');
   }else{
     eff=(2.5+cost*.35+(d.aiValue||0)) *feel('abilities');
     if(d.quick)eff-=2.2;
     if(nG>=6 || oppG>=6)eff+=1.3*feel('tempo');
   }
   return eff-.13*cost;
 }
 case 'attack':{
   const u=g.byUid(a.uid);if(!u)return -99;
   const myPower=g.eff(u,{fight:true});
   if(a.target.kind==='gigs'){
      const potential=g.stealCount(u);
      if(!potential || q.gigs.length===0)return -30;
      const block=q.field.filter(x=>x.ready && g.hasKw(x,'BLOCKER'));
      const strongest=block.length?Math.max(...block.map(x=>g.eff(x,{fight:true}))):-1;
      let v=(4+Math.min(potential,q.gigs.length)*6.5)*feel('steal');
      if(nG+potential>=7)v+=12*feel('tempo');
      if(oppG>=6)v+=3*feel('defense');
      if(strongest>=myPower)v-=12*feel('control');
      else if(block.length)v-=2.8*feel('control');
      // without next attacker, stop expending best blockers at opponent 6 gigs
      if(g.hasKw(u,'BLOCKER') && oppG>=5 && p.field.filter(x=>g.hasKw(x,'BLOCKER')&&x.ready).length<=1)v-=6*feel('defense');
      return v;
   }
   const t=g.byUid(a.target.uid);if(!t)return -99;
   const our=g.eff(u,{fight:true,vs:t}),their=g.eff(t,{fight:true,vs:u});
   const td=g.def(t),ud=g.def(u);
   const worth=3+(their*.5)+(td.cost||0)*.4+(td.aiValue||0)*.55+(g.hasKw(t,'BLOCKER')?3:0);
   if(our>their)return (4+worth)*feel('control')+(g.hasKw(t,'BLOCKER')?3*feel('steal'):0);
   if(our===their)return (worth - (3+our*.42+(ud.cost||0)*.35))*feel('control');
   return -8*feel('control');
 }
 case 'solo':{const l=g.byUid(a.uid);return l?(3+g.eff(l)*.55)*feel('deployment'):0;}
 case 'legendField':return .7*feel('deployment');
 case 'activate':{
   const inst=g.byUid(a.uid), ab=inst&&g.def(inst).abilities?.[a.idx];
   return ab?(ab.quick?0.4:2.5)*feel('abilities')+(p.gigs.length>=6?2*feel('tempo'):0):0;
 }
 }
 return 0;
}
function makePolicy(weights,opts={}){
 const w=normalize(weights),noise=Number(opts.noise??.05);
 return {
  weights:w, async mainAction(g,i,acts){
    if(!acts.length)return {type:'end'};
    const forced=!acts.some(a=>a.type==='end');
    let best=forced?null:{type:'end'},max=forced?-Infinity:.15;
    for(const a of acts){
      const s=score(g,i,a,w)+(g.rand()-.5)*noise;
      if(s>max){best=a;max=s;}
    }
    return best||{type:'end'};
  },
  async react(g,i,A,acts){
    const att=g.byUid(A.attacker);if(!att)return {type:'pass'};
    const pa=g.eff(att,{fight:true});let best={type:'pass'},max=0;
    const gigRisk=A.target.kind==='gigs'?g.stealCount(att):0;
    for(const a of acts){
      let v=-99;
      if(a.type==='block'){
        const unit=g.byUid(a.uid);if(!unit)continue;
        const my=g.eff(unit,{fight:true,defending:true});
        const saved=my>=pa?g.def(att).cost||4:0;
        const cost=my<pa ? (g.def(unit).cost||3)*.7 + my*.24 : my===pa ? (g.def(unit).cost||3)*.4:0;
        const oldGig=g.P(i).gigs.length;
        v=(my>=pa?2:0)+saved*w[3] +gigRisk*(oldGig>=5?8:4.5)*w[5] -cost;
        if(A.target.kind==='unit') {
          const target=g.byUid(A.target.uid);
          if(target && my < pa)v-=g.eff(target)*.2;
        }
      } else if(a.type==='call')v=(gigRisk>=2?2.1:0.3)*w[7];
      else if(a.type==='activate' || a.type==='play')v=(gigRisk?1.2:0.5)*w[7];
      if(v>max+.01){max=v;best=a;}
    }
    return best;
  },
  async choose(g,i,req){return aiChoose(g,i,req,.01);},
  async mulligan(g,i){const h=g.P(i).hand.map(c=>g.def(c));const resource=h.filter(d=>d.sell===true).length;const unit=h.some(d=>d.type==='Unit'&&d.cost<=4);return resource<2||(!unit&&resource<4)||(h.filter(d=>(d.cost??0)>=6).length>=4&&resource<3);},
  dieScore(g,i,s){return s===6?2:s;}
 };
}
function mutate(genome,rand=Math.random,scale=.23){return normalize(genome.map(v=>v+(rand()*2-1)*scale));}

// Evolution en tournoi : des IA jouent de VRAIES parties via Game.run.
// Le champion existant est préservé si aucun challenger n'obtient un avantage
// sur un duel de validation à départ alterné.
async function trainLeague(deckSource,matchCount=300,incumbent=BASE,report=()=>{},cancel=()=>false){
 const decks=Array.isArray(deckSource)?deckSource:Object.values(deckSource);
 if(decks.length<2)throw new Error('Il faut au moins deux decks');
 const initial=normalize(incumbent);
 const pop=[{w:initial.slice(),rating:1000,played:0,id:0}];
 for(let k=1;k<12;k++)pop.push({w:mutate(initial,Math.random,.45),rating:1000,played:0,id:k});
 let serial=12,done=0;
 for(let n=0;n<matchCount;n++){
   if(cancel())return {cancelled:true,done};
   if(n && n%100===0){
     pop.sort((a,b)=>b.rating-a.rating);
     const elite=pop.slice(0,4);
     const next=Array.from({length:8},(_,j)=>({w:mutate(elite[j%4].w,Math.random,n===100?.28:.17),rating:1000,played:0,id:serial++}));
     pop.length=0;pop.push(...elite,...next);
   }
   const ix=n%pop.length, jx=(ix+1+Math.floor(Math.random()*(pop.length-1)))%pop.length;
   const A=pop[ix],B=pop[jx], flip=(n%2)===1;
   const di=Math.floor(n/2)%decks.length, dj=(di+1+Math.floor(n/16))%decks.length;
   const d0=decks[di],d1=decks[dj];
   const g=Game.create([d0,d1],flip?[makePolicy(B.w),makePolicy(A.w)]:[makePolicy(A.w),makePolicy(B.w)],{
     seed:7951+Math.floor(n/2)*7919,hooks:{sim:true}});
   const r=await g.run(94);
   if(r.status==='incomplete'){report({done,total:matchCount,phase:'incomplete'});continue;}
   const actual=r.winner<0?.5:r.winner===(flip?1:0)?1:0;
   const expect=1/(1+Math.pow(10,(B.rating-A.rating)/400));
   const change=20*(actual-expect);
   A.rating+=change;B.rating-=change;A.played++;B.played++;done++;
   if(done%8===0||done===matchCount){
     const lead=pop.reduce((a,b)=>a.rating>b.rating?a:b);
     report({done,total:matchCount,leader:lead.id,elo:Math.round(lead.rating),phase:'training'});
     if(typeof window!=='undefined')await new Promise(r=>setTimeout(r,0));
   }
 }
 pop.sort((a,b)=>b.rating-a.rating);
 const candidate=pop[0];
 // Comparaison double côté sur 40 parties indépendantes. Aucun remplacement
 // n'est effectué lorsque l'amélioration n'est pas suffisamment nette.
 let wins=0,losses=0,draws=0,incompleteValidation=0;
 for(let k=0;k<40;k++){
   if(cancel())return {cancelled:true,done};
   const flip=k%2===1,di=Math.floor(k/2)%decks.length,dj=(di+3)%decks.length;
   const g=Game.create([decks[di],decks[dj]],flip?[makePolicy(initial),makePolicy(candidate.w)]:[makePolicy(candidate.w),makePolicy(initial)],{
      seed:17849+Math.floor(k/2)*1031,hooks:{sim:true}});
   const r=await g.run(94);
   if(r.status==='incomplete'){incompleteValidation++;continue;}
   if(r.winner<0)draws++;else if(r.winner===(flip?1:0))wins++;else losses++;
   if(k%8===7){report({done,total:matchCount,validation:k+1,phase:'validation'});if(typeof window!=='undefined')await new Promise(r=>setTimeout(r,0));}
 }
 const upgraded=incompleteValidation===0 && wins+draws*.5>=24;
 return {matches:done,validationMatches:40,wins,losses,draws,incompleteValidation,upgraded,weights:upgraded?candidate.w:initial,candidateWeights:candidate.w};
}
function getAPI(){return {DIM,BASE,normalize,score,makePolicy,mutate,trainLeague};}
if(typeof module!=='undefined')module.exports=getAPI();else Object.assign(root,{AdaptiveAI:getAPI()});
})(typeof window!=='undefined'?window:globalThis);

// ============================================================================
//  PLANS TACTIQUES — apprentissage distinct par archétype et contre-adaptation
//  Apprentissage évolutif en parties réelles, sans tricher sur la main adverse.
// ============================================================================
(function(root){
'use strict';
const {Game,CARDS}=typeof module!=='undefined'?require('./engine'):root, base=typeof module!=='undefined'?require('./adaptive'):root.AdaptiveAI;
const FAMILIES=['aggro','equipment','control','midrange'];
const INITIAL={aggro:[1.15,0.9,0.65,0.65,0.9],equipment:[1,1.12,1.0,1.35,1],control:[.8,1.15,1.25,1.0,1.25],midrange:[1,1,1,1,1]};
const LABELS=['tempo','combo','control','preserve','defense'];
const clip=v=>Math.max(.4,Math.min(2.2,v));
function normalize(plans){const x={};for(const family of FAMILIES)x[family]=Array.from({length:5},(_,i)=>clip(plans?.[family]?.[i]??INITIAL[family][i]));return x;}
function classify(g,i){
 const p=g.P(i), seen=[...p.deck,...p.hand,...p.trash,...p.removed,...p.field,...p.field.flatMap(u=>u.gear),...p.legends.flatMap(l=>l.gear),...p.eddies.map(e=>e.card).filter(Boolean)], cards=seen.map(c=>CARDS[c.id]).filter(Boolean);
 const counts={Red:0,Yellow:0,Blue:0,Green:0,Unit:0,Gear:0,Program:0};
 for(const d of cards){counts[d.color]=(counts[d.color]||0)+1;counts[d.type]=(counts[d.type]||0)+1;}
 const ls=p.legends.map(x=>CARDS[x.id]);
 if(counts.Gear>=8&&counts.Yellow>=8)return'equipment';
 if(counts.Red>=12&&counts.Unit>=18)return'aggro';
 if((counts.Blue+counts.Green)>=26&&counts.Program>=10)return'control';
 if(ls.filter(l=>l?.color==='Green'||l?.color==='Blue').length>=2&&counts.Program>=9)return'control';
 return'midrange';
}
function rivalStyle(g,i){ // seulement les zones révélées de l'adversaire
 const q=g.P(1-i),seen=[...q.field,...q.trash,...q.eddies.map(e=>e.card).filter(Boolean),...q.legends.filter(l=>l.faceUp)],n=seen.length||1;
 let units=0,gear=0,program=0;
 for(const c of seen){const type=CARDS[c.id]?.type;if(type==='Unit')units++;if(type==='Gear')gear++;if(type==='Program')program++;}
 return {aggressive:units/n,gear:gear/n,program:program/n,threat:q.gigs.length};
}
function comboState(g,i){
 const p=g.P(i),ids=new Set([...p.hand,...p.field,...p.legends.filter(l=>l.faceUp)].map(x=>x.id));
 const s={};s.faceplate=ids.has('zetatech-faceplate')&&ids.has('royce-psycho-on-the-edge');
 s.relic=ids.has('the-relic-experimental-biochip')&&p.trash.some(c=>CARDS[c.id]?.type==='Unit');
 s.legends=['alt-cunningham-soulkiller-architect','hanako-arasaka-daughter-of-the-emperor','jackie-welles-mama-s-favorite'].filter(id=>ids.has(id)).length;
 s.minGig=p.gigs.some(d=>d.value===1);
 return s;
}
function bias(g,i,a,plans){
 const w=normalize(plans)[classify(g,i)],e=g.P(i),r=g.P(1-i),threat=rivalStyle(g,i),c=comboState(g,i);
 if(a.type==='end')return 0;
 if(a.type==='sell'){
   const inst=g.byUid(a.uid);if(!inst)return -1e3;
   const id=inst.id,d=CARDS[id],other=e.hand.filter(x=>x.uid!==a.uid);
   const partners={
    'zetatech-faceplate':['royce-psycho-on-the-edge'],
    'mantis-blades':['swordwise-huscle','satori-sword-of-saburo'],
    'the-relic-experimental-biochip':['adam-smasher-metal-over-meat'],
    'three-mouths-one-desire':['alt-cunningham-soulkiller-architect','hanako-arasaka-daughter-of-the-emperor'],
   };
   let reserve=0;
   for(const [lead,allies] of Object.entries(partners))if(id===lead&&allies.some(x=>other.some(t=>t.id===x)||e.field.some(t=>t.id===x)||e.legends.some(t=>t.id===x)))reserve+=2.8*w[3];
   if(d?.quick&&threat.threat>=5)reserve+=1.4*w[4];
   if(d?.type==='Gear'&&e.field.some(u=>g.eff(u)%10>=7))reserve+=1.1*w[1];
   const canUnlock=other.some(x=>g.costOf(x,i)>g.avail(i)&&g.costOf(x,i)<=g.avail(i)+1);
   return (canUnlock?1.5*w[0]:0)-reserve;
 }
 if(a.type==='play'){
   const inst=g.byUid(a.uid);if(!inst)return -999;
   const d=CARDS[inst.id],host=a.host?g.byUid(a.host):null;
   let n=0;
   if(d.type==='Gear'&&host){
     const old=g.eff(host),newPower=old+(d.power||0);
     if(old>0)n+=2.6*Math.max(0,Math.floor(newPower/10)-Math.floor(old/10))*w[1];
     if(inst.id==='zetatech-faceplate'&&host.id==='royce-psycho-on-the-edge')n+=2.7*w[1];
   }
   if(d.type==='Unit'){
     if(threat.threat>=5&&g.hasKw(inst,'BLOCKER'))n+=1.8*w[4];
     if(g.s.turn<=8&&(d.cost||0)<=3)n+=1.1*w[0];
   }
   if(inst.id==='the-relic-experimental-biochip'&&c.relic)n+=1.9*w[1];
   if(inst.id==='three-mouths-one-desire'&&c.minGig)n+=1.5*w[1];
   if(inst.id==='towerfall'&&r.field.length>=2)n+=1.4*w[2];
   if(threat.aggressive>.55&&d.type==='Program'&&/defeat|vainc|spend|épuise/i.test(d.text||''))n+=1.0*w[2];
   return n;
 }
 if(a.type==='attack'){
   const attacker=g.byUid(a.uid);if(!attacker)return 0;
   if(a.target?.kind==='gigs'){
     const taken=Math.min(g.stealCount(attacker),r.gigs.length);
     const current=e.gigs.length;
     return (taken>=2?1.8*w[0]:0)+(current+taken>=7?14*w[0]:0)+(threat.threat>=6?2*w[4]:0);
   }
   const target=g.byUid(a.target?.uid);return target&&g.eff(attacker)>g.eff(target)?1.5*w[2]:0;
 }
 if(a.type==='call'&&c.legends>=1)return .7*w[1];
 return 0;
}
function score(g,i,a,weights,plans){return base.score(g,i,a,weights)+bias(g,i,a,plans);}
function makePolicy(weights,plans,opts={}){
 const fallback=base.makePolicy(weights,{noise:opts.noise??.06});
 return {...fallback, async mainAction(g,i,actions){
  const forced=!actions.some(a=>a.type==='end');let max=forced?-1e30:.1,best=forced?null:{type:'end'};
  for(const a of actions){const v=score(g,i,a,weights,plans)+(g.rand()-.5)*(opts.noise??.06);if(v>max){max=v;best=a;}}
  return best||{type:'end'};
 }};
}
function mutate(plans,random=Math.random,scale=.28){
 const out=normalize(plans);for(const f of FAMILIES)for(let i=0;i<5;i++)if(random()<.55)out[f][i]=clip(out[f][i]+(random()-.5)*2*scale);return out;
}
async function trainLeague(decks,matchCount,weights,previous,report=()=>{},cancel=()=>false){
 if(!Array.isArray(decks)||decks.length<2)throw Error('Deux decks minimum');
 let rngSeed=(0x7f4a7c15 ^ Math.imul(matchCount, 1664525) ^ Math.floor((weights?.[0]||1)*1e6))>>>0;
 const random=()=>{rngSeed=(rngSeed+0x6D2B79F5)|0;let x=rngSeed;x=Math.imul(x^(x>>>15),x|1);x^=x+Math.imul(x^(x>>>7),x|61);return ((x^(x>>>14))>>>0)/4294967296;};
 const incumbent=normalize(previous),pop=[{id:0,plan:incumbent,elo:1000}];
 for(let k=1;k<10;k++)pop.push({id:k,plan:mutate(incumbent,random,.55),elo:1000});
 let serial=10,done=0;
 for(let n=0;n<matchCount;n++){
  if(cancel())return {cancelled:true,done};
  if(n&&n%100===0){pop.sort((a,b)=>b.elo-a.elo);const elite=pop.slice(0,3);pop.splice(0,pop.length,...elite,...Array.from({length:7},(_,j)=>({id:serial++,plan:mutate(elite[j%3].plan,random,.23),elo:1000})));}
  const ia=n%pop.length,ib=(ia+1+Math.floor(n/10)%(pop.length-1))%pop.length,flip=n%2===1;
  const [p,q]=[pop[ia],pop[ib]], di=Math.floor(n/2)%decks.length,dj=(di+3+Math.floor(n/24))%decks.length;
  const gs=Game.create([decks[di],decks[dj]],flip?[makePolicy(weights,q.plan),makePolicy(weights,p.plan)]:[makePolicy(weights,p.plan),makePolicy(weights,q.plan)],{seed:911+Math.floor(n/2)*6719,hooks:{sim:true}});
  const res=await gs.run(90); if(res.status==='incomplete')continue;
  const result=res.winner<0?.5:res.winner===(flip?1:0)?1:0;
  const expected=1/(1+10**((q.elo-p.elo)/400)),adjust=20*(result-expected);p.elo+=adjust;q.elo-=adjust;done++;
  if(done%10===0||done===matchCount){report({done,total:matchCount,phase:'training',leader:p.id});if(typeof window!=='undefined')await new Promise(r=>setTimeout(r,0));}
 }
 pop.sort((a,b)=>b.elo-a.elo);
 const candidate=pop[0].plan; let wins=0,losses=0,draws=0,incompleteValidation=0;
 const val=80;
 for(let n=0;n<val;n++){
  if(cancel())return {cancelled:true,done};
  const flip=n%2===1,di=Math.floor(n/2)%decks.length,dj=(di+5)%decks.length;
  const gs=Game.create([decks[di],decks[dj]],flip?[makePolicy(weights,incumbent),makePolicy(weights,candidate)]:[makePolicy(weights,candidate),makePolicy(weights,incumbent)],{seed:100007+Math.floor(n/2)*12721,hooks:{sim:true}});
  const res=await gs.run(90);if(res.status==='incomplete'){incompleteValidation++;continue;} if(res.winner<0)draws++;else if(res.winner===(flip?1:0))wins++;else losses++;
  if(n%10===9){report({done,total:matchCount,phase:'validation',validation:n+1});if(typeof window!=='undefined')await new Promise(r=>setTimeout(r,0));}
 }
 // Un candidat n'est promu qu'avec un avantage suffisamment net en validation.
 const upgraded=incompleteValidation===0 && (wins+draws*.5)>=49;
 return {done,matches:done,validationMatches:val,wins,losses,draws,incompleteValidation,upgraded,plans:upgraded?candidate:incumbent,candidatePlans:candidate};
}
const API={FAMILIES,LABELS,INITIAL,normalize,classify,rivalStyle,comboState,bias,score,makePolicy,mutate,trainLeague};
root.DeckPlanAI=API;
if(typeof module!=='undefined')module.exports=API;
})(typeof window!=='undefined'?window:globalThis);
window.CARD_META = {"num":{"adam-smasher-ender-of-legends":1,"dexter-deshawn-off-the-grid":2,"johnny-silverhand-rocking-renegade":3,"royce-psycho-on-the-edge":4,"v-streetkid":5,"6th-street-recruits":6,"animals-wrecker":7,"chrome-fang":8,"el-sombrero-n-la-venganza-lenta":9,"japantown-jonin":10,"johnny-silverhand-never-stop-fighting":11,"kerry-eurodyne-the-last-rockerboy":12,"la-llorona-ghost-of-the-past":13,"meredith-stout-stone-cold-corpo":14,"octant":15,"royce-don-t-call-me-simon":16,"ruthless-lowlife":17,"screw-lovelorn-fool":18,"swordwise-huscle":19,"v-roamer-of-the-badlands":20,"valentino-guerrera":21,"yorinobu-arasaka-steel-dragon":22,"arasaka-emergency-radioport":23,"deadman-transmitter":24,"mantis-blades":25,"satori-sword-of-saburo":26,"all-is-lost":27,"appetite-for-destruction":28,"bonnie-and-clyde":29,"carnage-at-the-colosseum":30,"detonate":31,"gunpoint-diplomacy":32,"industrial-assembly":33,"over-the-edge":34,"shattered-memories":35,"dum-dum-maelstrom-triggerman":36,"kerry-eurodyne-axe-attitude-audience":37,"muamar-reyes-el-capita-n":38,"river-ward-detective-on-the-hunt":39,"rogue-amendiares-preem-solo":40,"adam-smasher-metal-over-meat":41,"alt-cunningham-mother-of-daemons":42,"augmented-negotiators":43,"caliber-totentanz-s-top-dog":44,"gilded-mato-n":45,"hanako-arasaka-in-a-gilded-cage":46,"heywood-ripperdoc":47,"jackie-welles-ride-or-die-choom":48,"maelstrom-goons":49,"maxtac-suppression-team":50,"offduty-malfini":51,"rockn-rockerboy":52,"secondhand-bombus":53,"sketchy-ripper":54,"t-bug-amateur-philosopher":55,"trauma-team-operatives":56,"viktor-vektor-drop-your-illusions":57,"viktor-vektor-you-might-feel-a-little-pinch":58,"adrenaline-converter":59,"gorilla-arms":60,"kiroshi-optics":61,"mandibular-upgrade":62,"the-relic-experimental-biochip":63,"zetatech-faceplate":64,"afterparty-at-lizzie-s":65,"bootleg-black-sapphire-show":66,"cyberpsychosis":67,"live-with-the-aftermath":68,"safety-override":69,"the-heist":70,"goro-takemura-vengeful-bodyguard":71,"hanako-arasaka-daughter-of-the-emperor":72,"jackie-welles-mama-s-favorite":73,"padre-man-of-the-cross":74,"panam-palmer-nomad-cavalry":75,"corpo-security":76,"emergency-atlus":77,"field-operator":78,"maelstrom-zealots":79,"maxtac-av":80,"maxtac-heavy":81,"maxtac-squadron":82,"nadia-fighting-through-grief":83,"pacifica-netrunner":84,"panam-palmer-strength-through-family":85,"pepe-najarro-working-doubles":86,"riding-nomad":87,"sandayu-oda-hanako-s-guardian":88,"saul-bright-stormrider":89,"tyger-s-whisper":90,"valentino-street-racer":91,"wraith-marauders":92,"overwatch-panam-s-gift":93,"riot-shield":94,"sandevistan":95,"zetatech-berserk":96,"corporate-surveillance":97,"don-t-fear-the-reaper":98,"fool-on-the-hill":99,"memory-relapse":100,"peace-offering":101,"synapse-burnout":102,"take-control":103,"we-gotta-live-together":104,"wild-in-the-streets":105,"alt-cunningham-soulkiller-architect":106,"evelyn-parker-beautiful-enigma":107,"judy-alvarez-braindance-maestro":108,"sasha-yakovleva-won-t-let-you-down":109,"wakako-okada-peace-and-harmony":110,"delamain-rideshare-ai":111,"delamain-cab":112,"evelyn-parker-scheming-siren":113,"hacked-corpo":114,"jacked-in-voodoo-boy":115,"judy-alvarez-nothing-to-doubt":116,"lizzy-wizzy-delicate-weapon":117,"maman-brigitte-spirit-of-death":118,"misty-olszewski-mender-of-broken-spirits":119,"modded-kusanagi":120,"modded-muramasa":121,"mox-inciters":122,"placide-voodoo-sentinel":123,"psycho-squad":124,"rita-wheeler-no-stupid-questions":125,"rogue-amendiares-queen-of-the-afterlife":126,"westbrook-netrunner":127,"dying-night-v-s-pistol":128,"netwatch-netdriver":129,"tetratronic-rippler":130,"chrome-reverie":131,"floor-it":132,"les-e-le-mens":133,"nocturne-op55-n1":134,"pyramid-song":135,"reboot-optics":136,"three-mouths-one-desire":137,"towerfall":138,"trust-no-one":139,"unlikely-bond":140}};
/* 7 GIGS — apprentissage local contre le joueur (v1)
   Donnees d'entree : actions publiques et resultats des duels termines.
   Aucun historique secret, aucune API, aucun apprentissage externe.
*/
'use strict';
(function(root){
const VERSION=1;
const STRATEGIES={
  balanced:{name:'Équilibré', description:'Décisions tactiques générales'},
  rush:{name:'Contre-attaque', description:'Disputer les Gigs et accélérer la pression'},
  defense:{name:'Forteresse', description:'Conserver les bloqueurs et survivre aux attaques'},
  disrupt:{name:'Neutralisation', description:'Éliminer les menaces et les porteurs d’équipement'},
  economy:{name:'Économie', description:'Conserver les ressources et préparer le tour suivant'}
};
const KINDS=['sell','unit','gear','program','gigAttack','unitAttack','call','solo','ability','end','block','pass'];
const EVENTS=['sell','unit','gear','program','gigAttack','unitAttack','call','solo','ability','end','block','pass'];
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const zero=()=>Object.fromEntries(EVENTS.map(x=>[x,0]));
const clonePlain=o=>JSON.parse(JSON.stringify(o));
function signature(deck){
  // Identifiant non personnel : mêmes cartes, même clé quel que soit le nom du deck.
  const ids=[...(deck?.legends||[])].sort().join('|')+'#'+[...(deck?.main||[])].sort().join('|');
  let h=2166136261;for(let i=0;i<ids.length;i++){h^=ids.charCodeAt(i);h=Math.imul(h,16777619);}
  return 'deck-'+(h>>>0).toString(16).padStart(8,'0');
}
function fresh(){return {version:VERSION,total:0,profiles:{}};}
function sanitize(input){
  if(!input||input.version!==VERSION||typeof input.profiles!=='object'||Array.isArray(input.profiles))return fresh();
  const result=fresh();
  for(const [id,p] of Object.entries(input.profiles).slice(0,80)){
    if(!/^deck-[0-9a-f]{8}$/.test(id)||!p||typeof p!=='object')continue;
    const stat=n=>clamp(Math.trunc(Number(n)||0),0,100000);
    const variants={};for(const name of Object.keys(STRATEGIES)){
      const s=p.variants?.[name]||{};
      variants[name]={played:stat(s.played),wins:stat(s.wins),losses:stat(s.losses),draws:stat(s.draws)};
    }
    const actions={};for(const kind of EVENTS)actions[kind]=stat(p.actions?.[kind]);
    const cards={};for(const [slug,n] of Object.entries(p.cards||{}).slice(0,80)){if(/^[a-z0-9-]{2,85}$/.test(slug))cards[slug]=stat(n);}
    const lessons={};
    for(const [key,v] of Object.entries(p.lessons||{}).slice(0,80)){
      if(!/^(opening|race|danger|middle)\/(sell|unit|gear|program|gigAttack|unitAttack|call|solo|ability|end|block|pass)$/.test(key))continue;
      lessons[key]={played:stat(v.played),wins:stat(v.wins),losses:stat(v.losses),draws:stat(v.draws)};
    }
    result.profiles[id]={games:stat(p.games),wins:stat(p.wins),losses:stat(p.losses),draws:stat(p.draws),
      variants, actions, cards, lessons, lastVariant:STRATEGIES[p.lastVariant]?p.lastVariant:'balanced',last:Array.isArray(p.last)?p.last.slice(-12).filter(v=>['W','L','D'].includes(v)):[]};
  }
  result.total=Object.values(result.profiles).reduce((n,p)=>n+p.games,0);
  return result;
}
function makeProfile(){
 const variants={};for(const k of Object.keys(STRATEGIES))variants[k]={played:0,wins:0,losses:0,draws:0};
 return {games:0,wins:0,losses:0,draws:0,variants,actions:zero(),cards:{},lessons:{},lastVariant:'balanced',last:[]};
}
function ensure(data,key){if(!data.profiles[key])data.profiles[key]=makeProfile();return data.profiles[key];}
function classifyAction(g,action){
 if(!action||typeof action.type!=='string')return null;
 if(action.type==='attack')return action.target?.kind==='gigs'?'gigAttack':'unitAttack';
 if(action.type==='play'){
    const inst=g.byUid?.(action.uid),type=inst?g.def(inst)?.type:null;
    return ({Unit:'unit',Gear:'gear',Program:'program'})[type]||null;
 }
 if(action.type==='activate')return 'ability';
 if(action.type==='legendField')return 'solo';
 return EVENTS.includes(action.type)?action.type:null;
}
function context(g,side){
 const P=g.P(side),Q=g.P(1-side);
 if(Q.gigs.length>=5)return 'danger';
 if(P.gigs.length>=5)return 'race';
 if(g.s.turn<=5)return 'opening';
 return 'middle';
}
function chooseVariant(profile){
 // Minimum trois observations fiables avant d'essayer un nouveau plan.
 if(profile.games<3)return 'balanced';
 const entries=Object.entries(profile.variants),played=entries.reduce((s,[,v])=>s+v.played,0);
 // Exploration prudente : après 3 duels, examiner les plans non évalués.
 const missing=entries.filter(([,v])=>v.played===0);
 if(missing.length)return missing[(profile.games-3)%missing.length][0];
 let chosen='balanced',best=-Infinity;
 for(const [name,v] of entries){
    const n=v.played||1,rate=(v.wins+.5*v.draws+2)/(n+4); // prior conservateur
    const uncert=Math.sqrt(2*Math.log(Math.max(3,played))/n);
    const result=rate+.16*uncert-(name==='balanced'?0:.015);
    if(result>best){best=result;chosen=name;}
 }
 return chosen;
}
function begin(input,humanDeck,aiDeck){
 const data=sanitize(input),key=signature(humanDeck),p=ensure(data,key);
 return {key,variant:chooseVariant(p),humanDeck:signature(humanDeck),aiDeck:signature(aiDeck),
   publicActions:zero(),publicCards:{},decisions:[],finished:false,gamesBefore:p.games,totalsBefore:data.total};
}
function observeHuman(session,g,a){
 if(!session||session.finished)return;
 const kind=classifyAction(g,a);
 if(kind&&session.publicActions[kind]<250)session.publicActions[kind]++;
 if(['play','sell','solo','legendField','activate'].includes(a?.type)) {
   const c=g.byUid?.(a.uid);if(c&&typeof c.id==='string'&&/^[a-z0-9-]{2,85}$/.test(c.id))session.publicCards[c.id]=Math.min(100,(session.publicCards[c.id]||0)+1);
 }
}
function recordAI(session,g,i,a){
 if(!session||session.finished||session.decisions.length>=240)return;
 const kind=classifyAction(g,a),where=context(g,i);
 if(kind)session.decisions.push({key:where+'/'+kind,round:g.s.turn});
}
function addResult(s,result){s.played++;if(result==='W')s.wins++;else if(result==='L')s.losses++;else s.draws++;}
function finish(input,session,winner){
 const data=sanitize(input);if(!session||session.finished||![0,1,-1].includes(winner))return data;
 const p=ensure(data,session.key);session.finished=true;
 const result=winner===1?'W':winner===0?'L':'D';
 p.games++;if(result==='W')p.wins++;else if(result==='L')p.losses++;else p.draws++;
 addResult(p.variants[session.variant],result);p.lastVariant=session.variant;
 for(const kind of EVENTS)p.actions[kind]=clamp(p.actions[kind]+session.publicActions[kind],0,100000);
 for(const [id,n] of Object.entries(session.publicCards))p.cards[id]=clamp((p.cards[id]||0)+n,0,100000);
 const selected=new Set(session.decisions.map(x=>x.key));
 for(const key of selected){if(!p.lessons[key])p.lessons[key]={played:0,wins:0,losses:0,draws:0};addResult(p.lessons[key],result);}
 p.last.push(result);p.last=p.last.slice(-12);
 data.total++;
 return data;
}
function bias(g,i,a,session,input){
 if(!session||session.finished||i!==1)return 0;
 const p=input?.version===VERSION?input.profiles?.[session.key]:null;if(!p)return 0;
 const kind=classifyAction(g,a);if(!kind)return 0;
 let bonus=0;
 const q=g.P(1-i),me=g.P(i),rivalThreat=q.gigs.length;
 // Adaptation pré-partie fondée sur les actions visibles des anciens duels.
 const obs=p.actions,attacks=obs.gigAttack+obs.unitAttack;
 const aggressive=attacks>=4 && obs.gigAttack/(attacks||1)>.6;
 const equipHeavy=obs.gear>=3 && obs.gear>=obs.program;
 const programHeavy=obs.program>=5&&obs.program>obs.gear*1.5;
 const selected=session.variant;
 if(selected==='rush'&&kind==='gigAttack')bonus+=1.25;
 if(selected==='defense'&&kind==='unit'&&a.type==='play'){
   const c=g.byUid(a.uid);if(c&&g.hasKw(c,'BLOCKER'))bonus+=2.0;
 }
 if(selected==='disrupt'&&kind==='unitAttack'){
   const target=g.byUid(a.target?.uid);if(target?.gear?.length)bonus+=1.7;
 }
 if(selected==='economy'&&kind==='sell'&&me.eddies.length<5)bonus+=.95;
 if(selected==='economy'&&kind==='program'&&rivalThreat<5)bonus-=.5;
 if(aggressive&&rivalThreat>=4){
   if(kind==='unit'){
     const c=g.byUid(a.uid);if(c&&g.hasKw(c,'BLOCKER'))bonus+=1.1;
   }
   if(kind==='gigAttack')bonus+=.4;
 }
 if(p.cards['mantis-blades']>=2&&kind==='unit'&&rivalThreat>=4){
   const c=g.byUid(a.uid);if(c&&g.hasKw(c,'BLOCKER'))bonus+=.55;
 }
 if(p.cards['zetatech-faceplate']>=2&&kind==='unitAttack'){
   const target=g.byUid(a.target?.uid);if(target?.gear?.length)bonus+=.65;
 }
 if(equipHeavy&&kind==='unitAttack'){
   const t=g.byUid(a.target?.uid);if(t?.gear?.length)bonus+=1.5;
 }
 if(programHeavy&&kind==='gigAttack')bonus+=.7;
 // Retours d'expérience : statistiques régularisées (pas de mémorisation d'un coup isolé).
 const key=context(g,i)+'/'+kind,lesson=p.lessons[key];
 if(lesson&&lesson.played>=6&&p.games>=8){
   const rate=(lesson.wins+.5*lesson.draws+3)/(lesson.played+6);
   const prior=(p.wins+.5*p.draws+3)/(p.games+6);
   bonus+=clamp((rate-prior)*2.4,-.65,.65)*Math.min(1,lesson.played/18);
 }
 // Les paramètres n'affectent que le classement des coups légaux déjà générés.
 return clamp(bonus,-1.8,2.8);
}
function biasReaction(g,i,a,attack,session,input){
 if(!session||session.finished||i!==1||!a)return 0;
 const p=input?.version===VERSION?input.profiles?.[session.key]:null;if(!p||p.games<3)return 0;
 const attacks=p.actions.gigAttack+p.actions.unitAttack;
 if(a.type==='block'&&attack?.target?.kind==='gigs'&&attacks>=4){
   const frequency=p.actions.gigAttack/attacks;
   return (frequency>.55&&g.P(i).gigs.length>=4)?0.75:0;
 }
 return 0;
}
function summary(input,deck){
 const d=sanitize(input),key=deck?signature(deck):null,p=key?d.profiles[key]:null;
 return {total:d.total,deckKey:key,deck:p?clonePlain(p):null,profiles:Object.keys(d.profiles).length};
}
function exportData(input){return JSON.stringify({app:'7 Gigs - apprentissage local',exportedAt:new Date().toISOString(),data:sanitize(input)},null,2);}
function importData(raw){const x=typeof raw==='string'?JSON.parse(raw):raw;if(x?.app!=='7 Gigs - apprentissage local'||x?.data?.version!==VERSION)throw Error('Fichier d’apprentissage incompatible');return sanitize(x.data);}
root.RivalLearning={VERSION,STRATEGIES,signature,fresh,sanitize,begin,observeHuman,recordAI,finish,bias,biasReaction,summary,exportData,importData};
if(typeof module!=='undefined')module.exports=root.RivalLearning;
})(typeof window!=='undefined'?window:globalThis);


