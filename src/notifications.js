export function notificationAction(item) {
  const validId=value=>Number.isSafeInteger(value)&&value>0;
  if(item.target==='Applications')return {route:'applications',label:'Xem hồ sơ',filters:{page:1,status:'All',search:validId(item.targetId)?`HS${item.targetId}`:''}};
  if(item.target==='Support')return {route:'support',label:'Xem hỗ trợ',filters:{page:1,status:'All',search:validId(item.targetId)?`HT${item.targetId}`:''}};
  if(item.target==='Profile')return {route:'security',label:'Xem bảo mật'};
  if(['Orders','CleanerJobs'].includes(item.target))return {route:'orders',label:'Xem đơn hàng',filters:{page:1,status:'All',search:validId(item.bookingId)?`CM${item.bookingId}`:''}};
  return null;
}

export function createUnreadPoller({api,getToken,isVisible,onCount,onExpired}) {
  let sequence=0;
  return {
    accept(count){sequence++;onCount(Math.max(0,Number(count)||0));},
    async refresh(){
      const token=getToken();if(!token||!isVisible())return;const ticket=++sequence;
      const current=()=>ticket===sequence&&getToken()===token&&isVisible();
      try{const result=await api('/notifications/unread-count');if(current())onCount(Math.max(0,Number(result.unreadCount)||0));}
      catch(error){if(current()&&error.status===401)onExpired(error);}
    }
  };
}

export async function showNotifications({view,api,h,isCurrent,onCount,onOpen,fail}) {
  let items=[],cursor=null,throughId=null,unread=0,busy=false;
  const render=()=>{
    view.innerHTML=`<h2>Thông báo vận hành</h2><p>Hồ sơ cleaner và yêu cầu hỗ trợ cần xử lý. Mở một thông báo không tự đánh dấu đã đọc.</p><p role="status" data-inbox-count>${unread} thông báo chưa đọc.</p><div class="actions"><button data-refresh-notifications>Tải lại thông báo</button><button data-read-notifications ${!throughId||!unread?'disabled':''}>Đánh dấu tất cả đã đọc</button></div><p role="alert" data-notifications-error></p><section class="panel">${items.map(item=>{
      const action=notificationAction(item);return `<article data-notification-id="${item.id}" class="notification-card ${item.readAt?'':'unread'}"><h3>${h(item.title)}</h3><p>${`<span data-ui-raw>${h(item.message)}</span>`}</p><p class="muted">${h(new Date(item.createdAt).toLocaleString('vi-VN'))} · ${item.readAt?'Đã đọc':'Chưa đọc'}</p><div class="actions">${action?`<button class="secondary" data-open-notification="${item.id}">${h(action.label)}</button>`:''}${!item.readAt?`<button data-read-notification="${item.id}">Đánh dấu đã đọc</button>`:''}</div></article>`;
    }).join('')||'<p>Chưa có thông báo.</p>'}</section>${cursor?'<button data-older-notifications>Thông báo cũ hơn</button>':''}`;
    view.querySelector('[data-refresh-notifications]').onclick=()=>run(()=>load(false));
    view.querySelector('[data-read-notifications]').onclick=()=>run(async()=>{
      const result=await api('/notifications/read-all',{method:'PUT',data:{throughId}});if(!isCurrent())return;
      items=items.map(item=>item.id<=throughId&&!item.readAt?{...item,readAt:result.readAt}:item);unread=result.unreadCount;onCount(unread);render();
    });
    view.querySelector('[data-older-notifications]')?.addEventListener('click',()=>run(()=>load(true)));
    view.querySelectorAll('[data-open-notification]').forEach(button=>button.onclick=()=>{if(!busy)onOpen(notificationAction(items.find(item=>item.id===Number(button.dataset.openNotification))));});
    view.querySelectorAll('[data-read-notification]').forEach(button=>button.onclick=()=>run(async()=>{
      const id=Number(button.dataset.readNotification),result=await api(`/notifications/${id}/read`,{method:'PUT'});if(!isCurrent())return;
      items=items.map(item=>item.id===id?{...item,readAt:result.readAt}:item);unread=result.unreadCount;onCount(unread);render();
    }));
  };
  const load=async(older)=>{
    const result=await api(`/notifications${older?`?beforeId=${cursor}`:''}`);if(!isCurrent())return;
    items=older?[...items,...result.items.filter(item=>!items.some(old=>old.id===item.id))]:result.items;
    if(!older)throughId=items[0]?.id??null;cursor=result.nextBeforeId;unread=result.unreadCount;onCount(unread);render();
  };
  const run=async action=>{
    if(busy)return;busy=true;view.querySelectorAll('button').forEach(button=>button.disabled=true);
    try{await action();}
    catch(error){if(!isCurrent())return;if(error.status===401)fail(error);else view.querySelector('[data-notifications-error]').textContent=error.message||'Không tải được thông báo. Vui lòng thử lại.';}
    finally{busy=false;if(isCurrent()){view.querySelectorAll('button').forEach(button=>button.disabled=false);view.querySelector('[data-read-notifications]').disabled=!throughId||!unread;}}
  };
  render();await run(()=>load(false));
}
