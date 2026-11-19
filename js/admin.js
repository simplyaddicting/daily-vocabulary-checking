(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };

  let password = '';
  let allResults = [];
  let refreshTimer = null;

  // ====== TIỆN ÍCH ======
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

  function fmt(sec) {
    sec = Math.max(0, Math.round(Number(sec) || 0));
    return String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
  }

  function showMsg(id, type, text) {
    const box = $(id);
    box.className = 'msg msg-' + type;
    box.textContent = text;
  }
  function hideMsg(id) { $(id).classList.add('hidden'); }

  function showScreen(name) {
    $('screen-login').classList.toggle('hidden', name !== 'login');
    $('screen-admin').classList.toggle('hidden', name !== 'admin');
    $('topbar-right').classList.toggle('hidden', name !== 'admin');
  }

  function showTab(name) {
    $('panel-config').classList.toggle('hidden', name !== 'config');
    $('panel-results').classList.toggle('hidden', name !== 'results');
    $('tabbtn-config').classList.toggle('active', name === 'config');
    $('tabbtn-results').classList.toggle('active', name === 'results');

    clearInterval(refreshTimer);
    if (name === 'results') {
      loadResults();
      refreshTimer = setInterval(function () {
        if ($('auto-refresh').checked) loadResults();
      }, 30000);
    }
  }

  // ====== ĐĂNG NHẬP / ĐĂNG XUẤT ======
  async function login(pw, silent) {
    const btn = $('btn-login');
    btn.disabled = true;
    hideMsg('login-msg');
    try {
      await apiPost({ action: 'login', password: pw });
      password = pw;
      try { sessionStorage.setItem('vocab_admin_pw', pw); } catch (e) {}
      showScreen('admin');
      showTab('config');
      loadCurrentConfig();
    } catch (err) {
      try { sessionStorage.removeItem('vocab_admin_pw'); } catch (e) {}
      if (!silent) showMsg('login-msg', 'error', err.message || String(err));
    } finally {
      btn.disabled = false;
    }
  }

  function logout() {
    password = '';
    allResults = [];
    clearInterval(refreshTimer);
    try { sessionStorage.removeItem('vocab_admin_pw'); } catch (e) {}
    $('admin-password').value = '';
    showScreen('login');
  }

  // ====== TAB 1: CẬP NHẬT ĐỀ ======
  async function loadCurrentConfig() {
    try {
      const c = await apiGetConfig();
      $('cfg-csv').value = c.csv_url || '';
      $('cfg-topic').value = c.topic_name || '';
      $('cfg-duration').value = c.duration_minutes || 15;
      $('current-info').textContent = c.csv_url
        ? 'Đề đang dùng: "' + (c.topic_name || '(chưa đặt tên)') + '" · ' + c.duration_minutes +
          ' phút · cập nhật lần cuối: ' + (c.updated_at || 'không rõ')
        : 'Chưa có đề nào được đăng.';
    } catch (err) {
      $('current-info').textContent = 'Không tải được cấu hình hiện tại: ' + (err.message || err);
    }
  }

  function readConfigForm() {
    return {
      csv_url: $('cfg-csv').value.trim(),
      topic_name: $('cfg-topic').value.trim(),
      duration_minutes: Number($('cfg-duration').value)
    };
  }

  async function testCsv() {
    const f = readConfigForm();
    if (!f.csv_url) { showMsg('config-msg', 'error', 'Vui lòng dán link CSV.'); return; }
    const btn = $('btn-test-csv');
    btn.disabled = true;
    showMsg('config-msg', 'info', 'Đang kiểm tra link CSV...');
    try {
      const list = await VocabParser.loadVocab(f.csv_url);
      const noSyn = list.filter(function (e) { return !e.hasSyn; }).length;
      const noAnt = list.filter(function (e) { return !e.hasAnt; }).length;
      const noVi  = list.filter(function (e) { return !e.meaning; }).length;
      showMsg('config-msg', 'ok',
        'Link hợp lệ: đọc được ' + list.length + ' từ. Ví dụ dòng đầu: "' + list[0].word + '". ' +
        'Không có Synonym: ' + noSyn + ' · Không có Antonym: ' + noAnt + ' · Thiếu nghĩa tiếng Việt: ' + noVi + '.');
    } catch (err) {
      showMsg('config-msg', 'error', 'Link không dùng được: ' + (err.message || err));
    } finally {
      btn.disabled = false;
    }
  }

  async function saveConfig() {
    const f = readConfigForm();
    if (!f.csv_url) { showMsg('config-msg', 'error', 'Vui lòng dán link CSV.'); return; }
    if (!/^https?:\/\//i.test(f.csv_url)) { showMsg('config-msg', 'error', 'Link CSV phải bắt đầu bằng https://'); return; }
    if (!f.topic_name) { showMsg('config-msg', 'error', 'Vui lòng nhập tên chủ đề.'); return; }
    if (!(f.duration_minutes >= 1 && f.duration_minutes <= 180)) {
      showMsg('config-msg', 'error', 'Thời gian phải từ 1 đến 180 phút.');
      return;
    }

    const btn = $('btn-save-config');
    btn.disabled = true;
    showMsg('config-msg', 'info', 'Đang kiểm tra và lưu...');
    try {
      await VocabParser.loadVocab(f.csv_url);   // chặn lưu nếu link CSV hỏng
      await apiPost({
        action: 'saveConfig',
        password: password,
        csv_url: f.csv_url,
        topic_name: f.topic_name,
        duration_minutes: f.duration_minutes
      });
      showMsg('config-msg', 'ok', 'Đã cập nhật đề. Học sinh mở trang sẽ thấy đề mới ngay.');
      loadCurrentConfig();
    } catch (err) {
      showMsg('config-msg', 'error', 'Chưa lưu được: ' + (err.message || err));
    } finally {
      btn.disabled = false;
    }
  }

  // ====== TAB 2: KẾT QUẢ ======
  async function loadResults() {
    hideMsg('results-msg');
    try {
      const data = await apiPost({ action: 'getResults', password: password });
      allResults = (data.results || []).map(function (r, i) {
        r._order = i;   // 0 = mới nhất
        return r;
      });
      refreshTopicFilter();
      renderResults();
    } catch (err) {
      showMsg('results-msg', 'error', 'Không tải được kết quả: ' + (err.message || err));
    }
  }

  function refreshTopicFilter() {
    const sel = $('filter-topic');
    const current = sel.value;
    const topics = [];
    allResults.forEach(function (r) {
      if (r.topic && topics.indexOf(r.topic) === -1) topics.push(r.topic);
    });
    sel.innerHTML = '';
    sel.appendChild(h('option', { value: '', text: 'Tất cả chủ đề' }));
    topics.forEach(function (t) { sel.appendChild(h('option', { value: t, text: t })); });
    sel.value = topics.indexOf(current) !== -1 ? current : '';
  }

  function getVisibleResults() {
    const topic = $('filter-topic').value;
    const sortBy = $('sort-by').value;
    let list = allResults.filter(function (r) { return !topic || r.topic === topic; });

    list = list.slice().sort(function (a, b) {
      if (sortBy === 'score') {
        const pa = a.total ? a.score / a.total : 0;
        const pb = b.total ? b.score / b.total : 0;
        return (pb - pa) || (a.seconds - b.seconds);
      }
      if (sortBy === 'fastest') return (a.seconds - b.seconds) || (b.score - a.score);
      return a._order - b._order;
    });
    return list;
  }

  function renderResults() {
    const list = getVisibleResults();
    const body = $('results-body');
    body.innerHTML = '';
    $('results-count').textContent = list.length + ' bài nộp';

    if (!list.length) {
      const tr = h('tr');
      tr.appendChild(h('td', { colspan: '8', class: 'center muted', text: 'Chưa có bài nộp nào.' }));
      body.appendChild(tr);
      return;
    }

    list.forEach(function (r, i) {
      const pct = r.total ? Math.round(r.score / r.total * 100) : 0;
      const badgeClass = pct >= 80 ? 'badge-ok' : (pct >= 50 ? 'badge-mid' : 'badge-bad');

      const tr = h('tr');
      tr.appendChild(h('td', { text: String(i + 1) }));
      tr.appendChild(h('td', { text: r.submittedAt }));
      tr.appendChild(h('td', { text: r.name, style: 'font-weight:600' }));
      tr.appendChild(h('td', { text: r.topic }));
      tr.appendChild(h('td', { text: r.score + '/' + r.total }));
      tr.appendChild(h('td', {}, [h('span', { class: 'badge ' + badgeClass, text: pct + '%' })]));
      tr.appendChild(h('td', { text: fmt(r.seconds) }));
            const tdWrong = h('td');
      if (r.wrongDetails) {
        const n = String(r.wrongDetails).split('\n').length;
        tdWrong.appendChild(h('details', {}, [
          h('summary', { text: 'Xem ' + n + ' dòng sai', style: 'cursor:pointer;color:#2563eb' }),
          h('div', { class: 'wrong-detail', text: r.wrongDetails })
        ]));
      } else {
        tdWrong.appendChild(h('span', { class: 'muted', text: '(không sai ý nào)' }));
      }
      tr.appendChild(tdWrong);
      body.appendChild(tr);
    });
  }

  function exportCsv() {
    const list = getVisibleResults();
    if (!list.length) { showMsg('results-msg', 'error', 'Chưa có dữ liệu để xuất.'); return; }
    const rows = list.map(function (r) {
      return {
        'Thời gian nộp': r.submittedAt,
        'Họ tên': r.name,
        'Chủ đề': r.topic,
        'Điểm': r.score,
        'Tổng số ý': r.total,
        'Tỉ lệ (%)': r.total ? Math.round(r.score / r.total * 100) : 0,
        'Thời gian làm (mm:ss)': fmt(r.seconds),
        'Chi tiết câu sai': r.wrongDetails
      };
    });
    const csv = '\ufeff' + Papa.unparse(rows);   // \ufeff để Excel đọc đúng tiếng Việt
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ket-qua-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }

  // ====== GẮN SỰ KIỆN ======
  $('btn-login').addEventListener('click', function () {
    const pw = $('admin-password').value;
    if (!pw) { showMsg('login-msg', 'error', 'Vui lòng nhập mật khẩu.'); return; }
    login(pw, false);
  });
  $('admin-password').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') $('btn-login').click();
  });
  $('btn-logout').addEventListener('click', logout);

  $('tabbtn-config').addEventListener('click', function () { showTab('config'); });
  $('tabbtn-results').addEventListener('click', function () { showTab('results'); });

  $('btn-test-csv').addEventListener('click', testCsv);
  $('btn-save-config').addEventListener('click', saveConfig);

  $('filter-topic').addEventListener('change', renderResults);
  $('sort-by').addEventListener('change', renderResults);
  $('btn-refresh').addEventListener('click', loadResults);
  $('btn-export').addEventListener('click', exportCsv);

  // Tự đăng nhập lại nếu tab vẫn còn phiên (F5 không bị văng ra)
  try {
    const saved = sessionStorage.getItem('vocab_admin_pw');
    if (saved) login(saved, true);
  } catch (e) {}
})();