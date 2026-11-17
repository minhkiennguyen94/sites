(function () {
  'use strict';
  var KEY = 'quayso.20nam.v1';
  var PLAN = [
    { prize: 'Giải Ba', short: 'Giải Ba', turn: 1, of: 4, mode: 'all' },
    { prize: 'Giải Ba', short: 'Giải Ba', turn: 2, of: 4, mode: 'all' },
    { prize: 'Giải Ba', short: 'Giải Ba', turn: 3, of: 4, mode: 'all' },
    { prize: 'Giải Ba', short: 'Giải Ba', turn: 4, of: 4, mode: 'all' },
    { prize: 'Giải Nhì', short: 'Giải Nhì', turn: 1, of: 2, mode: 'seq' },
    { prize: 'Giải Nhì', short: 'Giải Nhì', turn: 2, of: 2, mode: 'seq' },
    { prize: 'Giải Nhất', short: 'Giải Nhất', turn: 1, of: 1, mode: 'seq' },
    { prize: 'Giải Đặc Biệt', short: 'Đặc Biệt', turn: 1, of: 1, mode: 'seq', special: true }
  ];
  var MIN_POOL = PLAN.length;

  var $ = function (id) { return document.getElementById(id); };
  var els = {
    digits: $('digits').children, prizeName: $('prizeName'), prizeTurn: $('prizeTurn'), hint: $('hint'),
    steps: $('steps'), btnSkip: $('btnSkip'), skipDlg: $('skipDlg'), skipText: $('skipText'), list: $('winnersList'), modal: $('modal'), inMin: $('inMin'), inMax: $('inMax'),
    err: $('err'), poolInfo: $('poolInfo'), btnSound: $('btnSound'), btnDraw: $('btnDraw'), btnStage: $('btnStage')
  };

  var state = load();
  var busy = false;
  var view = { idx: 0, digits: ['?', '?', '?'], state: 'idle' };

  function load() {
    var d = { min: 1, max: 100, winners: [], pending: null, skipped: [], sound: false, vol: 0.8 };
    try {
      var s = JSON.parse(localStorage.getItem(KEY));
      if (s && typeof s.min === 'number' && typeof s.max === 'number' && Array.isArray(s.winners)) {
        d = { min: s.min, max: s.max, winners: s.winners, pending: s.pending || null, skipped: Array.isArray(s.skipped) ? s.skipped.map(function (x) { return typeof x === 'object' ? x : { num: x, label: '' }; }) : [], sound: !!s.sound, vol: typeof s.vol === 'number' ? s.vol : 0.8 };
      }
    } catch (e) {}
    return d;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
  function pad(n) { return ('00' + n).slice(-3); }

  function randInt(n) {
    var a = new Uint32Array(1);
    var lim = Math.floor(4294967296 / n) * n, v;
    do { crypto.getRandomValues(a); v = a[0]; } while (v >= lim);
    return v % n;
  }
  function pool() {
    var used = {};
    state.winners.forEach(function (w) { used[w.num] = 1; });
    state.skipped.forEach(function (s) { used[s.num] = 1; });
    var out = [];
    for (var i = state.min; i <= state.max; i++) if (!used[i]) out.push(i);
    return out;
  }
  function pickNumber() {
    var p = pool();
    return p[randInt(p.length)];
  }

  /* ---------- Rendering ---------- */
  function renderDigits() {
    for (var i = 0; i < 3; i++) {
      els.digits[i].firstElementChild.textContent = view.digits[i];
      els.digits[i].classList.toggle('pending', view.digits[i] === '?');
    }
  }
  function renderSteps() {
    var groups = [];
    PLAN.forEach(function (p, i) {
      var g = groups[groups.length - 1];
      if (!g || g.name !== p.short) { g = { name: p.short, from: i, count: 0 }; groups.push(g); }
      g.count++;
    });
    els.steps.innerHTML = '';
    var cur = Math.min(state.winners.length, PLAN.length - 1);
    groups.forEach(function (g) {
      var done = Math.max(0, Math.min(g.count, state.winners.length - g.from));
      var li = document.createElement('li');
      li.onclick = function (e) { e.stopPropagation(); if (view.state === 'done') draw(null, true); };
      li.textContent = g.name + ' ' + done + '/' + g.count;
      if (done === g.count) li.className = 'done';
      else if (cur >= g.from && cur < g.from + g.count) li.className = 'cur';
      els.steps.appendChild(li);
    });
  }
  function renderHeader() {
    var p = PLAN[view.idx];
    els.prizeName.textContent = p.prize.toUpperCase();
    els.prizeName.classList.toggle('special', !!p.special);
    els.prizeTurn.textContent = p.of > 1 ? 'Lượt ' + p.turn + '/' + p.of : '';
  }
  function renderHint() {
    var n = state.winners.length;
    var txt;
    if (busy) txt = 'Đang quay…';
    else if (n >= PLAN.length && view.state === 'done') txt = '🎉 Chúc mừng! Đã quay xong tất cả các giải';
    else if (view.state === 'done') txt = 'Nhấn để chuyển sang: ' + PLAN[n].prize + (PLAN[n].of > 1 ? ' (lượt ' + PLAN[n].turn + '/' + PLAN[n].of + ')' : '');
    else if (PLAN[view.idx].mode === 'seq') {
      var r = state.pending ? state.pending.revealed : 0;
      txt = r === 0 ? 'Nhấn để quay chữ số thứ nhất' : 'Nhấn để quay chữ số thứ ' + (r + 1);
    } else txt = 'Nhấn để quay số';
    els.hint.textContent = txt;
    els.btnStage.disabled = els.btnDraw.disabled = busy || (n >= PLAN.length && !state.pending);
    els.btnSkip.disabled = busy || view.state !== 'done' || !n;
  }
  function renderWinners() {
    els.list.innerHTML = '';
    if (!state.winners.length && !state.skipped.length) { els.list.innerHTML = '<div class="empty">Chưa có số trúng thưởng</div>'; return; }
    state.winners.forEach(function (w) {
      var row = document.createElement('div');
      row.className = 'wrow';
      row.innerHTML = '<span class="wp"></span><span class="wn"></span>';
      row.firstChild.textContent = w.label;
      row.lastChild.textContent = pad(w.num);
      els.list.appendChild(row);
    });
    state.skipped.forEach(function (s) {
      var row = document.createElement('div');
      row.className = 'wrow skipped';
      row.innerHTML = '<span class=\"wp\"></span><span class=\"wn\"></span>';
      row.firstChild.textContent = (s.label || 'Bỏ qua') + ' – bỏ qua';
      row.lastChild.textContent = pad(s.num);
      els.list.appendChild(row);
    });
    els.list.parentNode.scrollTop = els.list.parentNode.scrollHeight;
  }
  function skipNumber() {
    if (busy || view.state !== 'done' || !state.winners.length || !els.modal.hidden) return;
    var w = state.winners[state.winners.length - 1];
    els.skipText.textContent = 'Số ' + pad(w.num) + ' · ' + w.label;
    els.skipDlg.hidden = false;
  }
  function confirmSkip() {
    els.skipDlg.hidden = true;
    var w = state.winners[state.winners.length - 1];
    if (!w || view.state !== 'done') return;
    tone(440, 0.25, 'sawtooth', 0.08); tone(330, 0.25, 'sawtooth', 0.08, 0.2); tone(220, 0.5, 'sawtooth', 0.08, 0.4);
    state.winners.pop(); state.skipped.push({ num: w.num, label: w.label }); state.pending = null; save();
    view.idx = state.winners.length; view.state = 'idle'; view.digits = ['?', '?', '?'];
    for (var k = 0; k < 3; k++) els.digits[k].classList.remove('final');
    renderAll();
  }
  function renderAll() { renderHeader(); renderDigits(); renderSteps(); renderWinners(); renderHint(); renderSound(); }
  function renderSound() { els.btnSound.textContent = state.sound ? '🔊 Âm thanh: bật' : '🔇 Âm thanh: tắt'; }

  function restoreView() {
    var n = state.winners.length;
    if (state.pending) {
      view.idx = n; view.state = 'idle';
      var s = pad(state.pending.num);
      view.digits = [0, 1, 2].map(function (i) { return i < state.pending.revealed ? s[i] : '?'; });
    } else if (n > 0) {
      view.idx = n - 1; view.state = 'done';
      view.digits = pad(state.winners[n - 1].num).split('');
    } else { view.idx = 0; view.state = 'idle'; view.digits = ['?', '?', '?']; }
  }

  /* ---------- Sound ---------- */
  var actx, master, noiseBuf;
  function ctx() {
    if (!actx) {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      master = actx.createGain(); master.gain.value = state.vol;
      var comp = actx.createDynamicsCompressor(); master.connect(comp); comp.connect(actx.destination);
      var rv = actx.createConvolver(), rl = actx.sampleRate * 2.2, ib = actx.createBuffer(2, rl, actx.sampleRate), wet = actx.createGain(); wet.gain.value = 0.35;
      for (var c = 0; c < 2; c++) { var cd = ib.getChannelData(c); for (var j = 0; j < rl; j++) cd[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / rl, 2.8); }
      rv.buffer = ib; master.connect(rv); rv.connect(wet); wet.connect(comp);
      noiseBuf = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate);
      var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }
  function setVol(v) { state.vol = v; if (master) master.gain.value = v; save(); }
  function tone(freq, dur, type, vol, when) {
    if (!state.sound) return;
    try {
      var a = ctx(), t = a.currentTime + (when || 0);
      var o = a.createOscillator(), g = a.createGain();
      o.type = type || 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.08, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + dur);
    } catch (e) {}
  }
  function noise(dur, vol, when, freq, kind, attack) {
    if (!state.sound) return;
    try {
      var a = ctx(), t = a.currentTime + (when || 0);
      var s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
      s.buffer = noiseBuf; f.type = kind || 'bandpass'; f.frequency.value = freq || 1500;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + (attack || 0.005));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random()); s.stop(t + dur);
    } catch (e) {}
  }
  function kick(vol, when) {
    if (!state.sound) return;
    try {
      var a = ctx(), t = a.currentTime + (when || 0), o = a.createOscillator(), g = a.createGain();
      o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.3);
    } catch (e) {}
  }
  function snare(vol, when) { noise(0.12, vol, when, 2500, 'bandpass'); tone(190, 0.08, 'triangle', vol * 0.6, when); }
  function boom(vol) { kick(vol, 0); noise(0.6, vol * 0.8, 0, 300, 'lowpass', 0.01); }
  function crackle(n, vol) { for (var i = 0; i < n; i++) noise(0.05, vol, Math.random() * 0.8, 3000 + Math.random() * 4000, 'highpass'); }
  var clips = {};
  function clip(name, vol, delay) {
    if (!state.sound) return;
    setTimeout(function () {
      try {
        var a = clips[name] || (clips[name] = new Audio('audio/' + name + '.ogg'));
        a.currentTime = 0; a.volume = Math.max(0, Math.min(1, vol * state.vol)); a.play().catch(function () {});
      } catch (e) {}
    }, (delay || 0) * 1000);
  }
  function reelClick(vol) { noise(0.035, vol, 0, 2800 + Math.random() * 1200, 'bandpass'); tone(170 + Math.random() * 30, 0.04, 'square', vol * 0.5, 0); }
  function bell(vol, when) {
    [1, 2.76, 5.4, 8.9].forEach(function (m, i) { tone(1046 * m / (i ? 1 : 1), 0.9 / (1 + i * 0.6), 'sine', vol / (1 + i * 1.2), when); });
  }
  function coins(n, vol) {
    for (var i = 0; i < n; i++) { var w = Math.random() * 0.7; tone(3000 + Math.random() * 2500, 0.18, 'sine', vol, w); tone(4500 + Math.random() * 2000, 0.12, 'triangle', vol * 0.6, w + 0.02); noise(0.03, vol, w, 6000, 'highpass'); }
  }
  function cheer(dur, vol) {
    [[700, 1100], [1100, 2400], [500, 900]].forEach(function (fm, i) {
      noise(dur, vol, i * 0.15, fm[0] + Math.random() * 100, 'bandpass', dur * 0.25);
      noise(dur, vol * 0.8, i * 0.15 + 0.3, fm[1], 'bandpass', dur * 0.25);
    });
  }
  function whistle(vol) {
    if (!state.sound) return;
    try {
      var a = ctx(), t = a.currentTime, o = a.createOscillator(), g = a.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(500, t); o.frequency.exponentialRampToValueAtTime(2200, t + 0.5);
      g.gain.setValueAtTime(vol, t); g.gain.linearRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.5);
    } catch (e) {}
  }
  function applause(dur, vol) { clip(dur > 5 ? 'applause2' : 'applause1', Math.min(1, vol * 4)); cheer(dur, vol * 0.8);
    if (false) noise(dur, vol, 0, 2200, 'bandpass', dur * 0.3); }
  function oldApplause(dur, vol) { noise(dur, vol, 0, 2200, 'bandpass', dur * 0.3); noise(dur, vol * 0.7, 0.1, 4500, 'bandpass', dur * 0.3); }
  function brass(freq, dur, vol, when) {
    tone(freq, dur, 'sawtooth', vol, when); tone(freq * 1.005, dur, 'square', vol * 0.5, when); tone(freq / 2, dur, 'triangle', vol, when);
  }
  function fanfare(level) {
    level = level || 1;
    var seq = [[523, 0], [659, 0.16], [784, 0.32], [1046, 0.5]];
    if (level >= 2) seq = seq.concat([[784, 0.8], [1046, 0.96], [1318, 1.2]]);
    seq.forEach(function (n) { brass(n[0], 0.5, 0.07, n[1]); });
    var end = level >= 2 ? 1.2 : 0.5;
    [523, 659, 784, 1046].forEach(function (f) { brass(f, 1.6, 0.05, end + 0.05); });
    boom(0.6); kick(0.7, end + 0.05);
    applause(2 + level * 1.5, 0.12 + level * 0.03);
    if (level >= 3) { [880, 1175, 1568].forEach(function (f, i) { tone(f, 1.2, 'triangle', 0.08, end + 0.3 + i * 0.12); }); }
    if (level >= 4) {
      for (var i = 0; i < 8; i++) kick(0.6, i * 0.12);
      [392, 523, 659, 784, 1046, 1318].forEach(function (f) { brass(f, 3, 0.05, end + 0.6); });
      boom(0.9); applause(7, 0.2);
    }
  }
  function drumTick(el, hold, total, special) {
    var slow = el > hold, p = slow ? (el - hold) / (total - hold) : 0;
    var gap = slow ? 90 + p * p * 450 : (special ? 70 : 90);
    return gap;
  }
  /* ---------- Fireworks & confetti ---------- */
  var cv = $('confetti'), cx = cv.getContext('2d'), parts = [], sparks = [], raf = 0;
  function fit() { cv.width = innerWidth; cv.height = innerHeight; }
  addEventListener('resize', fit); fit();
  var GOLD = ['#ffd46a', '#ffe9a8', '#f0a81c', '#fff3c4'];
  var REDS = ['#ff4b57', '#ff1f2d', '#ff7a45', '#ffffff'];

  function confetti(n) {
    var colors = ['#ffd46a', '#fff', '#ff4b57', '#f0a81c', '#ffe9a8', '#ff1f2d'];
    for (var i = 0; i < n; i++) {
      var left = i % 2 === 0;
      parts.push({
        x: left ? 0 : cv.width, y: cv.height * 0.8,
        vx: (left ? 1 : -1) * (4 + Math.random() * 14) * (cv.width / 1500),
        vy: -(11 + Math.random() * 18) * (cv.height / 900),
        w: 6 + Math.random() * 8, h: 10 + Math.random() * 10, r: Math.random() * 6, vr: (Math.random() - .5) * .4,
        c: colors[(Math.random() * colors.length) | 0], life: 0
      });
    }
    start();
  }
  function burst(x, y, palette, power) {
    var n = 90 + ((Math.random() * 50) | 0), ring = Math.random() < 0.35;
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2 + Math.random() * 0.1;
      var s = (ring ? 1 : 0.35 + Math.random() * 0.65) * power * (cv.height / 900);
      sparks.push({
        x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        c: palette[(Math.random() * palette.length) | 0], life: 0, max: 70 + Math.random() * 40, sz: 2 + Math.random() * 2.5
      });
    }
    var w = 0.35 + Math.random() * 0.1; whistle(0.05); noise(0.9, 0.5, w, 200 + randInt(150), 'lowpass', 0.005); kick(0.5, w); noise(0.25, 0.25, w, 1200, 'bandpass', 0.003);
    for (var cq = 0; cq < 6; cq++) noise(0.04, 0.07, w + 0.2 + Math.random() * 1, 4000 + Math.random() * 4000, 'highpass');
    start();
  }
  function fireworks(bursts, span) {
    for (var i = 0; i < bursts; i++) {
      (function (i) {
        setTimeout(function () {
          var pal = Math.random() < 0.5 ? GOLD : (Math.random() < 0.6 ? REDS : GOLD.concat(REDS));
          burst(cv.width * (0.08 + Math.random() * 0.84), cv.height * (0.12 + Math.random() * 0.4), pal, 9 + Math.random() * 6);
        }, (i / bursts) * span + Math.random() * 120);
      })(i);
    }
  }
  function celebrate(level) {
    // level: 1 = Giải Ba, 2 = Nhì, 3 = Nhất, 4 = Đặc biệt
    confetti(150 + level * 120);
    fireworks(6 + level * 5, 2500 + level * 1500);
    if (level >= 3) setTimeout(function () { confetti(250); }, 1800);
    if (level >= 4) {
      setTimeout(function () { confetti(300); fireworks(14, 3000); }, 3800);
      setTimeout(function () { confetti(300); fireworks(14, 3000); }, 7500);
      fireworks(20, 5000);
    }
  }
  function start() { if (!raf) raf = requestAnimationFrame(tick); }
  function tick() {
    cx.globalCompositeOperation = 'destination-out';
    cx.fillStyle = 'rgba(0,0,0,0.22)'; cx.fillRect(0, 0, cv.width, cv.height);
    cx.globalCompositeOperation = 'source-over';
    parts = parts.filter(function (p) { return p.y < cv.height + 30 && p.life < 420; });
    parts.forEach(function (p) {
      p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life++;
      cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r); cx.fillStyle = p.c; cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); cx.restore();
    });
    sparks = sparks.filter(function (s) { return s.life < s.max; });
    cx.globalCompositeOperation = 'lighter';
    sparks.forEach(function (s) {
      s.vx *= 0.97; s.vy = s.vy * 0.97 + 0.12; s.x += s.vx; s.y += s.vy; s.life++;
      cx.globalAlpha = Math.max(0, 1 - s.life / s.max);
      cx.fillStyle = s.c; cx.beginPath(); cx.arc(s.x, s.y, s.sz, 0, 6.283); cx.fill();
    });
    cx.globalAlpha = 1; cx.globalCompositeOperation = 'source-over';
    if (parts.length || sparks.length) raf = requestAnimationFrame(tick);
    else { raf = 0; cx.clearRect(0, 0, cv.width, cv.height); }
  }

  /* ---------- Drawing ---------- */
  var SLOW = 3000;
  function easeOut(t) { var u = 1 - t; return 1 - u * u * u * u * u; }

  // Slot-machine reel: each stop = { digit, ms, cycles }. Fast spin that decelerates before stopping.
  function roll(slots, stops, done) {
    var begin = performance.now(), fin = {}, last = {};
    var reels = slots.map(function (i, k) {
      var box = els.digits[i], reel = box.querySelector('.reel'), strip = reel.firstChild;
      var hold = stops[k].ms - SLOW, total = Math.ceil(0.012 * (hold + SLOW / 2) / 10) * 10 + Number(stops[k].digit), html = '';
      for (var n = 0; n <= total; n++) html += '<div>' + ((total - n) % 10) + '</div>';
      strip.innerHTML = html;
      box.classList.add('rolling'); box.classList.remove('final');
      last[i] = 0;
      return { box: box, strip: strip, total: total, hold: hold, H: box.clientHeight };
    });
    (function frame(now) {
      var all = true;
      slots.forEach(function (i, k) {
        if (fin[i]) return;
        var r = reels[k], el = now - begin, t = Math.min(1, el / stops[k].ms), v = r.total / (r.hold + SLOW / 2), u = Math.max(0, el - r.hold), p = el < r.hold ? v * el : v * (r.hold + u - u * u / (2 * SLOW));
        p = Math.min(p, r.total);
        r.strip.style.transform = 'translateY(' + (-(r.total - p) * r.H) + 'px)';
        
        if (now - lastDrum > drumTick(el, r.hold, stops[k].ms, special)) { lastDrum = now; reelClick(el > r.hold ? 0.12 + 0.1 * (el - r.hold) / SLOW : 0.1); if (special && el < r.hold) snare(0.07, 0); }
        if (el < r.hold && now - lastBell > 380 + Math.random() * 300) { lastBell = now; bell(0.035, 0); if (Math.random() < 0.5) coins(2, 0.03); }
        if (special) {
          if (stops[k].ms > 9000 && el > 3500 && el < stops[k].ms && now - lastBeat > (el > 6500 ? 560 : 800)) { lastBeat = now; tone(55, 0.18, 'sine', 0.35); tone(55, 0.18, 'sine', 0.3, 0.16); }
        }
        var step = Math.floor(p);
        if (step !== last[i]) last[i] = step;
        if (t >= 1) {
          fin[i] = true; view.digits[i] = String(stops[k].digit);
          r.box.classList.remove('rolling'); r.box.classList.add('final');
          renderDigits(); bell(0.1, 0); bell(0.08, 0.15); coins(6, 0.05); kick(0.6, 0); noise(0.12, 0.4, 0, 400, 'lowpass');
          if (special) { pulse('flash', 600); boom(0.8); tone(1320, 0.8, 'triangle', 0.12); }
        } else all = false;
      });
      if (all) done(); else requestAnimationFrame(frame);
    })(begin);
  }

  var special = false, frameEl = document.getElementById('frame'), lastBeat = 0, lastDrum = 0, lastBell = 0;
  function pulse(cls, ms) { frameEl.classList.remove(cls); void frameEl.offsetWidth; frameEl.classList.add(cls); setTimeout(function () { frameEl.classList.remove(cls); }, ms); }
  function finishWinner(idx, num) {
    var p = PLAN[idx];
    state.winners.push({ prize: p.prize, label: p.prize + (p.of > 1 ? ' (' + p.turn + ')' : ''), num: num });
    state.pending = null;
    save();
    view.idx = idx; view.state = 'done';
    busy = false; special = false; frameEl.classList.remove('dark');
    renderSteps(); renderWinners(); renderHint();
    var lv = idx < 4 ? 1 : idx < 6 ? 2 : idx === 6 ? 3 : 4; fanfare(lv); celebrate(idx < 4 ? 1 : idx < 6 ? 2 : idx === 6 ? 3 : 4);
  }

  var lastDraw = 0;
  function draw(e, blankOnly) {
    if (busy || !els.modal.hidden || !els.skipDlg.hidden) return;
    var nowT = Date.now();
    if (nowT - lastDraw < 800) return;
    lastDraw = nowT;
    if (document.activeElement && document.activeElement.blur && document.activeElement.tagName === 'BUTTON') document.activeElement.blur();
    var idx = state.winners.length;
    if (idx >= PLAN.length) return;
    if (pool().length < 1) return;
    var p = PLAN[idx];
    var wasDone = view.state === 'done';
    if (wasDone || view.idx !== idx) {
      view.idx = idx; view.state = 'idle'; view.digits = ['?', '?', '?'];
      for (var k = 0; k < 3; k++) els.digits[k].classList.remove('final');
      renderHeader(); renderDigits(); renderSteps(); renderHint();
      return;
    }
    if (blankOnly) return;
    busy = true; special = !!p.special; frameEl.classList.toggle('dark', special); renderHint();
    if (p.mode === 'all') {
      var num = pickNumber(), s = pad(num);
      roll([0, 1, 2], [{ ms: 4000 + SLOW, cycles: 5, digit: s[0] }, { ms: 4500 + SLOW, cycles: 6, digit: s[1] }, { ms: 5000 + SLOW, cycles: 7, digit: s[2] }], function () { finishWinner(idx, num); });
    } else {
      if (!state.pending) state.pending = { num: pickNumber(), revealed: 0 };
      var pd = state.pending, d = pad(pd.num), slot = pd.revealed;
      save();
      roll([slot], [{ ms: special ? (slot === 2 ? 6500 + SLOW : 4000 + SLOW) : 4000 + SLOW, cycles: slot === 2 ? 9 : 7, digit: d[slot] }], function () {
        pd.revealed++; save();
        if (pd.revealed >= 3) finishWinner(idx, pd.num);
        else { busy = false; view.state = 'idle'; renderHint(); }
      });
    }
  }

  /* ---------- Settings ---------- */
  function openSettings() {
    if (busy) return;
    els.inMin.value = state.min; els.inMax.value = state.max; els.err.textContent = '';
    els.poolInfo.textContent = 'Còn ' + pool().length + ' số có thể quay · đã trúng ' + state.winners.length + '/' + PLAN.length + ' giải.';
    els.modal.hidden = false; els.inMin.focus();
  }
  function closeSettings() { els.modal.hidden = true; }
  $('btnSave').onclick = function () {
    var a = Number(els.inMin.value), b = Number(els.inMax.value);
    if (els.inMin.value === '' || els.inMax.value === '' || !Number.isInteger(a) || !Number.isInteger(b)) { els.err.textContent = 'Vui lòng nhập số nguyên hợp lệ.'; return; }
    if (a < 0 || b > 999) { els.err.textContent = 'Khoảng số phải nằm trong 0 – 999 (3 chữ số).'; return; }
    if (b - a + 1 < MIN_POOL) { els.err.textContent = 'Cần ít nhất ' + MIN_POOL + ' số trong khoảng (đủ cho ' + PLAN.length + ' giải).'; return; }
    if (a !== state.min || b !== state.max) {
      if (state.winners.length || state.pending) {
        if (!confirm('Đổi khoảng số sẽ xoá toàn bộ kết quả đã quay. Tiếp tục?')) return;
      }
      state.min = a; state.max = b; state.winners = []; state.pending = null; state.skipped = [];
      save(); restoreView(); renderAll();
    }
    closeSettings();
  };
  $('btnClose').onclick = closeSettings;
  $('btnReset').onclick = function () {
    if (!confirm('Reset toàn bộ? Tất cả số trúng thưởng sẽ bị xoá và các số được trả về vòng quay.')) return;
    state.winners = []; state.pending = null; state.skipped = []; save(); restoreView(); renderAll(); closeSettings();
  };
  els.modal.addEventListener('mousedown', function (e) { if (e.target === els.modal) closeSettings(); });

  /* ---------- Controls ---------- */
  function toggleFull() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(function () {});
  }
  function toggleHide() { document.body.classList.toggle('hide-ui'); }
  function toggleSound() { state.sound = !state.sound; save(); renderSound(); if (state.sound) { tone(660, 0.2, 'triangle', 0.1); tone(990, 0.3, 'triangle', 0.1, 0.12); } }

  $('skipYes').onclick = function (e) { e.stopPropagation(); confirmSkip(); };
  $('skipNo').onclick = function (e) { e.stopPropagation(); els.skipDlg.hidden = true; };
  $('vol').value = state.vol; $('vol').oninput = function () { setVol(Number(this.value)); };
  $('vol').onclick = function (e) { e.stopPropagation(); };
  els.btnSkip.onclick = function (e) { e.stopPropagation(); skipNumber(); };
  els.btnDraw.onclick = function (e) { e.stopPropagation(); draw(); };
  $('btnStage').onclick = function (e) { e.stopPropagation(); draw(); };
  $('btnSettings').onclick = function (e) { e.stopPropagation(); openSettings(); };
  $('btnFull').onclick = function (e) { e.stopPropagation(); toggleFull(); };
  $('btnSound').onclick = function (e) { e.stopPropagation(); toggleSound(); };
  $('btnHide').onclick = function (e) { e.stopPropagation(); toggleHide(); };
  $('stage').addEventListener('click', draw);

  addEventListener('keydown', function (e) {
    if (!els.skipDlg.hidden) { e.preventDefault(); if (e.key === 'Escape') els.skipDlg.hidden = true; else if (e.key === 'Enter') confirmSkip(); return; }
    if (!els.modal.hidden) { if (e.key === 'Escape') closeSettings(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key.toLowerCase();
    if (k === ' ' || k === 'enter') { e.preventDefault(); if (!e.repeat) draw(); }
    else if (k === 's') openSettings();
    else if (k === 'f') toggleFull();
    else if (k === 'h') toggleHide();
    else if (k === 'm') toggleSound();
  });

  Array.prototype.forEach.call(els.digits, function (b) { b.insertAdjacentHTML('beforeend', '<div class="reel"><div class="strip"></div></div>'); });
  restoreView(); renderAll();
})();
