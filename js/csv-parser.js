// ====== BỘ ĐỌC CSV 5 CỘT + CHUẨN HÓA ĐÁP ÁN ======
const VocabParser = (function () {

  // Ô trống hoặc chỉ có dấu gạch (-, –, —) nghĩa là không có dữ liệu
  function isEmptyMark(s) {
    const t = String(s == null ? '' : s).trim();
    return t === '' || /^[-–—]+$/.test(t);
  }

  // Chuẩn hóa chuỗi trước khi so sánh
  function normalize(s) {
    return String(s == null ? '' : s)
      .replace(/[’‘`´]/g, "'")            // nháy cong -> nháy thẳng
      .replace(/\([^)]*\)/g, ' ')          // bỏ ghi chú trong ngoặc: (informal)
      .replace(/\s*(\.{2,}|…)+\s*$/g, '')  // bỏ dấu ba chấm ở cuối
      .replace(/\s*\/\s*/g, '/')           // "crime/ drugs" -> "crime/drugs"
      .replace(/\s+/g, ' ')
      .replace(/^[\s.,;:!?]+|[\s.,;:!?]+$/g, '')
      .toLowerCase()
      .trim();
  }

  // Cột Synonym / Antonym: tách theo ; hoặc /
  function listAnswers(raw) {
    const out = [];
    String(raw).split(/[;\/]/).forEach(function (p) {
      const n = normalize(p);
      if (n && out.indexOf(n) === -1) out.push(n);
    });
    return out;
  }

  // Cột Vocabulary: có thể có dạng "to turn to crime/ drugs"
  // -> chấp nhận: nguyên cụm, "to turn to crime", "to turn to drugs"
  function vocabAnswers(raw) {
    const set = [];
    function add(x) { if (x && set.indexOf(x) === -1) set.push(x); }

    add(normalize(raw));
    String(raw).split(';').forEach(function (chunk) {
      const parts = chunk.split('/').map(normalize).filter(Boolean);
      if (parts.length < 2) { add(parts[0]); return; }

      const base = parts[0].split(' ');
      let simple = true;
      for (let j = 1; j < parts.length; j++) {
        const alt = parts[j].split(' ');
        if (alt.length > 2) simple = false;
        [alt.length, 1].forEach(function (k) {
          if (k < base.length) {
            add(base.slice(0, base.length - k).concat(alt).join(' '));
          }
        });
      }
      if (simple) add(parts[0]);
    });
    return set;
  }

  function rowToEntry(row) {
    const word       = String(row[0] || '').trim();
    const definition = String(row[1] || '').trim();
    const meaning    = String(row[2] || '').trim();
    const synonym    = String(row[3] || '').trim();
    const antonym    = String(row[4] || '').trim();
    const hasSyn = !isEmptyMark(synonym);
    const hasAnt = !isEmptyMark(antonym);
    return {
      word: word,
      definition: definition,
      meaning: meaning,
      synonym: hasSyn ? synonym : '',
      antonym: hasAnt ? antonym : '',
      hasSyn: hasSyn,
      hasAnt: hasAnt,
      wordAnswers: vocabAnswers(word),
      synAnswers: hasSyn ? listAnswers(synonym) : [],
      antAnswers: hasAnt ? listAnswers(antonym) : []
    };
  }

  // So sánh đáp án học sinh với danh sách đáp án hợp lệ
  function checkAnswer(input, answers) {
    const n = normalize(input);
    return n !== '' && answers.indexOf(n) !== -1;
  }

  // Gợi ý số ký tự: "Crime of passion" -> "C _ _ _ _   _ _   P _ _ _ _ _ _"
  function makeHint(word) {
    return String(word).split(/\s+/).map(function (tok) {
      return tok.split('').map(function (ch, i) {
        return (i > 0 && /\p{L}/u.test(ch)) ? '_' : ch;
      }).join(' ');
    }).join('   ');
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // Tải CSV từ Google Sheets và trả về mảng entry
  async function loadVocab(csvUrl) {
    if (!csvUrl) throw new Error('Chưa có đề hôm nay. Vui lòng liên hệ giáo viên.');
    const sep = csvUrl.indexOf('?') === -1 ? '?' : '&';
    const res = await fetch(csvUrl + sep + '_t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('Không tải được dữ liệu từ vựng (HTTP ' + res.status + ')');
    const text = await res.text();

    const parsed = Papa.parse(text, { header: false, skipEmptyLines: true });
    let rows = parsed.data;

    // Nếu dòng 1 là tiêu đề thì bỏ qua
    if (rows.length && /^(vocabulary|từ vựng|word)$/i.test(String(rows[0][0] || '').trim())) {
      rows = rows.slice(1);
    }

    const entries = rows.map(rowToEntry).filter(function (e) { return e.word; });
    if (!entries.length) throw new Error('File CSV không có dòng dữ liệu nào.');
    return entries;
  }

  return {
    loadVocab: loadVocab,
    checkAnswer: checkAnswer,
    normalize: normalize,
    makeHint: makeHint,
    shuffle: shuffle
  };
})();