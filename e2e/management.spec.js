import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
const API = "http://127.0.0.1:15238";
const password = "CleanMate-admin-test-123!";
const unique = () => `${randomUUID()}@example.test`;
async function assignmentReport(request){
  const email=unique(),signup=await request.post(`${API}/api/auth/register`,{data:{fullName:'Assignment Customer',email,password}});expect(signup.status()).toBe(200);
  const customer=await signup.json(),headers={Authorization:`Bearer ${customer.token}`};
  const booking=await request.post(`${API}/api/bookings`,{headers,data:{serviceKey:'cleaning',startTime:new Date(Date.now()+2*86400000).toISOString(),durationHours:2,address:'123 Assignment Street',paymentMethod:'cash'}});expect(booking.status()).toBe(200);
  const report=await request.post(`${API}/api/support`,{headers,data:{bookingId:(await booking.json()).id,category:'Other',description:'Cần phân công người theo dõi yêu cầu.',requestId:randomUUID()}});expect(report.status()).toBe(200);
  return {id:(await report.json()).id,email};
}

test('staff claims an unassigned report, filters their queue and releases it',async({page,request})=>{
  const staff=await notificationStaff(request),report=await assignmentReport(request);await login(page,staff.email);await page.getByRole('link',{name:'Hỗ trợ',exact:true}).click();
  await page.getByLabel('Tìm yêu cầu',{exact:true}).fill(report.email);await page.getByLabel('Phân công',{exact:true}).selectOption('Unassigned');await page.getByRole('button',{name:'Lọc hỗ trợ',exact:true}).click();
  const card=page.locator(`[data-support-id="${report.id}"]`);await card.getByRole('button',{name:'Nhận xử lý',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Lưu phân công',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(card).toHaveCount(0);
  await page.getByLabel('Phân công',{exact:true}).selectOption('Mine');await page.getByRole('button',{name:'Lọc hỗ trợ',exact:true}).click();await expect(card).toContainText('Phụ trách: Inbox Staff');
  await card.getByRole('button',{name:'Bỏ nhận yêu cầu',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Lưu phân công',exact:true}).click();await expect(card).toHaveCount(0);
  await page.getByLabel('Phân công',{exact:true}).selectOption('Unassigned');await page.getByRole('button',{name:'Lọc hỗ trợ',exact:true}).click();await expect(card).toContainText('Chưa phân công');
});

test('admin assignment notifies the assignee and a stale form cannot overwrite it',async({page,request})=>{
  const staff=await notificationStaff(request),manager=await auth(request),report=await assignmentReport(request);await login(page);await page.getByRole('link',{name:'Hỗ trợ',exact:true}).click();
  await page.getByLabel('Tìm yêu cầu',{exact:true}).fill(report.email);await page.getByRole('button',{name:'Lọc hỗ trợ',exact:true}).click();const card=page.locator(`[data-support-id="${report.id}"]`);
  await card.getByRole('button',{name:'Phân công',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByLabel('Người phụ trách',{exact:true}).selectOption(String(staff.user.id));
  const assigned=await request.put(`${API}/api/management/support/${report.id}/assignment`,{headers:{Authorization:`Bearer ${manager.token}`},data:{assignedToId:staff.user.id,version:1}});expect(assigned.status()).toBe(200);
  await dialog.getByRole('button',{name:'Lưu phân công',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('Vui lòng tải lại');await dialog.getByRole('button',{name:'Đóng',exact:true}).click();
  await page.getByRole('button',{name:'Lọc hỗ trợ',exact:true}).click();await expect(card).toContainText('Phụ trách: Inbox Staff');
  await card.getByRole('button',{name:'Phân công',exact:true}).click();await dialog.getByLabel('Người phụ trách',{exact:true}).selectOption('');await dialog.getByRole('button',{name:'Lưu phân công',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(card).toContainText('Chưa phân công');
  await card.getByRole('button',{name:'Phân công',exact:true}).click();await dialog.getByLabel('Người phụ trách',{exact:true}).selectOption(String(staff.user.id));await dialog.getByRole('button',{name:'Lưu phân công',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(card).toContainText('Phụ trách: Inbox Staff');
  await page.getByRole('button',{name:'Đăng xuất',exact:true}).click();await login(page,staff.email);await page.getByRole('link',{name:'Thông báo',exact:true}).click();const notice=page.locator('[data-notification-id]').filter({hasText:'Bạn được giao yêu cầu hỗ trợ'});await expect(notice).toHaveCount(2);await notice.first().getByRole('button',{name:'Xem hỗ trợ',exact:true}).click();await expect(card).toContainText('Phụ trách: Inbox Staff');await expect(card.getByRole('button',{name:'Bỏ nhận yêu cầu',exact:true})).toBeVisible();
});
async function notificationStaff(request){const manager=await auth(request),email=unique();expect((await request.post(`${API}/api/management/staff`,{headers:{Authorization:`Bearer ${manager.token}`},data:{fullName:'Inbox Staff',email,password}})).status()).toBe(200);return {...await auth(request,email),email};}
test('staff inbox opens the exact processed cleaner profile and keeps read state after reload',async({page,request})=>{
  const staff=await notificationStaff(request),manager=await auth(request),email=unique();const created=await request.post(`${API}/api/auth/register`,{data:{fullName:'Inbox Applicant',email,password,role:'Cleaner'}});expect(created.status()).toBe(200);const profile=(await created.json()).user.cleanerProfile.id;
  expect((await request.put(`${API}/api/management/applications/${profile}/review`,{headers:{Authorization:`Bearer ${manager.token}`},data:{status:'Approved'}})).status()).toBe(200);
  await login(page,staff.email);await expect(page.locator('[data-unread-badge]')).toHaveText('1');await page.getByRole('link',{name:'Thông báo',exact:true}).click();const card=page.locator('[data-notification-id]').filter({hasText:`HS${profile}`});await expect(card).toContainText('Chưa đọc');await card.getByRole('button',{name:'Xem hồ sơ',exact:true}).click();
  await expect(page).toHaveURL(/#\/applications$/);await expect(page.locator('[data-review]')).toHaveCount(1);await expect(page.locator(`[data-review="${profile}"]`)).toBeVisible();
  await page.getByRole('link',{name:'Thông báo',exact:true}).click();await expect(card).toContainText('Chưa đọc');await card.getByRole('button',{name:'Đánh dấu đã đọc',exact:true}).click();await expect(page.locator('[data-inbox-count]')).toHaveText('0 thông báo chưa đọc.');await expect(page.locator('[data-unread-badge]')).toBeHidden();await page.reload();await expect(card).toContainText('Đã đọc');
});
test('staff inbox pagination and bulk read preserve a newer support message and open its exact report',async({page,request})=>{
  const staff=await notificationStaff(request),customerResponse=await request.post(`${API}/api/auth/register`,{data:{fullName:'Inbox Customer',email:unique(),password}});const customer=await customerResponse.json(),headers={Authorization:`Bearer ${customer.token}`};
  const booking=await request.post(`${API}/api/bookings`,{headers,data:{serviceKey:'cleaning',startTime:new Date(Date.now()+2*86400000).toISOString(),durationHours:2,address:'123 Inbox Street',paymentMethod:'cash'}});expect(booking.status()).toBe(200);const job=await booking.json();let ticket;
  for(let i=0;i<21;i++){const response=await request.post(`${API}/api/support`,{headers,data:{bookingId:job.id,category:'Other',description:`Yêu cầu hỗ trợ thứ ${i} cho ca làm.`,requestId:randomUUID()}});expect(response.status()).toBe(200);ticket=(await response.json()).id;}
  await login(page,staff.email);await page.getByRole('link',{name:'Thông báo',exact:true}).click();await expect(page.locator('[data-notification-id]')).toHaveCount(20);await page.getByRole('button',{name:'Thông báo cũ hơn',exact:true}).click();await expect(page.locator('[data-notification-id]')).toHaveCount(21);
  expect((await request.post(`${API}/api/support/${ticket}/messages`,{headers,data:{body:'Khách cần bổ sung thông tin mới.',requestId:randomUUID()}})).status()).toBe(200);
  await page.getByRole('button',{name:'Đánh dấu tất cả đã đọc',exact:true}).click();await expect(page.locator('[data-inbox-count]')).toHaveText('1 thông báo chưa đọc.');
  const actual=await (await request.get(`${API}/api/notifications`,{headers:{Authorization:`Bearer ${staff.token}`}})).json();expect(actual.items[0].readAt).toBeNull();expect(actual.items[0].targetId).toBe(ticket);
  await page.getByRole('button',{name:'Tải lại thông báo',exact:true}).click();const card=page.locator('[data-notification-id]').filter({hasText:'Có tin nhắn bổ sung từ người báo'});await card.getByRole('button',{name:'Xem hỗ trợ',exact:true}).click();await expect(page).toHaveURL(/#\/support$/);await expect(page.locator('[data-support-id]')).toHaveCount(1);const report=page.locator(`[data-support-id="${ticket}"]`);await report.getByRole('button',{name:'Xem trao đổi',exact:true}).click();await expect(report).toContainText('Khách cần bổ sung thông tin mới.');
});
test('staff reads and replies to a support conversation then resolves with the current version',async({page,request})=>{
  const email=unique(),registered=await request.post(`${API}/api/auth/register`,{data:{fullName:'Conversation Customer',email,password}});const customer=await registered.json(),headers={Authorization:`Bearer ${customer.token}`};
  const booking=await request.post(`${API}/api/bookings`,{headers,data:{serviceKey:'cleaning',startTime:new Date(Date.now()+2*86400000).toISOString(),durationHours:2,address:'123 Conversation Street',paymentMethod:'cash'}});const job=await booking.json();
  const created=await request.post(`${API}/api/support`,{headers,data:{bookingId:job.id,category:'Other',description:'Cần trao đổi thêm về ca làm.',requestId:randomUUID()}});expect(created.status()).toBe(200);const ticket=(await created.json()).id;
  expect((await request.post(`${API}/api/support/${ticket}/messages`,{headers,data:{body:'Khách bổ sung thông tin.',requestId:randomUUID()}})).status()).toBe(200);
  await login(page);await page.getByRole('link',{name:'Hỗ trợ',exact:true}).click();await page.getByLabel('Tìm yêu cầu',{exact:true}).fill(email);await page.getByRole('button',{name:'Lọc hỗ trợ',exact:true}).click();const card=page.locator(`[data-support-id="${ticket}"]`);
  await card.getByRole('button',{name:'Xem trao đổi',exact:true}).click();await expect(card.locator('[data-message-id]')).toContainText('Khách bổ sung');await card.getByLabel('Tin nhắn hỗ trợ',{exact:true}).fill('Staff đã đọc và đang kiểm tra thông tin.');await card.getByRole('button',{name:'Gửi tin nhắn',exact:true}).click();await expect(card.locator('[data-message-id]')).toHaveCount(2);
  await card.getByRole('button',{name:'Xử lý yêu cầu',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByLabel('Trạng thái mới',{exact:true}).selectOption('Resolved');await dialog.getByLabel('Phản hồi',{exact:true}).fill('Đã trao đổi và xác nhận đầy đủ với khách.');await dialog.getByRole('button',{name:'Lưu xử lý',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(card).toContainText('Đã giải quyết');await card.getByRole('button',{name:'Xem trao đổi',exact:true}).click();await expect(card.locator('[data-message-id]')).toHaveCount(3);
});
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
