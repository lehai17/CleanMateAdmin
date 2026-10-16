const statuses={All:'Tất cả',Open:'Đã tiếp nhận',InProgress:'Đang xử lý',Resolved:'Đã giải quyết'};
const categories={Scheduling:'Lịch làm / không đến',Quality:'Chất lượng',CashPayment:'Tiền mặt trực tiếp',Other:'Vấn đề khác'};
export function renderSupport({view,data,filters,api,h,onFilter,onUpdated,fail}) {
  view.innerHTML=`<h2>Hỗ trợ đơn hàng</h2><p class="muted">Tiếp nhận sự cố của khách và cleaner. Phản hồi không tự thay đổi đơn, xác nhận tiền hay hoàn tiền.</p>
    <form id="support-filter" class="filters"><label>Tìm yêu cầu<input name="search" maxlength="100" placeholder="HT, CM, tên hoặc email" value="${h(filters.search)}"></label><label>Trạng thái hỗ trợ<select name="status" aria-label="Trạng thái hỗ trợ">${Object.entries(statuses).map(([key,label])=>`<option value="${key}" ${filters.status===key?'selected':''}>${label}</option>`).join('')}</select></label><button>Lọc hỗ trợ</button></form>
    <section class="panel">${data.items.map(item=>`<article data-support-id="${item.id}" class="support-card"><h3>HT${item.id} · CM${item.bookingId}</h3><p>${h(item.reporterName)} · ${h(item.reporterEmail)}</p><p>${categories[item.category] || h(item.category)} · <strong>${statuses[item.status]}</strong></p><p>${h(item.description)}</p>${item.response?`<p>Phản hồi: ${h(item.response)}</p>`:''}<button data-respond="${item.id}">Xử lý yêu cầu</button></article>`).join('') || '<p>Không có yêu cầu phù hợp.</p>'}<div class="pagination"><p>Trang ${data.page} · ${data.total} yêu cầu</p><div><button id="support-prev" ${data.page===1?'disabled':''}>Trang trước</button> <button id="support-next" ${data.page*20>=data.total?'disabled':''}>Trang sau</button></div></div></section>`;
  document.querySelector('#support-filter').onsubmit=event=>{event.preventDefault();onFilter({...Object.fromEntries(new FormData(event.currentTarget)),page:1});};
  document.querySelector('#support-prev').onclick=()=>onFilter({...filters,page:data.page-1});
  document.querySelector('#support-next').onclick=()=>onFilter({...filters,page:data.page+1});
  view.querySelectorAll('[data-respond]').forEach(button=>button.onclick=()=>{
    const item=data.items.find(row=>row.id===Number(button.dataset.respond));
    const dialog=document.createElement('dialog');dialog.setAttribute('aria-label',`Xử lý HT${item.id}`);
    dialog.innerHTML=`<h3>HT${item.id} · CM${item.bookingId}</h3><p>${h(item.description)}</p><form class="form-grid"><label>Trạng thái mới<select name="status" aria-label="Trạng thái mới">${Object.entries(statuses).filter(([key])=>key!=='All').map(([key,label])=>`<option value="${key}" ${item.status===key?'selected':''}>${label}</option>`).join('')}</select></label><label>Phản hồi<textarea name="response" aria-label="Phản hồi" maxlength="2000" rows="5">${h(item.response)}</textarea></label><p role="alert" id="response-error"></p><button>Lưu xử lý</button><button type="button" id="close-support" class="secondary">Đóng</button></form>`;
    document.body.appendChild(dialog);dialog.onclose=()=>dialog.remove();dialog.showModal();dialog.querySelector('#close-support').onclick=()=>dialog.close();
    dialog.querySelector('form').onsubmit=async event=>{
      event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget));
      if(values.status==='Resolved'&&values.response.trim().length<10){dialog.querySelector('#response-error').textContent='Phản hồi giải quyết cần ít nhất 10 ký tự.';return;}
      const prevent=e=>e.preventDefault();dialog.addEventListener('cancel',prevent);dialog.querySelectorAll('button').forEach(b=>b.disabled=true);
      try{await api(`/management/support/${item.id}`,{method:'PUT',data:{...values,version:item.version}});dialog.close();await onUpdated();}
      catch(e){if(e.status===401){dialog.close();fail(e);}else dialog.querySelector('#response-error').textContent=e.message;}
      finally{dialog.removeEventListener('cancel',prevent);dialog.querySelectorAll('button').forEach(b=>b.disabled=false);}
    };
  });
}
