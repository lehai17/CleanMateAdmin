import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
const API = "http://127.0.0.1:15238";
const password = "CleanMate-admin-test-123!";
const unique = () => `${randomUUID()}@example.test`;
async function auth(request, email = "admin@system.test") {
  const response = await request.post(`${API}/api/auth/login`, { data: { email, password } });
  expect(response.status()).toBe(200); return response.json();
}
async function login(page, email = "admin@system.test") {
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Mọi hoạt động trong tầm nhìn." })).toBeVisible();
}
test.beforeEach(async ({ page }) => { page.errors = []; page.on("pageerror", error => page.errors.push(error.message)); });
test.afterEach(async ({ page }) => expect(page.errors).toEqual([]));

test("public users cannot enter management or grant themselves a privileged role", async ({ page, request }) => {
  const email = unique();
  const result = await request.post(`${API}/api/auth/register`, { data: { fullName: "Customer", email, password, role: "Admin" } });
  expect((await result.json()).user.role).toBe("Customer");
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.getByText("Tài khoản này không có quyền quản trị.")).toBeVisible();
  const token = (await auth(request, email)).token;
  expect((await request.get(`${API}/api/management/dashboard`, { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(403);
});

test("staff reviews a cleaner application and the applicant gains job access only after approval", async ({ page, request }) => {
  const admin = await auth(request);
  const staffEmail = unique();
  expect((await request.post(`${API}/api/management/staff`, { headers: { Authorization: `Bearer ${admin.token}` }, data: { fullName: "Review Staff", email: staffEmail, password } })).status()).toBe(200);
  const email = unique();
  const registered = await request.post(`${API}/api/auth/register`, { data: { fullName: "Applicant Cleaner", email, password, role: "Cleaner", phoneNumber: "0901234567" } });
  const applicant = await registered.json();
  expect(applicant.user.isCleaner).toBe(false);
  expect((await request.get(`${API}/api/cleaner/jobs/available`, { headers: { Authorization: `Bearer ${applicant.token}` } })).status()).toBe(403);
  await login(page, staffEmail);
  await expect(page.getByRole("link", { name: "Nhân sự", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Hồ sơ cleaner", exact: true }).click();
  await page.getByLabel("Tìm kiếm", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Lọc kết quả", exact: true }).click();
  await page.getByRole("row").filter({ hasText: email }).getByRole("button", { name: "Xem & duyệt", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Kết quả", exact: true }).selectOption("NeedsInfo");
  await dialog.getByRole("button", { name: "Lưu kết quả duyệt", exact: true }).click();
  await expect(dialog.getByText("Vui lòng nhập lý do.")).toBeVisible();
  await dialog.getByLabel("Lý do / Ghi chú", { exact: true }).fill("Bổ sung kinh nghiệm làm việc");
  await dialog.getByRole("button", { name: "Lưu kết quả duyệt", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const headers = { Authorization: `Bearer ${applicant.token}` };
  expect((await request.put(`${API}/api/profile/cleaner-application`, { headers, data: { bio: "Đã có kinh nghiệm", city: "Ha Noi", addressText: "Test address", hourlyRate: 120000 } })).status()).toBe(200);
  await page.reload();
  await page.getByRole("row").filter({ hasText: email }).getByRole("button", { name: "Xem & duyệt", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Lưu kết quả duyệt", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await request.get(`${API}/api/cleaner/jobs/available`, { headers })).status()).toBe(200);
  const notices = await (await request.get(`${API}/api/notifications`, { headers })).json();
  expect(notices.items.some(item => item.target === "Profile" && item.title.includes("được duyệt"))).toBe(true);
  await page.getByRole("link", { name: "Dịch vụ & giá", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sửa cấu hình", exact: true })).toHaveCount(0);
});

test("admin edits service pricing while preserving existing quotes and rejecting stale configuration", async ({ page, request }) => {
  const admin = await auth(request);
  const headers = { Authorization: `Bearer ${admin.token}` };
  const services = await (await request.get(`${API}/api/management/services`, { headers })).json();
  const original = services.find(item => item.key === "cleaning");
  const customer = await (await request.post(`${API}/api/auth/register`, { data: { fullName: "Quote Customer", email: unique(), password } })).json();
  const customerHeaders = { Authorization: `Bearer ${customer.token}` };
  const payload = { serviceKey: "cleaning", startTime: new Date(Date.now() + 86400000).toISOString(), durationHours: 2, address: "Test address", paymentMethod: "cash" };
  const old = await (await request.post(`${API}/api/bookings`, { headers: customerHeaders, data: payload })).json();
  await login(page);
  await page.getByRole("link", { name: "Dịch vụ & giá", exact: true }).click();
  await page.getByRole("row").filter({ hasText: "cleaning" }).getByRole("button", { name: "Sửa cấu hình", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Giá mỗi giờ (VNĐ)", { exact: true }).fill("81000");
  try {
    await page.getByRole("dialog").getByRole("button", { name: "Lưu cấu hình", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect((await request.put(`${API}/api/management/services/cleaning`, { headers, data: { ...original, hourlyRate: 1e5 } })).status()).toBe(409);
    const current = await (await request.post(`${API}/api/bookings`, { headers: customerHeaders, data: payload })).json();
    expect(current.price).toBe(162000);
    const orders = await (await request.get(`${API}/api/orders`, { headers: customerHeaders })).json();
    expect(orders.find(item => item.id === old.id).price).toBe(original.hourlyRate * 2);
    await page.getByRole("link", { name: "Đơn hàng", exact: true }).click();
    await page.getByLabel("Tìm kiếm", { exact: true }).fill(`CM${current.id}`);
    await page.getByRole("button", { name: "Lọc kết quả", exact: true }).click();
    await expect(page.getByRole("row").filter({ hasText: `CM${current.id}` })).toContainText("162.000");
    await page.getByRole("link", { name: "Nhật ký thao tác", exact: true }).click();
    await expect(page.getByRole("cell", { name: "UpdateService", exact: true }).first()).toBeVisible();
  } finally {
    const latest = (await (await request.get(`${API}/api/management/services`, { headers })).json()).find(item => item.key === "cleaning");
    expect((await request.put(`${API}/api/management/services/cleaning`, { headers, data: { ...original, version: latest.version } })).status()).toBe(200);
  }
});

test("admin creates and locks staff, invalidating an already issued session", async ({ page, request }) => {
  await login(page);
  await page.getByRole("link", { name: "Nhân sự", exact: true }).click();
  await page.getByRole("button", { name: "Tạo Staff", exact: true }).click();
  const email = unique();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Họ tên", { exact: true }).fill("Staff To Lock");
  await dialog.getByLabel("Email", { exact: true }).fill(email);
  await dialog.getByLabel("Mật khẩu ban đầu", { exact: true }).fill(password);
  await dialog.getByRole("button", { name: "Tạo Staff", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const staff = await auth(request, email);
  expect((await request.get(`${API}/api/management/dashboard`, { headers: { Authorization: `Bearer ${staff.token}` } })).status()).toBe(200);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("row").filter({ hasText: email }).getByRole("button", { name: "Khóa truy cập", exact: true }).click();
  await expect(page.getByRole("row").filter({ hasText: email }).getByRole("button", { name: "Mở truy cập", exact: true })).toBeVisible();
  expect((await request.get(`${API}/api/management/dashboard`, { headers: { Authorization: `Bearer ${staff.token}` } })).status()).toBe(401);
  expect((await request.post(`${API}/api/auth/login`, { data: { email, password } })).status()).toBe(401);
});
