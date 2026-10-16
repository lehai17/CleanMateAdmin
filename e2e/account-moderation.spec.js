import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
const API='http://127.0.0.1:15238',password='CleanMate-admin-test-123!';
async function manager(request){const r=await request.post(`${API}/api/auth/login`,{data:{email:'admin@system.test',password}});expect(r.status()).toBe(200);return {Authorization:`Bearer ${(await r.json()).token}`};}
async function account(request,role='Customer'){
  const email=`moderation-${randomUUID()}@example.test`,r=await request.post(`${API}/api/auth/register`,{data:{fullName:'Đăng nhập',email,password,role,phoneNumber:'0901234567'}});expect(r.status()).toBe(200);const result=await r.json();
  if(role==='Cleaner')expect((await request.put(`${API}/api/management/applications/${result.user.cleanerProfile.id}/review`,{headers:await manager(request),data:{status:'Approved'}})).status()).toBe(200);
  return {...result,email};
}
async function open(page,email='admin@system.test'){
  await page.goto('/');await page.getByLabel('Language / Ngôn ngữ').selectOption('en');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('button',{name:'Sign out',exact:true})).toBeVisible();
}
async function find(page,account){await page.getByRole('link',{name:'Account',exact:true}).click();await page.getByLabel('Find accounts',{exact:true}).fill(account.email);await page.getByRole('button',{name:'Filter accounts',exact:true}).click();return page.locator(`[data-account-id="${account.user.id}"]`);}
for(const role of ['Customer','Cleaner'])test(`admin moderates ${role} with a reason, preserves jobs and requires a new session after unlock`,async({page,request})=>{
  const target=await account(request,role),customer=role==='Customer'?target:await account(request);const job=await request.post(`${API}/api/bookings`,{headers:{Authorization:`Bearer ${customer.token}`},data:{serviceKey:'cleaning',startTime:new Date(Date.now()+2*86400000).toISOString(),durationHours:2,address:'Test address',paymentMethod:'cash'}});expect(job.status()).toBe(200);const booking=await job.json();
  if(role==='Cleaner')expect((await request.put(`${API}/api/cleaner/jobs/${booking.id}/accept`,{headers:{Authorization:`Bearer ${target.token}`}})).status()).toBe(200);
  await open(page);const row=await find(page,target);await expect(row.getByText('Đăng nhập',{exact:true})).toBeVisible();
  await row.getByRole('button',{name:'Lock access',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog).toContainText('unfinished orders');await dialog.getByRole('checkbox').check();await dialog.getByLabel('Reason for access change',{exact:true}).fill('          ');await dialog.getByRole('button',{name:'Confirm',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('10 to 1000');
  await dialog.getByLabel('Reason for access change',{exact:true}).fill('Account temporarily locked after review.');await dialog.getByRole('button',{name:'Confirm',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(row.getByRole('button',{name:'Unlock access',exact:true})).toBeVisible();
  expect((await request.get(`${API}/api/me`,{headers:{Authorization:`Bearer ${target.token}`}})).status()).toBe(401);
  await row.getByRole('button',{name:'Unlock access',exact:true}).click();await dialog.getByLabel('Reason for access change',{exact:true}).fill('Account access restored after follow-up.');await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Confirm',exact:true}).click();await expect(dialog).toHaveCount(0);
  expect((await request.get(`${API}/api/me`,{headers:{Authorization:`Bearer ${target.token}`}})).status()).toBe(401);expect((await request.post(`${API}/api/auth/login`,{data:{email:target.email,password}})).status()).toBe(200);
  const orders=await request.get(`${API}/api/management/orders?search=CM${booking.id}`,{headers:await manager(request)});const saved=(await orders.json()).items.find(item=>item.id===booking.id);expect(saved.status).toBe(role==='Customer'?'Pending':'Accepted');expect(saved.price).toBe(booking.price);expect(saved.paymentStatus).toBe('Unpaid');
});
test('staff cannot discover account data or change access, including direct routes',async({page,request})=>{
  const email=`moderation-staff-${randomUUID()}@example.test`;expect((await request.post(`${API}/api/management/staff`,{headers:await manager(request),data:{email,password,fullName:'Moderation Staff'}})).status()).toBe(200);await open(page,email);await expect(page.getByRole('link',{name:'Account',exact:true})).toHaveCount(0);await page.goto('/#/accounts');await expect(page.locator('#notice')).toContainText('Only admins');await expect(page.locator('[data-account-id]')).toHaveCount(0);
});
test('stale moderation refreshes the account state without overwriting another admin',async({page,request})=>{
  const target=await account(request);await open(page);const row=await find(page,target);await row.getByRole('button',{name:'Lock access',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByLabel('Reason for access change',{exact:true}).fill('Reason from an older admin form.');await dialog.getByRole('checkbox').check();
  expect((await request.put(`${API}/api/management/accounts/${target.user.id}/access`,{headers:await manager(request),data:{isActive:false,expectedActive:true,reason:'Another admin locked this account first.'}})).status()).toBe(200);await dialog.getByRole('button',{name:'Confirm',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(page.locator('#notice')).toContainText('The account changed');await expect(row.getByRole('button',{name:'Unlock access',exact:true})).toBeVisible();
});
