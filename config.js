// ===== CẤU HÌNH KẾT NỐI =====
// Dán 2 giá trị lấy từ Supabase (Project Settings > API) vào giữa hai dấu ngoặc kép.
// Khoá này là khoá công khai, được phép đặt trên web. Quyền đọc/ghi được bảo vệ bởi các quy tắc trong tệp SQL.
window.TTA_CONFIG = {
  SUPABASE_URL: "https://mwstrmjrvrkozgwqlhmu.supabase.co",      // ví dụ: https://abcdxyz.supabase.co
  SUPABASE_KEY: "DAN_ANON_KEY_VAO_DAY"          // khoá "anon public" hoặc "publishable"
};
