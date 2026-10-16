export function showPassword({view,api,onChanged,fail}) {
  let busy=false;
  view.innerHTML=`<section class="panel"><h2>Đổi mật khẩu</h2><p>Dùng mật khẩu mới ít nhất 12 ký tự. Sau khi lưu, tất cả phiên đăng nhập cũ sẽ hết hiệu lực, gồm cả phiên này.</p><form id="password-form" class="form-grid"><label>Mật khẩu hiện tại<input name="currentPassword" aria-label="Mật khẩu hiện tại" type="password" autocomplete="current-password" required maxlength="128"></label><label>Mật khẩu mới<input name="newPassword" aria-label="Mật khẩu mới" type="password" autocomplete="new-password" required minlength="12" maxlength="72"></label><label>Nhập lại mật khẩu mới<input name="confirmation" aria-label="Nhập lại mật khẩu mới" type="password" autocomplete="new-password" required maxlength="72"></label><p id="password-error" role="alert"></p><button>Lưu mật khẩu mới</button></form></section>`;
  view.insertAdjacentHTML('beforeend','<section class="panel"><h3>Quản lý phiên đăng nhập</h3><p>Đăng xuất tất cả thiết bị, gồm cả thiết bị này. Mật khẩu không thay đổi. Bạn có thể dùng chức năng này khi đăng nhập bằng Google.</p><button id="logout-all" class="danger">Đăng xuất tất cả thiết bị</button><p id="logout-all-error" role="status"></p></section>');
  document.querySelector('#logout-all').onclick=async()=>{
    if(busy||!confirm('Đăng xuất tất cả thiết bị, gồm cả thiết bị này?'))return;
    busy=true;view.querySelectorAll('button').forEach(button=>button.disabled=true);
    try{await api('/auth/logout-all',{method:'POST'});onChanged('Đã đăng xuất tất cả thiết bị. Vui lòng đăng nhập lại.');}
    catch(e){if(e.status===401)fail(e);else view.querySelector('#logout-all-error').textContent=e.message || 'Không thể đăng xuất. Vui lòng thử lại.';}
    finally{busy=false;view.querySelectorAll('button').forEach(button=>button.disabled=false);}
  };
  document.querySelector('#password-form').onsubmit=async event=>{
    event.preventDefault();if(busy)return;
    const form=event.currentTarget,button=form.querySelector('button'),error=form.querySelector('#password-error');
    if(form.elements.newPassword.value!==form.elements.confirmation.value){error.textContent='Hai mật khẩu mới không khớp.';return;}
    busy=true;button.disabled=true;error.textContent='';
    try{await api('/auth/change-password',{method:'POST',data:{currentPassword:form.elements.currentPassword.value,newPassword:form.elements.newPassword.value}});form.reset();onChanged();}
    catch(e){if(e.status===401)fail(e);else error.textContent=e.message || 'Không thể đổi mật khẩu. Vui lòng thử lại.';}
    finally{busy=false;button.disabled=false;}
  };
}
