(function(){
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  async function api(path,options={}){
    const res=await fetch('/api/nyclimo'+path,{credentials:'include',headers:{'Content-Type':'application/json',...(options.headers||{})},...options});
    const data=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.error||'Request failed');
    return data;
  }
  async function load(){
    try{
      const me=await api('/me');
      if(me.user?.role!=='partner_dispatcher'||!me.user?.partner_base_id){location.href='/login?redirect=%2Fpartner';return;}
      $('welcome').textContent='Signed in as '+me.user.name+'. Customer details appear only for rides your base accepted after payment.';
      await Promise.all([loadOffers(),loadBookings()]);
    }catch(e){if(e.message.includes('401'))location.href='/login?redirect=%2Fpartner';else $('error').textContent=e.message;}
  }
  async function loadOffers(){
    const data=await api('/partner/offers');
    $('offers').innerHTML=data.offers.length?data.offers.map(o=>`<article class="card">
      <div class="row"><strong>Offer ${esc(o.booking_number)}</strong><span>Expires ${new Date(o.expires_at).toLocaleString()}</span></div>
      <p>${esc(o.pickup_address)} → ${esc(o.dropoff_address||'Hourly service')}</p>
      <p>${esc(o.pickup_date)} at ${esc(o.pickup_time)} · ${esc(o.passengers)} passengers · ${esc(o.vehicle_id)} · Fare $ ${Number(o.total_price).toFixed(2)}</p>
      <div class="actions"><button data-offer="${o.id}" data-decision="accept">Accept trip</button><button class="secondary" data-offer="${o.id}" data-decision="decline">Decline</button></div>
    </article>`).join(''):'<p class="muted">No active offers.</p>';
    $('offers').querySelectorAll('button[data-offer]').forEach(btn=>btn.addEventListener('click',()=>respond(btn)));
  }
  async function respond(btn){
    btn.disabled=true;
    try{
      await api('/partner/offers/'+btn.dataset.offer+'/respond',{method:'POST',body:JSON.stringify({decision:btn.dataset.decision})});
      await Promise.all([loadOffers(),loadBookings()]);
      $('error').textContent='';
    }catch(e){$('error').textContent=e.message;btn.disabled=false;}
  }
  async function loadBookings(){
    const data=await api('/partner/bookings');
    $('bookings').innerHTML=data.bookings.length?data.bookings.map(b=>`<article class="card">
      <div class="row"><strong>Ride ${esc(b.booking_number)}</strong><span>${esc(b.status.replaceAll('_',' '))}</span></div>
      <p>${esc(b.pickup_address)} → ${esc(b.dropoff_address||'Hourly service')}</p>
      <p>${esc(b.pickup_date)} at ${esc(b.pickup_time)} · ${esc(b.vehicle_id)} · ${esc(b.passengers)} passengers</p>
      <p>Passenger: ${esc(b.passenger_first_name)} ${esc(b.passenger_last_name)} · ${esc(b.passenger_phone)} · ${esc(b.passenger_email)}</p>
      ${b.trip_notes?`<p>Notes: ${esc(b.trip_notes)}</p>`:''}
      <label>Trip status <select data-booking="${b.id}">
        ${['confirmed','dispatched','en_route','at_pickup','in_progress','completed'].map(s=>`<option value="${s}" ${s===b.status?'selected':''}>${s.replaceAll('_',' ')}</option>`).join('')}
      </select></label> <button data-save="${b.id}">Update</button>
    </article>`).join(''):'<p class="muted">No accepted rides are paid and ready for dispatch yet.</p>';
    $('bookings').querySelectorAll('button[data-save]').forEach(btn=>btn.addEventListener('click',()=>saveStatus(btn)));
  }
  async function saveStatus(btn){
    btn.disabled=true;
    const select=$('bookings').querySelector('select[data-booking="'+btn.dataset.save+'"]');
    try{await api('/partner/bookings/'+btn.dataset.save+'/status',{method:'POST',body:JSON.stringify({status:select.value})});await loadBookings();$('error').textContent='';}
    catch(e){$('error').textContent=e.message;btn.disabled=false;}
  }
  $('available').addEventListener('change',async()=>{
    try{const data=await api('/partner/availability',{method:'PATCH',body:JSON.stringify({status:$('available').checked?'available':'unavailable'})});$('available').checked=data.availability_status==='available';}
    catch(e){$('error').textContent=e.message;$('available').checked=false;}
  });
  $('logout').addEventListener('click',async()=>{await api('/logout',{method:'POST'}).catch(()=>{});location.href='/login';});
  load();
  setInterval(()=>Promise.all([loadOffers(),loadBookings()]).catch(()=>{}),30000);
})();
