(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };

  // ====== TRẠNG THÁI ======
  let cfg = null;            // cấu hình đề từ backend
  let entries = [];          // danh sách từ vựng (đã xáo trộn nếu bật)
  let studentName = '';
  let totalSeconds = 0;
  let endTime = 0;
  let timerId = null;
  let submitted = false;
  let allLang = 'en';        // ngôn ngữ của nút chuyển tất cả

  // ====== TIỆN ÍCH ======
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(function (s) {
      s.classList.toggle('hidden', s.id !== id);
    });
    window.scrollTo(0, 0);
  }

  function fmt(sec) {
    sec = Math.max(0, Math.round(sec));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  // Tạo phần tử DOM nhanh: h('td', {class:'x'}, [con...])
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

  // ====== KHỞI TẠO: TẢI ĐỀ ======
  async function init() {
    showScreen('screen-loading');
    $('loading-text').classList.remove('hidden');
    $('loading-error').classList.add('hidden');
    $('btn-retry').classList.add('hidden');

    try {
      cfg = await apiGetConfig();
      if (!cfg.csv_url) throw new Error('Hôm nay giáo viên chưa đăng đề. Vui lòng quay lại sau.');
      let list = await VocabParser.loadVocab(cfg.csv_url);
      entries = APP_CONFIG.SHUFFLE_QUESTIONS ? VocabParser.shuffle(list) : list;

      const topic = cfg.topic_name || 'Từ vựng hôm nay';
      $('topic-info').textContent =
        'Chủ đề: ' + topic + ' · ' + entries.length + ' từ · Thời gian: ' + cfg.duration_minutes + ' phút';

      try { $('student-name').value = localStorage.getItem('vocab_student_name') || ''; } catch (e) {}
      showScreen('screen-login');
    } catch (err) {
      $('loading-text').classList.add('hidden');
      $('loading-error').textContent = err.message || String(err);
      $('loading-error').classList.remove('hidden');
      $('btn-retry').classList.remove('hidden');
    }
  }

  // ====== BẮT ĐẦU LÀM BÀI ======
  function startQuiz() {
    const name = $('student-name').value.trim();
    if (!name) {
      $('login-msg').textContent = 'Vui lòng nhập họ và tên.';
      $('login-msg').classList.remove('hidden');
      return;
    }
    studentName = name;
    try { localStorage.setItem('vocab_student_name', name); } catch (e) {}

    $('quiz-topic').textContent = cfg.topic_name || 'Từ vựng hôm nay';
    $('quiz-student').textContent = ' · ' + studentName;
    $('quiz-count').textContent = entries.length + ' từ';

    buildQuizTable();
    showScreen('screen-quiz');
    $('topbar-right').classList.remove('hidden');

    totalSeconds = (Number(cfg.duration_minutes) || 15) * 60;
    endTime = Date.now() + totalSeconds * 1000;
    tick();
    timerId = setInterval(tick, 250);
    window.addEventListener('beforeunload', warnLeave);
  }

  function warnLeave(e) {
    if (!submitted) { e.preventDefault(); e.returnValue = ''; }
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
      spellcheck: 'false'
    });
    if (disabled) inp.disabled = true;
    return inp;
  }

  function setMeaning(tr, entry) {
    const lang = tr.dataset.lang;
    const text = lang === 'en'
      ? entry.definition
      : (entry.meaning || 'Chưa có nghĩa tiếng Việt');
    tr.querySelector('.lang-text').textContent = text || '—';
    tr.querySelector('.lang-tag').textContent = lang === 'en' ? 'EN' : 'VI';
  }

  function buildQuizTable() {
    const body = $('quiz-body');
    body.innerHTML = '';

    entries.forEach(function (e, i) {
      const tr = h('tr', { 'data-lang': 'en' });

      // Cột #
      tr.appendChild(h('td', { class: 'col-idx', text: String(i + 1) }));

      // Cột Từ vựng (ô trống để học sinh gõ)
      const tdWord = h('td', { 'data-label': 'Từ vựng' });
      if (APP_CONFIG.SHOW_HINT) {
        tdWord.appendChild(h('div', { class: 'hint', text: VocabParser.makeHint(e.word) }));
      }
      tdWord.appendChild(makeInput('word', 'Gõ từ vựng...', false));
      tr.appendChild(tdWord);

      // Cột Nghĩa (EN mặc định, nút chuyển EN/VI từng dòng)
      const btn = h('button', { type: 'button', class: 'btn-mini', text: 'EN ⇄ VI' });
      btn.addEventListener('click', function () {
        tr.dataset.lang = tr.dataset.lang === 'en' ? 'vi' : 'en';
        setMeaning(tr, e);
      });
      const tdMeaning = h('td', { 'data-label': 'Nghĩa' }, [
        h('div', { class: 'lang-cell' }, [
          h('span', { class: 'lang-tag' }),
          h('span', { class: 'lang-text' }),
          btn
        ])
      ]);
      tr.appendChild(tdMeaning);

      // Cột Synonym + Antonym (khóa nếu không có dữ liệu)
      const tdSA = h('td', { 'data-label': 'Synonym / Antonym' });
      tdSA.appendChild(makeInput('syn', e.hasSyn ? 'Synonym...' : 'Synonym: không yêu cầu', !e.hasSyn));
      tdSA.appendChild(h('div', { style: 'height:6px' }));
      tdSA.appendChild(makeInput('ant', e.hasAnt ? 'Antonym...' : 'Antonym: không yêu cầu', !e.hasAnt));
      tr.appendChild(tdSA);

      body.appendChild(tr);
      setMeaning(tr, e);
    });
  }

  // Nút chuyển tất cả EN/VI
  function toggleAllLang() {
    allLang = allLang === 'en' ? 'vi' : 'en';
    $('quiz-body').querySelectorAll('tr').forEach(function (tr, i) {
      tr.dataset.lang = allLang;
      setMeaning(tr, entries[i]);
    });
  }

  // ====== ĐỒNG HỒ ĐẾM NGƯỢC ======
  function tick() {
    const remaining = Math.ceil((endTime - Date.now()) / 1000);
    const t = $('timer');
    t.textContent = fmt(remaining);
    t.classList.toggle('warn', remaining <= 120 && remaining > 30);
    t.classList.toggle('danger', remaining <= 30);
    if (remaining <= 0) submitQuiz(true);
  }

  // ====== NỘP BÀI & CHẤM ĐIỂM ======
  function submitQuiz(auto) {
    if (submitted) return;
    if (!auto && !window.confirm('Bạn chắc chắn muốn nộp bài?')) return;

    submitted = true;
    clearInterval(timerId);
    window.removeEventListener('beforeunload', warnLeave);

    const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
    const seconds = Math.min(totalSeconds, totalSeconds - remaining);

    // Khóa toàn bộ ô nhập
    document.querySelectorAll('#quiz-body input').forEach(function (i) { i.disabled = true; });

    // Chấm điểm
    const rows = $('quiz-body').querySelectorAll('tr');
    let score = 0, total = 0;
    const wrongLines = [];
    const graded = entries.map(function (e, i) {
      const tr = rows[i];
      const get = function (f) { return tr.querySelector('[data-field="' + f + '"]').value; };

      const parts = {
        word: { req: true,     mine: get('word'), ok: false, correct: e.word },
        syn:  { req: e.hasSyn, mine: get('syn'),  ok: false, correct: e.synonym },
        ant:  { req: e.hasAnt, mine: get('ant'),  ok: false, correct: e.antonym }
      };
      parts.word.ok = VocabParser.checkAnswer(parts.word.mine, e.wordAnswers);
      parts.syn.ok  = parts.syn.req && VocabParser.checkAnswer(parts.syn.mine, e.synAnswers);
      parts.ant.ok  = parts.ant.req && VocabParser.checkAnswer(parts.ant.mine, e.antAnswers);

      const wrong = [];
      [['word', 'Từ vựng'], ['syn', 'Synonym'], ['ant', 'Antonym']].forEach(function (p) {
        const x = parts[p[0]];
        if (!x.req) return;
        total++;
        if (x.ok) score++;
        else wrong.push(p[1] + ': "' + (x.mine.trim() || '(trống)') + '"');
      });
      if (wrong.length) wrongLines.push((i + 1) + '. ' + e.word + ' | ' + wrong.join('; '));

      return parts;
    });

    renderResult(graded, score, total, seconds);

    // Gửi kết quả về Google Sheets của Admin
    sendResult({
      action: 'submit',
      name: studentName,
      topic: cfg.topic_name || '',
      score: score,
      total: total,
      seconds: seconds,
      wrongDetails: wrongLines.join('\n')
    });
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
      td.appendChild(h('span', { class: 'mine', text: part.mine.trim() }));
    } else {
      td.className = 'cell-bad';
      td.appendChild(h('span', { class: 'mine', text: part.mine.trim() || '(bỏ trống)' }));
      td.appendChild(h('span', { class: 'correct-answer', text: 'Đáp án: ' + part.correct }));
    }
    return td;
  }

  function renderResult(graded, score, total, seconds) {
    $('res-name').textContent = studentName;
    $('res-score').textContent = score + '/' + total;
    $('res-percent').textContent = (total ? Math.round(score / total * 100) : 0) + '%';
    $('res-time').textContent = fmt(seconds);

    const body = $('result-body');
    body.innerHTML = '';
    graded.forEach(function (g, i) {
      const e = entries[i];
      const tr = h('tr');
      tr.appendChild(h('td', { class: 'col-idx', text: String(i + 1) }));
      tr.appendChild(resultCell('Từ vựng', g.word));
      tr.appendChild(h('td', { 'data-label': 'Nghĩa' }, [
        h('div', { text: e.definition }),
        h('div', { class: 'muted', text: e.meaning })
      ]));
      tr.appendChild(resultCell('Synonym', g.syn));
      tr.appendChild(resultCell('Antonym', g.ant));
      body.appendChild(tr);
    });

    $('topbar-right').classList.add('hidden');
    showScreen('screen-result');
  }

  // ====== GỬI KẾT QUẢ (tự thử lại 3 lần) ======
  async function sendResult(payload) {
    const box = $('res-send-status');
    box.className = 'msg msg-info';
    box.textContent = 'Đang gửi kết quả cho giáo viên...';

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await apiPost(payload);
        box.className = 'msg msg-ok';
        box.textContent = 'Đã gửi kết quả cho giáo viên.';
        return;
      } catch (err) {
        if (attempt < 3) await new Promise(function (r) { setTimeout(r, 1500 * attempt); });
      }
    }

    box.className = 'msg msg-error';
    box.textContent = 'Chưa gửi được kết quả (kiểm tra mạng). ';
    const retry = h('button', { type: 'button', class: 'btn btn-secondary', text: 'Gửi lại' });
    retry.addEventListener('click', function () { sendResult(payload); });
    box.appendChild(retry);
  }

  // ====== GẮN SỰ KIỆN ======
  $('btn-retry').addEventListener('click', init);
  $('btn-start').addEventListener('click', startQuiz);
  $('student-name').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') startQuiz();
  });
  $('btn-lang-all').addEventListener('click', toggleAllLang);
  $('btn-submit').addEventListener('click', function () { submitQuiz(false); });
  $('btn-submit-bottom').addEventListener('click', function () { submitQuiz(false); });

  init();
})();