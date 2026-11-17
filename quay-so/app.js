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
    steps: $('steps'), list: $('winnersList'), modal: $('modal'), inMin: $('inMin'), inMax: $('inMax'),
    err: $('err'), poolInfo: $('poolInfo'), btnSound: $('btnSound'), btnDraw: $('btnDraw')
  };

  var state = load();
  var busy = false;
  var view = { idx: 0, digits: ['?', '?', '?'], state: 'idle' };

  function load() {
    var d = { min: 1, max: 100, winners: [], pending: null, sound: false };
    try {
      var s = JSON.parse(localStorage.getItem(KEY));
      if (s && typeof s.min === 'number' && typeof s.max === 'number' && Array.isArray(s.winners)) {
        d = { min: s.min, max: s.max, winners: s.winners, pending: s.pending || null, sound: !!s.sound };
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
    else if (view.state === 'done') txt = 'Nhấn để quay: ' + PLAN[n].prize + (PLAN[n].of > 1 ? ' (lượt ' + PLAN[n].turn + '/' + PLAN[n].of + ')' : '');
    else if (PLAN[view.idx].mode === 'seq') {
      var r = state.pending ? state.pending.revealed : 0;
      txt = r === 0 ? 'Nhấn để quay chữ số thứ nhất' : 'Nhấn để quay chữ số thứ ' + (r + 1);
    } else txt = 'Nhấn để quay số';
    els.hint.textContent = txt;
    els.btnDraw.disabled = busy || (n >= PLAN.length && !state.pending);
  }
  function renderWinners() {
    els.list.innerHTML = '';
    if (!state.winners.length) { els.list.innerHTML = '<div class="empty">Chưa có số trúng thưởng</div>'; return; }
    state.winners.forEach(function (w) {
      var row = document.createElement('div');
      row.className = 'wrow';
      row.innerHTML = '<span class="wp"></span><span class="wn"></span>';
      row.firstChild.textContent = w.label;
      row.lastChild.textContent = pad(w.num);
      els.list.appendChild(row);
    });
    els.list.parentNode.scrollTop = els.list.parentNode.scrollHeight;
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
  var actx;
  function tone(freq, dur, type, vol, when) {
    if (!state.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      var t = actx.currentTime + (when || 0);
      var o = actx.createOscillator(), g = actx.createGain();
      o.type = type || 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.08, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + dur);
    } catch (e) {}
  }
  function fanfare() { [523, 659, 784, 1046].forEach(function (f, i) { tone(f, 0.45, 'triangle', 0.12, i * 0.14); }); }

  /* ---------- Confetti ---------- */
  var cv = $('confetti'), cx = cv.getContext('2d'), parts = [], raf = 0;
  function fit() { cv.width = innerWidth; cv.height = innerHeight; }
  addEventListener('resize', fit); fit();
  function confetti(big) {
    var colors = ['#ffd46a', '#fff', '#ff4b57', '#f0a81c', '#ffe9a8'];
    var n = big ? 360 : 180;
    for (var i = 0; i < n; i++) {
      var left = i % 2 === 0;
      parts.push({
        x: left ? 0 : cv.width, y: cv.height * 0.75,
        vx: (left ? 1 : -1) * (4 + Math.random() * 12) * (cv.width / 1500),
        vy: -(10 + Math.random() * 16) * (cv.height / 900),
        w: 6 + Math.random() * 8, h: 10 + Math.random() * 10, r: Math.random() * 6, vr: (Math.random() - .5) * .4,
        c: colors[(Math.random() * colors.length) | 0], life: 0
      });
    }
    if (!raf) raf = requestAnimationFrame(tick);
  }
  function tick() {
    cx.clearRect(0, 0, cv.width, cv.height);
    parts = parts.filter(function (p) { return p.y < cv.height + 30 && p.life < 400; });
    parts.forEach(function (p) {
      p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life++;
      cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r); cx.fillStyle = p.c; cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); cx.restore();
    });
    raf = parts.length ? requestAnimationFrame(tick) : 0;
    if (!raf) cx.clearRect(0, 0, cv.width, cv.height);
  }

  /* ---------- Drawing ---------- */
  function roll(slots, stops, done) {
    // slots: digit indexes to spin; stops[i]: time (ms) when slot i locks -> {digit}
    var start = performance.now(), locked = {};
    slots.forEach(function (i) { els.digits[i].classList.add('rolling'); els.digits[i].classList.remove('final'); });
    var lastTick = 0;
    (function frame(now) {
      var t = now - start, all = true;
      slots.forEach(function (i, k) {
        if (locked[i]) return;
        if (t >= stops[k].at) {
          locked[i] = true; view.digits[i] = stops[k].digit;
          els.digits[i].classList.remove('rolling'); els.digits[i].classList.add('final');
          tone(880, 0.25, 'triangle', 0.12);
        } else { all = false; view.digits[i] = String(randInt(10)); }
      });
      renderDigits();
      if (now - lastTick > 90) { lastTick = now; tone(300 + randInt(200), 0.05, 'square', 0.03); }
      if (all) done(); else requestAnimationFrame(frame);
    })(start);
  }

  function finishWinner(idx, num) {
    var p = PLAN[idx];
    state.winners.push({ prize: p.prize, label: p.prize + (p.of > 1 ? ' (' + p.turn + ')' : ''), num: num });
    state.pending = null;
    save();
    view.idx = idx; view.state = 'done';
    busy = false;
    renderSteps(); renderWinners(); renderHint();
    fanfare(); confetti(!!p.special || idx >= 6);
  }

  function draw() {
    if (busy || !els.modal.hidden) return;
    var idx = state.winners.length;
    if (idx >= PLAN.length) return;
    if (pool().length < 1) return;
    var p = PLAN[idx];
    if (view.state === 'done' || view.idx !== idx) {
      view.idx = idx; view.state = 'idle'; view.digits = ['?', '?', '?'];
      for (var k = 0; k < 3; k++) els.digits[k].classList.remove('final');
      renderHeader(); renderDigits(); renderSteps();
    }
    busy = true; renderHint();
    if (p.mode === 'all') {
      var num = pickNumber(), s = pad(num);
      roll([0, 1, 2], [{ at: 1500, digit: s[0] }, { at: 2000, digit: s[1] }, { at: 2500, digit: s[2] }], function () { finishWinner(idx, num); });
    } else {
      if (!state.pending) state.pending = { num: pickNumber(), revealed: 0 };
      var pd = state.pending, d = pad(pd.num), slot = pd.revealed;
      save();
      roll([slot], [{ at: 1600, digit: d[slot] }], function () {
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
      state.min = a; state.max = b; state.winners = []; state.pending = null;
      save(); restoreView(); renderAll();
    }
    closeSettings();
  };
  $('btnClose').onclick = closeSettings;
  $('btnReset').onclick = function () {
    if (!confirm('Reset toàn bộ? Tất cả số trúng thưởng sẽ bị xoá và các số được trả về vòng quay.')) return;
    state.winners = []; state.pending = null; save(); restoreView(); renderAll(); closeSettings();
  };
  els.modal.addEventListener('mousedown', function (e) { if (e.target === els.modal) closeSettings(); });

  /* ---------- Controls ---------- */
  function toggleFull() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(function () {});
  }
  function toggleHide() { document.body.classList.toggle('hide-ui'); }
  function toggleSound() { state.sound = !state.sound; save(); renderSound(); if (state.sound) tone(660, 0.2, 'triangle', 0.1); }

  els.btnDraw.onclick = function (e) { e.stopPropagation(); draw(); };
  $('btnSettings').onclick = function (e) { e.stopPropagation(); openSettings(); };
  $('btnFull').onclick = function (e) { e.stopPropagation(); toggleFull(); };
  $('btnSound').onclick = function (e) { e.stopPropagation(); toggleSound(); };
  $('btnHide').onclick = function (e) { e.stopPropagation(); toggleHide(); };
  $('stage').addEventListener('click', draw);

  addEventListener('keydown', function (e) {
    if (!els.modal.hidden) { if (e.key === 'Escape') closeSettings(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key.toLowerCase();
    if (k === ' ' || k === 'enter') { e.preventDefault(); if (!e.repeat) draw(); }
    else if (k === 's') openSettings();
    else if (k === 'f') toggleFull();
    else if (k === 'h') toggleHide();
    else if (k === 'm') toggleSound();
  });

  restoreView(); renderAll();
})();
