import './ui/preferences.js';
import { t } from './ui/preferences.js';
import {showRecovery} from './account.js';
import { api, session } from "./api.js";
import {renderSupport} from './support.js';
import {showPassword} from './password.js';
import {showNotifications,createUnreadPoller} from './notifications.js';

const root = document.querySelector("#app");
const h = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const number = value => Number(value || 0).toLocaleString("vi-VN");
const money = value => `${number(value)} đ`;
const date = value => value ? new Date(value).toLocaleString("vi-VN") : "—";
const names = { Pending: "Chờ duyệt", Approved: "Đã duyệt", NeedsInfo: "Cần bổ sung", Rejected: "Từ chối", Accepted: "Đã nhận", InProgress: "Đang làm", Completed: "Hoàn thành", Cancelled: "Đã hủy" };
const badge = (value, context) => `<span class="status ${h(value)}">${h(value === "Pending" && context === "order" ? "Chờ nhận" : names[value] || value)}</span>`;
const activeBadge = active => `<span class="status ${active ? "Approved" : "Cancelled"}">${active ? "Đang hoạt động" : "Tạm khóa"}</span>`;
const nav = [["dashboard", "Tổng quan"], ["applications", "Hồ sơ cleaner"], ["orders", "Đơn hàng"], ["support","Hỗ trợ"], ["services", "Dịch vụ & giá"], ["staff", "Nhân sự"], ["audit", "Nhật ký thao tác"]];
nav.push(['security','Bảo mật']);
nav.push(['notifications','Thông báo']);
let user, generation = 0;
let unreadCount=0;
const unreadPoller=createUnreadPoller({api,getToken:()=>user?session.get():null,isVisible:()=>document.visibilityState!=='hidden',onCount:updateUnread,onExpired:fail});
function updateUnread(count){
  unreadCount=count;const badge=document.querySelector('[data-unread-badge]');if(badge){badge.hidden=count===0;badge.textContent=count>99?'99+':String(count);badge.closest('a').title=`${count} thông báo chưa đọc`;}
}
const state = { applications: { page: 1, status: "Pending", search: "" }, orders: { page: 1, status: "All", search: "" },support:{page:1,status:'All',search:''} };
let rows = [];
const route = () => location.hash.slice(2) || "dashboard";

