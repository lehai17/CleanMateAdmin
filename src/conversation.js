export function conversation({container,ticketId,api,h,management=false,onUpdated=async()=>{},isCurrent=()=>container.isConnected,fail=()=>{}}) {
  let busy=false,cursor=null,retry=null,items=[];
  const path=`${management?'/management':''}/support/${ticketId}/messages`;
  container.innerHTML='<button type="button" data-open-thread>Xem trao đổi</button>';
  container.querySelector('[data-open-thread]').onclick=()=>{
    container.innerHTML='<h4>Lịch sử trao đổi</h4><p>Tin bổ sung của người báo sẽ mở lại yêu cầu đã giải quyết. Nhân viên cần mở lại yêu cầu trước khi trả lời yêu cầu đã đóng.</p><button type="button" data-refresh-thread>Tải lại trao đổi</button> <button type="button" data-older-thread hidden>Tin cũ hơn</button><div data-thread-items></div><p role="status" data-thread-error></p><form data-thread-form class="form-grid"><label>Tin nhắn hỗ trợ<textarea name="body" aria-label="Tin nhắn hỗ trợ" required maxlength="2000" rows="3"></textarea></label><button>Gửi tin nhắn</button></form>';
    const showError=e=>{if(!isCurrent())return;if(e.status===401)fail(e);else container.querySelector('[data-thread-error]').textContent=e.message||'Không thể xử lý trao đổi. Vui lòng thử lại.';};
    const load=async(older=false)=>{
      const data=await api(`${path}${older?`?beforeId=${cursor}`:''}`);if(!isCurrent())return;
      items=older?[...data.items,...items.filter(m=>!data.items.some(n=>n.id===m.id))]:data.items;cursor=data.nextBeforeId;
      container.querySelector('[data-thread-items]').innerHTML=items.map(m=>`<article data-message-id="${m.id}"><strong>${m.fromStaff?'Nhân viên':'Người gửi yêu cầu'}</strong> · <time>${h(new Date(m.createdAt).toLocaleString('vi-VN'))}</time><p class="thread-body">${`<span data-ui-raw>${h(m.body)}</span>`}</p></article>`).join('')||'<p>Chưa có trao đổi bổ sung.</p>';
      container.querySelector('[data-older-thread]').hidden=!cursor;container.querySelector('[data-thread-error]').textContent='';
    };
    for(const [selector,older] of [['[data-refresh-thread]',false],['[data-older-thread]',true]])container.querySelector(selector).onclick=async()=>{if(busy)return;busy=true;try{await load(older);}catch(e){showError(e);}finally{busy=false;}};
    container.querySelector('[data-thread-form]').onsubmit=async event=>{
      event.preventDefault();if(busy)return;busy=true;const form=event.currentTarget,body=form.elements.body.value.trim();
      if(!body){busy=false;return;}if(retry?.body!==body)retry={body,requestId:crypto.randomUUID()};
      container.querySelectorAll('button,textarea').forEach(el=>el.disabled=true);
      try{const result=await api(path,{method:'POST',data:retry});retry=null;if(!isCurrent())return;form.reset();await load();await onUpdated(result);}
      catch(e){showError(e);}finally{busy=false;container.querySelectorAll('button,textarea').forEach(el=>el.disabled=false);}
    };
    busy=true;load().catch(showError).finally(()=>{busy=false;});
  };
}
