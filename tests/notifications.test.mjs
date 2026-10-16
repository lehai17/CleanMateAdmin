import test from 'node:test';
import assert from 'node:assert/strict';
import {notificationAction,createUnreadPoller} from '../src/notifications.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};

test('notification actions select exact resources without accepting external routes',()=>{
  assert.deepEqual(notificationAction({target:'Applications',targetId:12}),{route:'applications',label:'Xem hồ sơ',filters:{page:1,status:'All',search:'HS12'}});
  assert.equal(notificationAction({target:'Support',targetId:45}).filters.search,'HT45');
  assert.equal(notificationAction({target:'Applications',targetId:'javascript:alert(1)'}).filters.search,'');
  assert.equal(notificationAction({target:'https://evil.test',targetId:1}),null);
  assert.equal(notificationAction({target:'Profile'}).route,'security');
});

test('polling pauses while hidden or logged out and old account responses cannot replace the badge',async()=>{
  let token='A',visible=false,calls=0;const counts=[],expired=[],first=deferred(),second=deferred();
  const poller=createUnreadPoller({api:()=>{calls++;return calls===1?first.promise:second.promise;},getToken:()=>token,isVisible:()=>visible,onCount:count=>counts.push(count),onExpired:error=>expired.push(error)});
  await poller.refresh();assert.equal(calls,0);visible=true;token=null;await poller.refresh();assert.equal(calls,0);
  token='A';const old=poller.refresh();token='B';const current=poller.refresh();second.resolve({unreadCount:2});await current;first.resolve({unreadCount:99});await old;assert.deepEqual(counts,[2]);assert.equal(expired.length,0);
});

test('reading notifications invalidates an older pending count and stale 401 cannot log out another user',async()=>{
  let token='A',expired=0;const counts=[],pending=deferred();
  const poller=createUnreadPoller({api:()=>pending.promise,getToken:()=>token,isVisible:()=>true,onCount:count=>counts.push(count),onExpired:()=>expired++});
  const request=poller.refresh();poller.accept(0);pending.resolve({unreadCount:5});await request;assert.deepEqual(counts,[0]);
  const failure=deferred(),other=createUnreadPoller({api:()=>failure.promise,getToken:()=>token,isVisible:()=>true,onCount:()=>{},onExpired:()=>expired++});const old=other.refresh();token='B';failure.reject({status:401});await old;assert.equal(expired,0);
});