function showNotice(message, success = false) {
  const element = document.querySelector("#notice");
  if (element) { element.className = `alert ${success ? "success" : ""}`; element.textContent = message; }
}
function fail(error) {
  if (error.status === 401) { session.clear(); user = null; login(error.message); }
  else showNotice(error.message || "Không thể kết nối. Vui lòng thử lại.");
}
function login(error = "") {
  generation++;
  unreadPoller.accept(0);
  root.innerHTML = `<div class="login"><aside class="login-aside"><div class="brand">Clean<span>Mate</span></div><h1>Quản lý dịch vụ.<br>Vận hành rõ ràng.</h1><p>Không gian làm việc dành cho đội ngũ CleanMate. Duyệt hồ sơ, theo dõi ca làm và quản lý dịch vụ tại một nơi.</p></aside><main class="login-main"><p class="eyebrow">Cổng quản trị</p><h2>Đăng nhập</h2><p class="muted">Sử dụng tài khoản Admin hoặc Staff được cấp.</p><div id="notice" class="${error ? "alert" : ""}">${h(error)}</div><form id="login"><label>Email<input name="email" type="email" autocomplete="username" required maxlength="254"></label><label>Mật khẩu<input name="password" type="password" autocomplete="current-password" required maxlength="128"></label><button>Đăng nhập</button></form><p class="muted">Tài khoản quản trị không được tạo qua đăng ký công khai.</p></main></div>`;
  const recovery=document.createElement('button');recovery.type='button';recovery.className='secondary';recovery.textContent='Quên mật khẩu?';root.querySelector('.login-main').appendChild(recovery);recovery.onclick=()=>showRecovery({view:root,api,onBack:()=>login()});
  document.querySelector("#login").onsubmit = async event => {
    event.preventDefault(); const form = event.currentTarget; const button = form.querySelector("button"); button.disabled = true;
    try {
      const result = await api("/auth/login", { method: "POST", data: { email: form.elements.email.value, password: form.elements.password.value } });
      if (!["Admin", "Staff"].includes(result.user.role)) throw new Error("Tài khoản này không có quyền quản trị.");
      session.set(result.token); user = result.user; await render();
    } catch (error) { form.elements.password.value = ""; showNotice(error.message || "Không thể đăng nhập."); }
    finally { button.disabled = false; }
  };
}
function layout(current) {
  root.innerHTML = `<div class="layout"><aside class="sidebar"><div><div class="brand">Clean<span>Mate</span></div><small>Không gian quản trị</small></div><nav aria-label="Quản trị">${nav.filter(([key]) => key !== "staff" || user.role === "Admin").map(([key, label]) => `<a href="#/${key}" ${key === "notifications" ? 'aria-label="Thông báo"' : ""} ${key === current ? 'class="active" aria-current="page"' : ""}>${label}${key === "notifications" ? `<span data-unread-badge class="notification-count" aria-hidden="true" ${unreadCount?"":"hidden"}>${unreadCount>99?"99+":unreadCount}</span>` : ""}</a>`).join("")}</nav><div class="account"><strong>${`<span data-ui-raw>${h(user.fullName)}</span>`}</strong><p>${`<span data-ui-raw>${h(user.email)}</span>`}</p><button id="logout">Đăng xuất</button></div></aside><div class="workspace"><header class="topbar"><h1>${h(nav.find(([key]) => key === current)?.[1] || "Quản trị")}</h1><span class="role">${h(user.role === "Admin" ? "Quản trị viên" : "Nhân viên vận hành")}</span></header><main class="content"><div id="notice"></div><section id="view" aria-live="polite"><p class="loading">Đang tải dữ liệu...</p></section></main></div></div>`;
  document.querySelector("#logout").onclick = () => { session.clear(); user = null; login(); };
}
function table(headers, body) { return `<div class="table-wrap"><table><thead><tr>${headers.map(text => `<th>${text}</th>`).join("")}</tr></thead><tbody>${body || `<tr><td colspan="${headers.length}" class="empty">Không có dữ liệu phù hợp.</td></tr>`}</tbody></table></div>`; }
function filters(current) {
  const values = current === "applications" ? ["Pending", "NeedsInfo", "Rejected", "Approved", "All"] : ["All", "Pending", "Accepted", "InProgress", "Completed", "Cancelled"];
  return `<form id="filters" class="filters"><label>Tìm kiếm<input name="search" placeholder="${current === "applications" ? "Tên, email hoặc thành phố" : "Mã đơn, khách hàng hoặc số điện thoại"}" maxlength="100" value="${h(state[current].search)}"></label><label>Trạng thái<select name="status">${values.map(value => `<option value="${value}" ${state[current].status === value ? "selected" : ""}>${value === "All" ? "Tất cả" : h(current === "orders" && value === "Pending" ? "Chờ nhận" : names[value])}</option>`).join("")}</select></label><button>Lọc kết quả</button></form>`;
}
function bindFilters(current, data) {
  document.querySelector("#filters").onsubmit = event => { event.preventDefault(); const form = event.currentTarget; state[current] = { page: 1, status: form.elements.status.value, search: form.elements.search.value.trim() }; render(); };
  document.querySelectorAll("[data-page]").forEach(button => button.onclick = () => { state[current].page = Number(button.dataset.page); render(); });
}
function pagination(data) { return `<div class="pagination"><span>${number(data.total)} kết quả · Trang ${data.page}</span><div class="actions"><button class="secondary" data-page="${data.page - 1}" ${data.page <= 1 ? "disabled" : ""}>Trang trước</button><button class="secondary" data-page="${data.page + 1}" ${data.page * data.pageSize >= data.total ? "disabled" : ""}>Trang sau</button></div></div>`; }
function modal(title, content) {
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-label", title);
  dialog.innerHTML = `<div class="section-head"><h3>${h(title)}</h3><button class="secondary" data-close>Đóng</button></div>${content}`;
  document.body.appendChild(dialog); dialog.querySelector("[data-close]").onclick = () => dialog.close();
  dialog.onclose = () => dialog.remove(); dialog.showModal(); return dialog;
}
async function submitDialog(dialog, action) {
  const buttons = [...dialog.querySelectorAll("button")]; buttons.forEach(button => button.disabled = true);
  const prevent = event => event.preventDefault(); dialog.addEventListener("cancel", prevent);
  const errorBox = dialog.querySelector("[data-error]"); if (errorBox) errorBox.textContent = "";
  try { await action(); dialog.close(); await render(); showNotice("Đã lưu thay đổi.", true); }
  catch (error) { if (error.status === 401) { dialog.close(); fail(error); } else if (errorBox) errorBox.textContent = error.message || "Không thể lưu. Vui lòng thử lại."; }
  finally { buttons.forEach(button => button.disabled = false); dialog.removeEventListener("cancel", prevent); }
}
function review(item) {
  const dialog = modal(`Hồ sơ · ${item.name}`, `<p class="muted">${`<span data-ui-raw>${h(item.email)}</span>`} · ${`<span data-ui-raw>${h(item.phone || "Chưa có số điện thoại")}</span>`}</p><p><strong>Khu vực:</strong> ${`<span data-ui-raw>${h(item.city)}</span>`}</p><p><strong>Địa chỉ:</strong> ${`<span data-ui-raw>${h(item.addressText || "—")}</span>`}</p><p><strong>Giới thiệu:</strong> ${`<span data-ui-raw>${h(item.bio || "—")}</span>`}</p><p>${badge(item.reviewStatus)}</p>${item.reviewReason ? `<p><strong>Lý do:</strong> ${`<span data-ui-raw>${h(item.reviewReason)}</span>`}</p>` : ""}${item.reviewStatus === "Pending" ? `<form class="form-grid"><label>Kết quả<select name="status" aria-label="Kết quả"><option value="Approved">Duyệt hồ sơ</option><option value="NeedsInfo">Yêu cầu bổ sung</option><option value="Rejected">Từ chối</option></select></label><label>Lý do / Ghi chú<textarea name="reason" maxlength="1000" rows="4" placeholder="Bắt buộc khi yêu cầu bổ sung hoặc từ chối"></textarea></label><p data-error role="alert" class="alert"></p><button>Lưu kết quả duyệt</button></form>` : `<p class="muted">Duyệt lúc: ${h(date(item.reviewedAt))}. Hồ sơ đã xử lý không thể duyệt lại trực tiếp.</p>`}`);
  const form = dialog.querySelector("form");
  if (form) form.onsubmit = event => {
    event.preventDefault(); const status = form.elements.status.value, reason = form.elements.reason.value.trim();
    if (status !== "Approved" && !reason) { dialog.querySelector("[data-error]").textContent = "Vui lòng nhập lý do."; return; }
    submitDialog(dialog, () => api(`/management/applications/${item.id}/review`, { method: "PUT", data: { status, reason } }));
  };
}
function editService(item) {
  const dialog = modal(`Cấu hình · ${item.name}`, `<p class="muted">Giá mới chỉ áp dụng cho đơn tạo sau thay đổi. Đơn đã đặt giữ nguyên giá.</p><form class="form-grid"><label>Tên dịch vụ<input name="name" maxlength="200" required value="${h(item.name)}"></label><label>Giá mỗi giờ (VNĐ)<input name="hourlyRate" type="number" min="1000" max="10000000" step="1" required value="${item.hourlyRate}"></label><div class="form-row"><label>Số giờ tối thiểu<input name="minHours" type="number" min="1" max="8" required value="${item.minHours}"></label><label>Số giờ tối đa<input name="maxHours" type="number" min="1" max="8" required value="${item.maxHours}"></label></div><label class="check"><input name="isActive" type="checkbox" ${item.isActive ? "checked" : ""}>Cho phép đặt dịch vụ</label><p data-error role="alert" class="alert"></p><button>Lưu cấu hình</button></form>`);
  dialog.querySelector("form").onsubmit = event => {
    event.preventDefault(); const form = event.currentTarget;
    submitDialog(dialog, () => api(`/management/services/${encodeURIComponent(item.key)}`, { method: "PUT", data: {
      name: form.elements.name.value, hourlyRate: Number(form.elements.hourlyRate.value), minHours: Number(form.elements.minHours.value), maxHours: Number(form.elements.maxHours.value), isActive: form.elements.isActive.checked, version: item.version
    } }));
  };
}
function createStaff() {
  const dialog = modal("Tạo tài khoản Staff", `<p class="muted">Staff được duyệt hồ sơ và tra cứu đơn. Thay đổi giá và quản lý nhân sự dành cho Admin.</p><form class="form-grid"><label>Họ tên<input name="fullName" required maxlength="200" autocomplete="name"></label><label>Email<input name="email" type="email" required autocomplete="off"></label><label>Mật khẩu ban đầu<input name="password" type="password" required minlength="12" maxlength="72" autocomplete="new-password"></label><p data-error role="alert" class="alert"></p><button>Tạo Staff</button></form>`);
  dialog.querySelector("form").onsubmit = event => { event.preventDefault(); const form = event.currentTarget; submitDialog(dialog, () => api("/management/staff", { method: "POST", data: { fullName: form.elements.fullName.value, email: form.elements.email.value, password: form.elements.password.value } })); };
}
async function render() {
  if (!user) return login();
  const current = nav.some(([key]) => key === route()) ? route() : "dashboard";
  const ticket = ++generation; layout(current);
  const view = document.querySelector("#view");
  unreadPoller.refresh();
  try {
    if(current==='notifications')return showNotifications({view,api,h,isCurrent:()=>ticket===generation&&Boolean(user),fail,onCount:count=>unreadPoller.accept(count),onOpen:action=>{
      if(!action)return;if(action.filters)state[action.route]={...action.filters};location.hash=`#/${action.route}`;
    }});
    if(current==='security')return showPassword({view,api,fail,onChanged:(notice='Đã đổi mật khẩu. Vui lòng đăng nhập lại.')=>{session.clear();user=null;login(notice);}});
    if (current === "staff" && user.role !== "Admin") throw new Error("Chỉ Admin được quản lý nhân sự.");
    const query = state[current] ? `?${new URLSearchParams(state[current])}` : "";
    const data = await api(`/management/${current}${query}`);
    if (ticket !== generation || !user) return;
    if (current === "dashboard") {
      const cards = [["Đơn hôm nay", number(data.todayOrders)], ["Đơn chờ nhận", number(data.pendingOrders)], ["Hồ sơ chờ duyệt", number(data.pendingApplications)], ["Cleaner đã duyệt", number(data.approvedCleaners)]];
      view.innerHTML = `<div class="intro"><p class="eyebrow">Tổng quan vận hành</p><h2>Mọi hoạt động trong tầm nhìn.</h2><p class="muted">Số liệu thực từ hệ thống CleanMate · Hôm nay theo UTC+7.</p></div><div class="cards">${cards.map(([label, value], index) => `<section class="card ${index === 2 ? "featured" : ""}"><small>${label}</small><strong>${value}</strong></section>`).join("")}</div><div class="grid-two"><section class="panel"><h3>Trạng thái đơn hàng</h3>${data.byStatus.map(item => `<div class="stat-line"><span>${item.status === "Pending" ? "Chờ nhận" : h(names[item.status] || item.status)}</span><strong>${number(item.count)}</strong></div>`).join("") || '<p class="muted">Chưa có đơn hàng.</p>'}<p class="muted">Tổng cộng ${number(data.totalOrders)} đơn · ${number(data.customers)} tài khoản khách hàng.</p></section><section class="panel"><h3>Giá trị dịch vụ hoàn thành</h3><h2>${money(data.completedServiceValue)}</h2><p class="muted value-note">Khách trả tiền mặt trực tiếp cho cleaner. Đây là tổng giá trị các ca đã hoàn thành; CleanMate không thu hoặc giữ khoản tiền này.</p><p class="muted">${number(data.completedOrders)} ca hoàn thành</p><a href="#/orders">Xem danh sách đơn →</a></section></div>`;
    } else if (current === "support") {
      renderSupport({view,data,filters:state.support,api,h,fail,onFilter:values=>{state.support=values;render();},onUpdated:async(message='Đã cập nhật yêu cầu và thông báo cho người gửi.')=>{await render();showNotice(message,true);}});
    } else if (current === "applications") {
      rows = data.items;
      view.innerHTML = `<p class="eyebrow">Đội ngũ cleaner</p><h2>Duyệt hồ sơ đăng ký</h2><p class="muted">Chỉ hồ sơ được duyệt mới có quyền nhận việc. Mọi kết quả duyệt được lưu và gửi thông báo cho người đăng ký.</p>${filters(current)}<section class="panel">${table(["Ứng viên", "Khu vực", "Ngày gửi", "Trạng thái", "Thao tác"], rows.map(item => `<tr><td><strong>${`<span data-ui-raw>${h(item.name)}</span>`}</strong><small>${`<span data-ui-raw>${h(item.email)}</span>`}</small></td><td>${`<span data-ui-raw>${h(item.city)}</span>`}</td><td>${h(date(item.submittedAt))}</td><td>${badge(item.reviewStatus)}</td><td><button data-review="${item.id}" class="secondary">${item.reviewStatus === "Pending" ? "Xem & duyệt" : "Xem hồ sơ"}</button></td></tr>`).join(""))}${pagination(data)}</section>`;
      bindFilters(current, data); view.querySelectorAll("[data-review]").forEach(button => button.onclick = () => review(rows.find(item => item.id === Number(button.dataset.review))));
    } else if (current === "orders") {
      view.innerHTML = `<p class="eyebrow">Tra cứu vận hành</p><h2>Đơn hàng & ca làm</h2><p class="muted">Theo dõi trạng thái, lịch và thông tin liên hệ. Thanh toán tiền mặt được ghi nhận theo xác nhận của cleaner.</p>${filters(current)}<section class="panel">${table(["Mã đơn / Lịch", "Khách & liên hệ", "Cleaner", "Trạng thái", "Giá trị"], data.items.map(item => `<tr><td><strong>CM${item.id}</strong><small>${h(date(item.startTime))} · ${item.durationHours} giờ</small></td><td>${`<span data-ui-raw>${h(item.contactName || item.customerName)}</span>`}<small>${h(item.contactPhone || "Chưa có số liên hệ")}</small><small>${`<span data-ui-raw>${h(item.address)}</span>`}</small></td><td>${`<span data-ui-raw>${h(item.cleanerName || "Chưa có người nhận")}</span>`}</td><td>${badge(item.status, "order")}<small>${item.paymentStatus === "Paid" ? "Cleaner ghi nhận nhận tiền" : "Chưa có xác nhận nhận tiền"}</small></td><td>${money(item.price)}</td></tr>`).join(""))}${pagination(data)}</section>`;
      bindFilters(current, data);
    } else if (current === "services") {
      rows = data;
      view.innerHTML = `<p class="eyebrow">Danh mục dịch vụ</p><h2>Dịch vụ & cấu hình giá</h2><p class="muted">${user.role === "Admin" ? "Quản lý giá áp dụng cho đơn mới. Lịch sử đơn hàng giữ nguyên giá đã đặt." : "Bạn có quyền xem cấu hình. Chỉ Admin được thay đổi giá."}</p><section class="panel">${table(["Dịch vụ", "Giá / giờ", "Thời lượng", "Trạng thái", "Thao tác"], rows.map((item, index) => `<tr><td><strong>${`<span data-ui-raw>${h(item.name)}</span>`}</strong><small>${h(item.key)} · Phiên bản ${item.version}</small></td><td>${money(item.hourlyRate)}</td><td>${item.minHours}–${item.maxHours} giờ</td><td>${activeBadge(item.isActive)}</td><td>${user.role === "Admin" ? `<button data-service="${index}" class="secondary">Sửa cấu hình</button>` : "Chỉ xem"}</td></tr>`).join(""))}</section>`;
      view.querySelectorAll("[data-service]").forEach(button => button.onclick = () => editService(rows[Number(button.dataset.service)]));
    } else if (current === "staff") {
      rows = data;
      view.innerHTML = `<div class="section-head"><div><p class="eyebrow">Phân quyền vận hành</p><h2>Nhân sự Staff</h2></div><button id="create-staff">Tạo Staff</button></div><p class="muted">Khóa hoặc mở quyền truy cập sẽ thu hồi các phiên cũ. Staff cần đăng nhập lại sau khi được mở khóa.</p><section class="panel">${table(["Nhân viên", "Email", "Trạng thái", "Thao tác"], rows.map(item => `<tr><td>${`<span data-ui-raw>${h(item.fullName)}</span>`}</td><td>${`<span data-ui-raw>${h(item.email)}</span>`}</td><td>${activeBadge(item.isActive)}</td><td><button data-access="${item.id}" class="${item.isActive ? "danger" : "secondary"}">${item.isActive ? "Khóa truy cập" : "Mở truy cập"}</button></td></tr>`).join(""))}</section>`;
      document.querySelector("#create-staff").onclick = createStaff;
      view.querySelectorAll("[data-access]").forEach(button => button.onclick = async () => {
        const item = rows.find(row => row.id === Number(button.dataset.access));
        if (!confirm(`${t(item.isActive ? 'Khóa truy cập' : 'Mở truy cập')}: ${item.fullName}?`)) return;
        button.disabled = true;
        try { await api(`/management/staff/${item.id}/access`, { method: "PUT", data: { isActive: !item.isActive, expectedActive: item.isActive } }); await render(); showNotice("Đã cập nhật quyền truy cập.", true); } catch (error) { fail(error); button.disabled = false; }
      });
    } else if (current === "audit") {
      view.innerHTML = `<p class="eyebrow">Lịch sử quản trị</p><h2>Nhật ký thao tác</h2><p class="muted">${user.role === "Admin" ? "Theo dõi thao tác của đội ngũ quản trị." : "Các thao tác do tài khoản của bạn thực hiện."} Hiển thị tối đa 50 mục mỗi trang.</p><section class="panel">${table(["Thời gian", "Người thao tác", "Hành động", "Đối tượng", "Chi tiết"], data.map(item => `<tr><td>${h(date(item.createdAt))}</td><td>${h(item.actorName)}</td><td>${h(item.action)}</td><td>${h(item.target)}</td><td><details><summary>Xem</summary><pre>${h(item.details)}</pre></details></td></tr>`).join(""))}${data.length === 50 ? `<button class="secondary" id="older-audit">Xem cũ hơn</button>` : ""}</section>`;
      const older = document.querySelector("#older-audit");
      if (older) older.onclick = async () => { older.disabled = true; try { const more = await api(`/management/audit?beforeId=${data.at(-1).id}`); if (!more.length) older.textContent = "Đã hết lịch sử"; else { const target = view.querySelector("tbody"); target.insertAdjacentHTML("beforeend", more.map(item => `<tr><td>${h(date(item.createdAt))}</td><td>${h(item.actorName)}</td><td>${h(item.action)}</td><td>${h(item.target)}</td><td><details><summary>Xem</summary><pre>${h(item.details)}</pre></details></td></tr>`).join("")); data.push(...more); older.disabled = more.length < 50; } } catch (error) { fail(error); older.disabled = false; } };
    }
  } catch (error) { if (ticket === generation) { view.innerHTML = '<p class="empty">Không tải được dữ liệu. Bạn có thể thử lại.</p><button id="retry">Thử lại</button>'; document.querySelector("#retry").onclick = render; fail(error); } }
}
window.addEventListener("hashchange", () => { if (user) render(); });
window.addEventListener('focus',()=>unreadPoller.refresh());
document.addEventListener('visibilitychange',()=>unreadPoller.refresh());
setInterval(()=>unreadPoller.refresh(),30000);
try {
  if (!session.get()) login();
  else { user = await api("/me"); if (!["Admin", "Staff"].includes(user.role)) throw new Error("Tài khoản không có quyền quản trị."); await render(); }
} catch (error) { session.clear(); user = null; login(error.message); }
