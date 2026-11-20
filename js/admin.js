(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };

  let password = '';
  let allResults = [];
  let presets = [];
  let refreshTimer = null;
  let dateInitialized = false;   // đã tự chọn "ngày mới nhất" lần đầu chưa

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
      loadPresets('');
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
      const data = await apiPost({ action: 'getConfig', password: password });
      const c = data.config;
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

  function validateForm(f) {
    if (!f.csv_url) return 'Vui lòng dán link CSV.';
    if (!/^https:\/\/docs\.google\.com\/spreadsheets\//.test(f.csv_url)) {
      return 'Link phải là link Google Sheets (bắt đầu bằng https://docs.google.com/spreadsheets/).';
    }
    if (!f.topic_name) return 'Vui lòng nhập tên chủ đề.';
    if (!(f.duration_minutes >= 1 && f.duration_minutes <= 180)) return 'Thời gian phải từ 1 đến 180 phút.';
    return '';
  }

  async function testCsv() {
    const f = readConfigForm();
    if (!f.csv_url) { showMsg('config-msg', 'error', 'Vui lòng dán link CSV.'); return; }
    const btn = $('btn-test-csv');
    btn.disabled = true;
    showMsg('config-msg', 'info', 'Đang kiểm tra link CSV...');
    try {
      const r = await apiPost({ action: 'previewCsv', password: password, csv_url: f.csv_url });
      showMsg('config-msg', 'ok',
        'Link hợp lệ: đọc được ' + r.count + ' từ. Ví dụ dòng đầu: "' + r.firstWord + '". ' +
        'Không có Synonym: ' + r.noSyn + ' · Không có Antonym: ' + r.noAnt +
        ' · Thiếu nghĩa tiếng Việt: ' + r.noVi + '.');
    } catch (err) {
      showMsg('config-msg', 'error', 'Link không dùng được: ' + (err.message || err));
    } finally {
      btn.disabled = false;
    }
  }

  async function saveConfig() {
    const f = readConfigForm();
    const problem = validateForm(f);
    if (problem) { showMsg('config-msg', 'error', problem); return; }

    const btns = [$('btn-save-config'), $('btn-activate')];
    btns.forEach(function (b) { b.disabled = true; });
    showMsg('config-msg', 'info', 'Đang kiểm tra và lưu...');
    try {
      const r = await apiPost({
        action: 'saveConfig',
        password: password,
        csv_url: f.csv_url,
        topic_name: f.topic_name,
        duration_minutes: f.duration_minutes
      });
      showMsg('config-msg', 'ok',
        'Đã kích hoạt đề "' + f.topic_name + '" (' + r.count + ' từ). Học sinh tải lại trang sẽ thấy đề mới.');
      loadCurrentConfig();
    } catch (err) {
      showMsg('config-msg', 'error', 'Chưa lưu được: ' + (err.message || err));
    } finally {
      btns.forEach(function (b) { b.disabled = false; });
    }
  }

  // ====== KHO ĐỀ (PRESETS) ======
  async function loadPresets(selectName) {
    try {
      const data = await apiPost({ action: 'getPresets', password: password });
      presets = data.presets || [];
    } catch (err) {
      presets = [];
      showMsg('config-msg', 'error', 'Không tải được kho đề: ' + (err.message || err));
    }
    const sel = $('preset-select');
    sel.innerHTML = '';
    sel.appendChild(h('option', {
      value: '',
      text: presets.length ? '-- Chọn đề trong kho --' : '(Kho đề đang trống, hãy lưu đề vào kho)'
    }));
    presets.forEach(function (p) { sel.appendChild(h('option', { value: p.name, text: p.name })); });
    if (selectName) sel.value = selectName;
  }

  function findPreset() {
    const name = $('preset-select').value;
    return presets.filter(function (p) { return p.name === name; })[0] || null;
  }

  function onPresetChange() {
    const p = findPreset();
    if (!p) return;
    $('cfg-csv').value = p.url;
    $('cfg-topic').value = p.name;
    hideMsg('config-msg');
  }

  async function activatePreset() {
    const p = findPreset();
    if (!p) { showMsg('config-msg', 'error', 'Hãy chọn một đề trong kho trước.'); return; }
    onPresetChange();
    const minutes = Number($('cfg-duration').value);
    if (!window.confirm('Kích hoạt đề "' + p.name + '" (' + minutes + ' phút) cho học sinh?')) return;
    await saveConfig();
  }

  async function savePreset() {
    const f = readConfigForm();
    const problem = validateForm(f);
    if (problem) { showMsg('config-msg', 'error', problem); return; }
    try {
      await apiPost({ action: 'savePreset', password: password, name: f.topic_name, url: f.csv_url });
      await loadPresets(f.topic_name);
      showMsg('config-msg', 'ok', 'Đã lưu "' + f.topic_name + '" vào kho đề.');
    } catch (err) {
      showMsg('config-msg', 'error', 'Chưa lưu được vào kho: ' + (err.message || err));
    }
  }

  async function deletePreset() {
    const p = findPreset();
    if (!p) { showMsg('config-msg', 'error', 'Hãy chọn một đề trong kho để xóa.'); return; }
    if (!window.confirm('Xóa "' + p.name + '" khỏi kho đề? (Không ảnh hưởng đề đang dùng)')) return;
    try {
      await apiPost({ action: 'deletePreset', password: password, name: p.name });
      await loadPresets('');
      showMsg('config-msg', 'ok', 'Đã xóa "' + p.name + '" khỏi kho đề.');
    } catch (err) {
      showMsg('config-msg', 'error', 'Chưa xóa được: ' + (err.message || err));
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
      refreshFilters();
      renderResults();
    } catch (err) {
      showMsg('results-msg', 'error', 'Không tải được kết quả: ' + (err.message || err));
    }
  }

  function refreshFilters() {
    // --- bộ lọc chủ đề ---
    const tSel = $('filter-topic');
    const prevTopic = tSel.value;
    const topics = [];
    allResults.forEach(function (r) {
      if (r.topic && topics.indexOf(r.topic) === -1) topics.push(r.topic);
    });
    tSel.innerHTML = '';
    tSel.appendChild(h('option', { value: '', text: 'Tất cả chủ đề' }));
    topics.forEach(function (t) { tSel.appendChild(h('option', { value: t, text: t })); });
    tSel.value = topics.indexOf(prevTopic) !== -1 ? prevTopic : '';

    // --- bộ lọc ngày (lần đầu tự chọn ngày mới nhất) ---
    const dSel = $('filter-date');
    const prevDate = dSel.value;
    const dates = [];
    allResults.forEach(function (r) {
      const d = String(r.submittedAt).slice(0, 10);
      if (d && dates.indexOf(d) === -1) dates.push(d);
    });
    dates.sort().reverse();
    dSel.innerHTML = '';
    dSel.appendChild(h('option', { value: '', text: 'Tất cả ngày' }));
    dates.forEach(function (d) { dSel.appendChild(h('option', { value: d, text: d })); });
    if (!dateInitialized && dates.length) {
      dSel.value = dates[0];
      dateInitialized = true;
    } else {
      dSel.value = dates.indexOf(prevDate) !== -1 ? prevDate : '';
    }
  }

  function getVisibleResults() {
    const topic = $('filter-topic').value;
    const date = $('filter-date').value;
    const sortBy = $('sort-by').value;

    let list = allResults.filter(function (r) {
      return (!topic || r.topic === topic) && (!date || String(r.submittedAt).slice(0, 10) === date);
    });

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

  // ====== THỐNG KÊ TỪ HAY SAI NHẤT ======
  function renderHeat(list) {
    const box = $('heat-list');
    const note = $('heat-note');
    box.innerHTML = '';

    // Bài cũ (trước khi nâng cấp) có chi tiết sai nhưng không có danh sách từ sai: bỏ qua
    const tracked = list.filter(function (r) {
      return (r.wrongWords && r.wrongWords.length) || !r.wrongDetails;
    });
    if (!tracked.length) {
      note.textContent = 'Chưa có dữ liệu để thống kê trong bộ lọc này.';
      return;
    }

    const counts = {};
    tracked.forEach(function (r) {
      const seen = {};
      (r.wrongWords || []).forEach(function (w) {
        if (!seen[w]) { seen[w] = true; counts[w] = (counts[w] || 0) + 1; }
      });
    });

    const rows = Object.keys(counts).map(function (w) {
      return { word: w, n: counts[w], rate: counts[w] / tracked.length };
    });
    rows.sort(function (a, b) { return (b.rate - a.rate) || a.word.localeCompare(b.word); });
    const top = rows.slice(0, 5);

    note.textContent = 'Tính trên ' + tracked.length + ' bài nộp' +
      (tracked.length < 5 ? ' (số bài còn ít, chỉ mang tính tham khảo)' : '') +
      '. Một từ được tính là sai nếu học sinh sai bất kỳ ô nào của từ đó.';

    if (!top.length) {
      box.appendChild(h('div', { class: 'muted', text: 'Chưa có từ nào bị sai.' }));
      return;
    }

    top.forEach(function (x, i) {
      const pct = Math.round(x.rate * 100);
      const sev = pct >= 60 ? 'sev-high' : (pct >= 30 ? 'sev-mid' : '');
      box.appendChild(h('div', { class: 'heat-item' }, [
        h('div', { class: 'heat-rank', text: String(i + 1) }),
        h('div', { class: 'heat-word', text: x.word }),
        h('div', { class: 'heat-bar' }, [
          h('div', { class: 'heat-fill ' + sev, style: 'width:' + pct + '%' })
        ]),
        h('div', { class: 'heat-pct', text: pct + '% (' + x.n + '/' + tracked.length + ' bạn)' })
      ]));
    });
  }

  // ====== BẢNG KẾT QUẢ ======
  function renderResults() {
    const list = getVisibleResults();
    const body = $('results-body');
    body.innerHTML = '';
    $('results-count').textContent = list.length + ' bài nộp';
    renderHeat(list);

    if (!list.length) {
      const tr = h('tr');
      tr.appendChild(h('td', { colspan: '9', class: 'center muted', text: 'Chưa có bài nộp nào.' }));
      body.appendChild(tr);
      return;
    }

    list.forEach(function (r, i) {
      const pct = r.total ? Math.round(r.score / r.total * 100) : 0;
      const badgeClass = pct >= 80 ? 'badge-ok' : (pct >= 50 ? 'badge-mid' : 'badge-bad');
      const tabs = Number(r.tabSwitches) || 0;
      const tabClass = tabs === 0 ? 'badge-ok' : (tabs <= 2 ? 'badge-mid' : 'badge-bad');

      const tr = h('tr');
      tr.appendChild(h('td', { text: String(i + 1) }));
      tr.appendChild(h('td', { text: r.submittedAt }));
      tr.appendChild(h('td', { text: r.name, style: 'font-weight:600' }));
      tr.appendChild(h('td', { text: r.topic }));
      tr.appendChild(h('td', { text: r.score + '/' + r.total }));
      tr.appendChild(h('td', {}, [h('span', { class: 'badge ' + badgeClass, text: pct + '%' })]));
      tr.appendChild(h('td', { text: fmt(r.seconds) }));
      tr.appendChild(h('td', {}, [h('span', { class: 'badge ' + tabClass, text: tabs + ' lần' })]));

      const tdWrong = h('td');
      if (r.wrongDetails) {
        const n = String(r.wrongDetails).split('\n').length;
        tdWrong.appendChild(h('details', {}, [
          h('summary', { text: 'Xem ' + n + ' dòng sai' }),
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
        'Rời tab (lần)': Number(r.tabSwitches) || 0,
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

  // Nút nào đang bị khóa (đang chờ server) thì tự hiện vòng xoay
  new MutationObserver(function (list) {
    list.forEach(function (m) {
      const el = m.target;
      if (el.classList && el.classList.contains('btn')) {
        el.classList.toggle('is-loading', el.disabled);
      }
    });
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['disabled'] });

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
  $('preset-select').addEventListener('change', onPresetChange);
  $('btn-activate').addEventListener('click', activatePreset);
  $('btn-save-preset').addEventListener('click', savePreset);
  $('btn-del-preset').addEventListener('click', deletePreset);

  $('filter-topic').addEventListener('change', renderResults);
  $('filter-date').addEventListener('change', renderResults);
  $('sort-by').addEventListener('change', renderResults);
  $('btn-refresh').addEventListener('click', loadResults);
  $('btn-export').addEventListener('click', exportCsv);

  // Tự đăng nhập lại nếu tab vẫn còn phiên (F5 không bị văng ra)
  try {
    const saved = sessionStorage.getItem('vocab_admin_pw');
    if (saved) login(saved, true);
  } catch (e) {}
})();