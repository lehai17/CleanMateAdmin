import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
const API = "http://127.0.0.1:15238";
const password = "CleanMate-admin-test-123!";
const unique = () => `${randomUUID()}@example.test`;
test('management login displays retry instructions without creating a session',async({page})=>{
  await page.goto('/');await page.route('**/api/auth/login',route=>route.fulfill({status:429,contentType:'application/json',headers:{'Retry-After':'42'},body:JSON.stringify({message:'Thử lại sau 42 giây.',retryAfterSeconds:42})}));
  await page.getByLabel('Email',{exact:true}).fill('admin@system.test');await page.getByLabel('Mật khẩu',{exact:true}).fill(password);await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await expect(page.locator('#notice')).toContainText('42 giây');await expect(page.getByLabel('Mật khẩu',{exact:true})).toHaveValue('');
  await page.unroute('**/api/auth/login');await login(page);
});
test('staff confirms logout all and keeps the existing password',async({page,request})=>{
  const manager=await auth(request),email=unique();expect((await request.post(`${API}/api/management/staff`,{headers:{Authorization:`Bearer ${manager.token}`},data:{fullName:'Session Staff',email,password}})).status()).toBe(200);
  const old=await auth(request,email);await login(page,email);await page.getByRole('link',{name:'Bảo mật',exact:true}).click();
  page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'Đăng xuất tất cả thiết bị',exact:true}).click();expect((await request.get(`${API}/api/me`,{headers:{Authorization:`Bearer ${old.token}`}})).status()).toBe(200);
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Đăng xuất tất cả thiết bị',exact:true}).click();await expect(page.getByText('Đã đăng xuất tất cả thiết bị. Vui lòng đăng nhập lại.',{exact:true})).toBeVisible();expect((await request.get(`${API}/api/me`,{headers:{Authorization:`Bearer ${old.token}`}})).status()).toBe(401);
  await login(page,email);expect((await request.get(`${API}/api/me`,{headers:{Authorization:`Bearer ${manager.token}`}})).status()).toBe(200);
});
test('staff changes own password and old sessions stop working',async({page,request})=>{
  const manager=await auth(request),email=unique(),next='New-staff-password-456!';
  expect((await request.post(`${API}/api/management/staff`,{headers:{Authorization:`Bearer ${manager.token}`},data:{fullName:'Password Staff',email,password}})).status()).toBe(200);
  const old=await auth(request,email);await login(page,email);await page.getByRole('link',{name:'Bảo mật',exact:true}).click();
  await page.getByLabel('Mật khẩu hiện tại',{exact:true}).fill('wrong password');await page.getByLabel('Mật khẩu mới',{exact:true}).fill(next);await page.getByLabel('Nhập lại mật khẩu mới',{exact:true}).fill(next);await page.getByRole('button',{name:'Lưu mật khẩu mới',exact:true}).click();await expect(page.getByRole('alert')).toContainText('hiện tại không đúng');
  await page.getByLabel('Mật khẩu hiện tại',{exact:true}).fill(password);await page.getByRole('button',{name:'Lưu mật khẩu mới',exact:true}).click();await expect(page.getByRole('button',{name:'Đăng nhập',exact:true})).toBeVisible();await expect(page.getByText('Đã đổi mật khẩu. Vui lòng đăng nhập lại.',{exact:true})).toBeVisible();
  expect((await request.get(`${API}/api/me`,{headers:{Authorization:`Bearer ${old.token}`}})).status()).toBe(401);
  expect((await request.post(`${API}/api/auth/login`,{data:{email,password}})).status()).toBe(401);
  await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Mật khẩu',{exact:true}).fill(next);await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await expect(page.getByRole('button',{name:'Đăng xuất',exact:true})).toBeVisible();
});
test('staff handles a customer support report with required resolution and records audit',async({page,request})=>{
  const email=unique();const r=await request.post(`${API}/api/auth/register`,{data:{fullName:'Support Customer',email,password,phoneNumber:'0901234567'}});expect(r.status()).toBe(200);const customer=await r.json();
  const booking=await request.post(`${API}/api/bookings`,{headers:{Authorization:`Bearer ${customer.token}`},data:{serviceKey:'cleaning',startTime:new Date(Date.now()+2*86400000).toISOString(),durationHours:2,address:'123 Support Street',paymentMethod:'cash'}});expect(booking.status()).toBe(200);const job=await booking.json();
  const created=await request.post(`${API}/api/support`,{headers:{Authorization:`Bearer ${customer.token}`},data:{bookingId:job.id,category:'Scheduling',description:'Khách cần hỗ trợ trước giờ làm việc.',requestId:randomUUID()}});expect(created.status()).toBe(200);const ticket=await created.json();
  const manager=await auth(request),staffEmail=unique();expect((await request.post(`${API}/api/management/staff`,{headers:{Authorization:`Bearer ${manager.token}`},data:{fullName:'Support Staff',email:staffEmail,password}})).status()).toBe(200);
  await login(page,staffEmail);await page.getByRole('link',{name:'Hỗ trợ',exact:true}).click();await page.getByLabel('Tìm yêu cầu',{exact:true}).fill(email);await page.getByRole('button',{name:'Lọc hỗ trợ',exact:true}).click();await page.locator(`[data-support-id="${ticket.id}"]`).getByRole('button',{name:'Xử lý yêu cầu',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.getByLabel('Trạng thái mới',{exact:true}).selectOption('Resolved');await dialog.getByRole('button',{name:'Lưu xử lý',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('ít nhất 10');await dialog.getByLabel('Phản hồi',{exact:true}).fill('Đã liên hệ và xác nhận lại lịch làm.');await dialog.getByRole('button',{name:'Lưu xử lý',exact:true}).click();await expect(dialog).toHaveCount(0);
  await expect(page.locator(`[data-support-id="${ticket.id}"]`)).toContainText('Đã giải quyết');const mine=await request.get(`${API}/api/support`,{headers:{Authorization:`Bearer ${customer.token}`}});expect((await mine.json()).items[0].response).toContain('Đã liên hệ');
  await page.getByRole('link',{name:'Nhật ký thao tác',exact:true}).click();await expect(page.getByRole('cell',{name:`Support:${ticket.id}`,exact:true})).toBeVisible();
});
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
