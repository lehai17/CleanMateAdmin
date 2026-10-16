const key = "cleanmate_management_token";
export const session = {
  get: () => sessionStorage.getItem(key),
  set: token => sessionStorage.setItem(key, token),
  clear: () => sessionStorage.removeItem(key)
};
export async function api(path, { method = "GET", data } = {}) {
  const response = await fetch(`/api${path}`, {
    method, headers: { "Content-Type": "application/json", ...(session.get() ? { Authorization: `Bearer ${session.get()}` } : {}) },
    body: data === undefined ? undefined : JSON.stringify(data), cache: "no-store"
  });
  const text = await response.text();
  let result;
  try { result = text ? JSON.parse(text) : null; } catch { result = null; }
  if (!response.ok) {
    const error = new Error(result?.message || (response.status === 401 ? path === "/auth/login" ? "Email hoặc mật khẩu không đúng, hoặc tài khoản đã bị khóa." : "Phiên đăng nhập đã hết hạn hoặc tài khoản đã bị khóa." : response.status === 403 ? "Bạn không có quyền thực hiện thao tác này." : "Yêu cầu không thành công. Vui lòng thử lại."));
    error.status = response.status; throw error;
  }
  return result;
}
