(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };
  const DRAFT_KEY = 'vocab_draft_v1';

  // ====== TRẠNG THÁI ======
  let cfg = null;            // { topic_name, duration_minutes, updated_at }
  let items = [];            // câu hỏi từ server (không có đáp án)
  let itemsById = {};
  let order = [];            // thứ tự id đang hiển thị (đã xáo trộn)
  let studentName = '';
  let totalSeconds = 0;
  let endTime = 0;
  let timerId = null;
  let quizActive = false;    // true trong lúc đang làm bài
  let allLang = 'en';
  let tabSwitches = 0;
  let saveTimer = null;
  let leaving = false;       // đang F5/đóng trang, không tính là chuyển tab
  let lastPayload = null;

  // ====== TIỆN ÍCH ======
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(function (s) {
      s.classList.toggle('hidden', s.id !== id);
    });
    window.scrollTo(0, 0);
  }

  function fmt(sec) {
    sec = Math.max(0, Math.round(sec));
    return String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
  }

  function h(tag, attrs, children) {
    const el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') el.textContent = attrs[k];
      else el.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) {
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // ====== LƯU NHÁP (localStorage) ======
  function collectAnswers() {
    const out = [];
    $('quiz-body').querySelectorAll('tr[data-id]').forEach(function (tr) {
      const get = function (f) { return tr.querySelector('[data-field="' + f + '"]').value; };
      out.push({ id: Number(tr.dataset.id), word: get('word'), syn: get('syn'), ant: get('ant') });
    });
    return out;
  }

  function saveDraft() {
    if (!quizActive) return;
    clearTimeout(saveTimer);
    const answers = {};
    collectAnswers().forEach(function (a) {
      answers[a.id] = { word: a.word, syn: a.syn, ant: a.ant };
    });
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        v: String(cfg.updated_at),
        topic: cfg.topic_name,
        name: studentName,
        endTime: endTime,
        order: order,
        answers: answers,
        tabSwitches: tabSwitches
      }));
    } catch (e) {}
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDraft, 300);
  }

  function clearDraft() {
    clearTimeout(saveTimer);
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
  }

  // Đọc bản nháp, chỉ nhận nếu đúng đề hiện tại
  function readDraft() {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (!d) return null;
      const valid =
        d.v === String(cfg.updated_at) &&
        Array.isArray(d.order) && d.order.length === items.length &&
        d.order.every(function (id) { return itemsById[id]; }) &&
        typeof d.endTime === 'number';
      if (!valid) { clearDraft(); return null; }
      return d;
    } catch (e) { return null; }
  }

  function renderResumeBox(d) {
    const box = $('resume-box');
    if (!d) { box.classList.add('hidden'); return; }
    const remaining = Math.ceil((d.endTime - Date.now()) / 1000);
    let filled = 0;
    Object.keys(d.answers || {}).forEach(function (id) {
      const a = d.answers[id] || {};
      ['word', 'syn', 'ant'].forEach(function (f) {
        if (String(a[f] || '').trim()) filled++;
      });
    });
    $('resume-info').textContent = d.name + ' · đã điền ' + filled + ' ô · ' +
      (remaining > 0 ? 'còn ' + fmt(remaining) : 'đã hết giờ, bài sẽ được nộp ngay');
    $('btn-resume').textContent = remaining > 0 ? 'Tiếp tục làm bài' : 'Nộp bài đã làm';
    box.classList.remove('hidden');
  }

  // ====== KHỞI TẠO: TẢI ĐỀ ======
  async function init() {
    showScreen('screen-loading');
    $('loading-text').classList.remove('hidden');
    $('loading-error').classList.add('hidden');
    $('btn-retry').classList.add('hidden');

    try {
      const data = await apiGetQuiz();
      cfg = data.config;
      items = data.items;
      itemsById = {};
      items.forEach(function (it) { itemsById[it.id] = it; });

      $('topic-info').textContent =
        'Chủ đề: ' + (cfg.topic_name || 'Từ vựng hôm nay') + ' · ' + items.length +
        ' từ · Thời gian: ' + cfg.duration_minutes + ' phút';

      try { $('student-name').value = localStorage.getItem('vocab_student_name') || ''; } catch (e) {}
      renderResumeBox(readDraft());
      showScreen('screen-login');
    } catch (err) {
      $('loading-text').classList.add('hidden');
      $('loading-error').textContent = err.message || String(err);
      $('loading-error').classList.remove('hidden');
      $('btn-retry').classList.remove('hidden');
    }
  }

  // ====== BẮT ĐẦU / TIẾP TỤC LÀM BÀI ======
  function startQuiz() {
    const name = $('student-name').value.trim();
    if (!name) {
      $('login-msg').textContent = 'Vui lòng nhập họ và tên.';
      $('login-msg').classList.remove('hidden');
      return;
    }
    studentName = name;
    try { localStorage.setItem('vocab_student_name', name); } catch (e) {}

    const ids = items.map(function (it) { return it.id; });
    order = APP_CONFIG.SHUFFLE_QUESTIONS ? shuffle(ids) : ids;
    totalSeconds = (Number(cfg.duration_minutes) || 15) * 60;
    endTime = Date.now() + totalSeconds * 1000;
    tabSwitches = 0;
    beginQuiz(null);
  }

  function resumeQuiz() {
    const d = readDraft();
    if (!d) { renderResumeBox(null); return; }
    studentName = d.name;
    order = d.order;
    endTime = d.endTime;
    tabSwitches = d.tabSwitches || 0;
    totalSeconds = (Number(cfg.duration_minutes) || 15) * 60;
    beginQuiz(d);
  }

  function beginQuiz(draft) {
    $('quiz-topic').textContent = cfg.topic_name || 'Từ vựng hôm nay';
    $('quiz-student').textContent = ' · ' + studentName;
    $('quiz-count').textContent = order.length + ' từ';

    buildQuizTable();
    if (draft) fillAnswers(draft.answers || {});

    showScreen('screen-quiz');
    $('topbar-right').classList.remove('hidden');
    updateTabBadge();

    quizActive = true;
    saveDraft();
    timerId = setInterval(tick, 250);
    tick();
    window.addEventListener('beforeunload', warnLeave);

    if (!draft) {
      const first = document.querySelector('#quiz-body input');
      if (first) first.focus();
    }
  }

  function warnLeave(e) {
    leaving = true;
    setTimeout(function () { leaving = false; }, 1000);
    e.preventDefault();
    e.returnValue = '';
  }

  // ====== DỰNG BẢNG LÀM BÀI ======
  function makeInput(field, placeholder, disabled) {
    const inp = h('input', {
      type: 'text',
      class: 'ans-input' + (disabled ? ' na' : ''),
      'data-field': field,
      placeholder: placeholder,
      autocomplete: 'off',
      autocapitalize: 'off',
      autocorrect: 'off',
      spellcheck: 'false',
      enterkeyhint: 'next'
    });
    if (disabled) inp.disabled = true;
    return inp;
  }

  function setMeaning(tr) {
    const it = itemsById[tr.dataset.id];
    const lang = tr.dataset.lang;
    const text = lang === 'en' ? it.definition : (it.meaning || 'Chưa có nghĩa tiếng Việt');
    tr.querySelector('.lang-text').textContent = text || '—';
    tr.querySelector('.lang-tag').textContent = lang === 'en' ? 'EN' : 'VI';
  }

  function buildQuizTable() {
    const body = $('quiz-body');
    body.innerHTML = '';

    order.forEach(function (id, i) {
      const it = itemsById[id];
      const tr = h('tr', { 'data-id': String(id), 'data-lang': 'en' });

      tr.appendChild(h('td', { class: 'col-idx', text: String(i + 1) }));

      const tdWord = h('td', { 'data-label': 'Từ vựng' });
      if (APP_CONFIG.SHOW_HINT) {
        tdWord.appendChild(h('div', { class: 'hint', text: it.hint }));
      }
      tdWord.appendChild(makeInput('word', 'Gõ từ vựng...', false));
      tr.appendChild(tdWord);

      // tabindex=-1: phím Tab bỏ qua nút này, đi thẳng từ ô từ vựng sang ô Synonym
      const btn = h('button', { type: 'button', class: 'btn-mini', tabindex: '-1', text: 'EN ⇄ VI' });
      btn.addEventListener('click', function () {
        tr.dataset.lang = tr.dataset.lang === 'en' ? 'vi' : 'en';
        setMeaning(tr);
      });
      tr.appendChild(h('td', { 'data-label': 'Nghĩa' }, [
        h('div', { class: 'lang-cell' }, [
          h('span', { class: 'lang-tag' }),
          h('span', { class: 'lang-text' }),
          btn
        ])
      ]));

      const tdSA = h('td', { 'data-label': 'Synonym / Antonym' });
      tdSA.appendChild(makeInput('syn', it.hasSyn ? 'Synonym...' : 'Synonym: không yêu cầu', !it.hasSyn));
      tdSA.appendChild(h('div', { style: 'height:6px' }));
      tdSA.appendChild(makeInput('ant', it.hasAnt ? 'Antonym...' : 'Antonym: không yêu cầu', !it.hasAnt));
      tr.appendChild(tdSA);

      body.appendChild(tr);
      setMeaning(tr);
    });
  }

  function fillAnswers(answers) {
    $('quiz-body').querySelectorAll('tr[data-id]').forEach(function (tr) {
      const a = answers[tr.dataset.id] || {};
      ['word', 'syn', 'ant'].forEach(function (f) {
        const inp = tr.querySelector('[data-field="' + f + '"]');
        if (inp && !inp.disabled && a[f]) inp.value = a[f];
      });
    });
  }

  function toggleAllLang() {
    allLang = allLang === 'en' ? 'vi' : 'en';
    $('quiz-body').querySelectorAll('tr[data-id]').forEach(function (tr) {
      tr.dataset.lang = allLang;
      setMeaning(tr);
    });
  }

  // ====== ĐIỀU HƯỚNG BẰNG BÀN PHÍM ======
  function focusRelative(input, dir) {
    const list = Array.from($('quiz-body').querySelectorAll('input:not(:disabled)'));
    const next = list[list.indexOf(input) + dir];
    if (next) { next.focus(); next.select(); return; }
    if (dir > 0) $('btn-submit-bottom').focus();   // hết ô cuối thì dừng ở nút Nộp bài
  }

  function focusSameColumn(input, dir) {
    const field = input.dataset.field;
    let tr = input.closest('tr');
    while ((tr = dir > 0 ? tr.nextElementSibling : tr.previousElementSibling)) {
      const target = tr.querySelector('[data-field="' + field + '"]');
      if (target && !target.disabled) { target.focus(); target.select(); return; }
    }
  }

  function onQuizKey(e) {
    const t = e.target;
    if (!t.classList || !t.classList.contains('ans-input') || e.isComposing) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      focusRelative(t, e.shiftKey ? -1 : 1);       // Enter: ô kế tiếp, Shift+Enter: ô trước
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusSameColumn(t, 1);                       // ↓: cùng cột, dòng dưới
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusSameColumn(t, -1);                      // ↑: cùng cột, dòng trên
    }
  }

  // ====== CẢNH BÁO CHUYỂN TAB ======
  function updateTabBadge() {
    const el = $('tab-warn');
    if (!el) return;
    if (tabSwitches > 0) {
      el.textContent = '⚠ Rời tab: ' + tabSwitches + ' lần';
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) return;
    if (quizActive && !leaving) {
      tabSwitches++;
      updateTabBadge();
    }
    saveDraft();
  });
  window.addEventListener('pagehide', saveDraft);

  // ====== ĐỒNG HỒ ĐẾM NGƯỢC ======
  function tick() {
    if (!quizActive) return;
    const remaining = Math.ceil((endTime - Date.now()) / 1000);
    const t = $('timer');
    t.textContent = fmt(remaining);
    t.classList.toggle('warn', remaining <= 120 && remaining > 30);
    t.classList.toggle('danger', remaining <= 30);
    if (remaining <= 0) submitQuiz(true);
  }

  // ====== NỘP BÀI (server chấm điểm) ======
  function submitQuiz(auto) {
    if (!quizActive) return;
    if (!auto && !window.confirm('Bạn chắc chắn muốn nộp bài?')) return;

    saveDraft();            // lưu lần cuối, giữ lại cho tới khi server nhận thành công
    quizActive = false;
    clearInterval(timerId);
    window.removeEventListener('beforeunload', warnLeave);

    const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
    const seconds = Math.min(totalSeconds, Math.max(0, totalSeconds - remaining));

    document.querySelectorAll('#quiz-body input').forEach(function (i) { i.disabled = true; });

    lastPayload = {
      action: 'submit',
      name: studentName,
      updated_at: cfg.updated_at,
      answers: collectAnswers(),
      seconds: seconds,
      tabSwitches: tabSwitches
    };

    $('res-name').textContent = studentName;
    $('res-score').textContent = '…';
    $('res-percent').textContent = '…';
    $('res-time').textContent = fmt(seconds);
    $('result-body').innerHTML = '';
    $('topbar-right').classList.add('hidden');
    showScreen('screen-result');

    sendSubmit();
  }

  async function sendSubmit() {
    const box = $('res-send-status');
    box.className = 'msg msg-info';
    box.textContent = 'Đang nộp bài và chấm điểm...';

    let lastErr = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await apiPost(lastPayload);
        clearDraft();
        box.className = 'msg msg-ok';
        box.textContent = 'Đã nộp bài và gửi kết quả cho giáo viên.';
        renderResult(res, lastPayload.seconds);
        return;
      } catch (err) {
        lastErr = err;
        if (attempt < 3) await sleep(1500 * attempt);
      }
    }

    box.className = 'msg msg-error';
    box.textContent = 'Chưa nộp được: ' + (lastErr && lastErr.message ? lastErr.message : 'lỗi mạng') +
      '. Bài làm của bạn vẫn được lưu trên máy. ';
    const retry = h('button', { type: 'button', class: 'btn btn-secondary', text: 'Nộp lại' });
    retry.addEventListener('click', sendSubmit);
    box.appendChild(retry);
  }

  // ====== HIỂN THỊ KẾT QUẢ ======
  function resultCell(label, part) {
    const td = h('td', { 'data-label': label });
    if (!part.req) {
      td.className = 'cell-skip';
      td.textContent = '—';
      return td;
    }
    if (part.ok) {
      td.className = 'cell-ok';
      td.appendChild(h('span', { class: 'mine', text: String(part.mine).trim() }));
    } else {
      td.className = 'cell-bad';
      td.appendChild(h('span', { class: 'mine', text: String(part.mine).trim() || '(bỏ trống)' }));
      td.appendChild(h('span', { class: 'correct-answer', text: 'Đáp án: ' + part.correct }));
    }
    return td;
  }

  function renderResult(res, seconds) {
    $('res-score').textContent = res.score + '/' + res.total;
    $('res-percent').textContent = (res.total ? Math.round(res.score / res.total * 100) : 0) + '%';
    $('res-time').textContent = fmt(seconds);

    const byId = {};
    (res.details || []).forEach(function (d) { byId[d.id] = d; });

    const body = $('result-body');
    body.innerHTML = '';
    order.forEach(function (id, i) {
      const g = byId[id];
      const it = itemsById[id];
      if (!g) return;
      const tr = h('tr');
      tr.appendChild(h('td', { class: 'col-idx', text: String(i + 1) }));
      tr.appendChild(resultCell('Từ vựng', g.word));
      tr.appendChild(h('td', { 'data-label': 'Nghĩa' }, [
        h('div', { text: it.definition }),
        h('div', { class: 'muted', text: it.meaning })
      ]));
      tr.appendChild(resultCell('Synonym', g.syn));
      tr.appendChild(resultCell('Antonym', g.ant));
      body.appendChild(tr);
    });
  }

  // ====== GẮN SỰ KIỆN ======
  $('btn-retry').addEventListener('click', init);
  $('btn-start').addEventListener('click', startQuiz);
  $('student-name').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') startQuiz();
  });
  $('btn-resume').addEventListener('click', resumeQuiz);
  $('btn-discard').addEventListener('click', function () {
    clearDraft();
    renderResumeBox(null);
  });
  $('btn-lang-all').addEventListener('click', toggleAllLang);
  $('btn-submit').addEventListener('click', function () { submitQuiz(false); });
  $('btn-submit-bottom').addEventListener('click', function () { submitQuiz(false); });
  $('quiz-body').addEventListener('keydown', onQuizKey);
  $('quiz-body').addEventListener('input', scheduleSave);

  init();
})();