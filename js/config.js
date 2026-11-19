// ====== CẤU HÌNH CHUNG ======
const APP_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbz7cpn9dcv2NTKqfG6HIhIfiRdv_uFvg_mTYL8xZrKjKV7-4jVD20bIiC7Y0J7FeHuN/exec',
  SHUFFLE_QUESTIONS: true,   // true = xáo trộn thứ tự dòng để chống chép bài
  SHOW_HINT: true            // true = hiện gợi ý số ký tự ở ô từ vựng
};

// ====== HÀM GỌI BACKEND (dùng chung cho học sinh và Admin) ======

// Lấy đề hiện tại (công khai)
async function apiGetConfig() {
  const res = await fetch(APP_CONFIG.API_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error('Không kết nối được máy chủ (HTTP ' + res.status + ')');
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Lỗi không xác định');
  return data.config;
}

// Gửi dữ liệu lên backend (nộp bài, đăng nhập Admin, lưu cấu hình, xem kết quả)
// Dùng Content-Type text/plain để tránh lỗi CORS preflight của Apps Script
async function apiPost(payload) {
  const res = await fetch(APP_CONFIG.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('Không kết nối được máy chủ (HTTP ' + res.status + ')');
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Lỗi không xác định');
  return data;
}