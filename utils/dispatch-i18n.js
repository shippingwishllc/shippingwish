function fold(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const STRONG_ES = /\b(vacio|recarga|entregado|descargado|cargado|llegue|llegado|esperando|detencion|barato|necesito|pido|quiero ir|hoy no|dia libre|comprobante|en el shipper|en el receiver|siguente carga|siguiente carga)\b/;
const ES_HINT = /\b(vacio|recarga|entregado|descargado|cargado|llegue|llegado|esperando|detencion|barato|necesito|pido|quiero|voy|buscando|otros|hoy no|libre|comprobante|siguiente)\b/g;
const STRONG_EN = /\b(empty in|reload|delivered|unloaded|too cheap|off today|arrived shipper|arrived receiver|need \d)\b/;

function detectLang(text) {
  const f = fold(text);
  if (!f.trim()) return null;
  if (STRONG_ES.test(f)) return 'es';
  const hints = f.match(ES_HINT) || [];
  if (hints.length >= 2) return 'es';
  if (STRONG_EN.test(f)) return 'en';
  return null;
}

function langOf(carrier, inboundText) {
  return detectLang(inboundText) || (carrier && carrier.sms_lang) || 'en';
}

const EN = {
  need_zip: 'Shipping Wish: Send the ZIP or city you are empty in, and where you want to go. Example: 75201 to Atlanta.',
  loads_header: 'Shipping Wish loads near {origin}{dest}:',
  loads_other_header: 'Nothing to {dest} right now. Closest other loads near {origin}:',
  loads_none: 'Shipping Wish: No posted loads fit near {origin}{dest} yet.{why} We will check again when you text a new ZIP, or reply ANY for all directions.',
  loads_footer: 'Reply {choices} to request one, or MORE. Rates are the broker\'s posted rate; ~ means estimated miles.',
  why_too_far: ' Nothing within your empty-mile limit right now.',
  why_min_rpm: ' Some loads were below your minimum rate per mile.',
  why_equipment: ' Loads nearby need different equipment.',
  proactive: 'Shipping Wish: new load near {origin}:\n{line}\nReply 1 to request it, MORE, or OFF TODAY.',
  negotiate_which: 'Shipping Wish: Which load? Reply 1 NEED 2600 (use the posted rate plus the dollar you need).',
  negotiate_none: 'Shipping Wish: No open load is on the table. Text the ZIP you are empty in to get loads first.',
  negotiate_waiting: 'Shipping Wish: We already asked {ask} on {load}. Waiting on the broker.',
  negotiate_one_email: 'Shipping Wish: We already emailed one rate on {load}. A dispatcher will take the next ask.',
  negotiate_staff: 'Shipping Wish: A dispatcher will ask for {ask} on {load}.',
  negotiate_asked_short: 'Shipping Wish: Asking {ask} on {load} (posted {posted}). Do not roll until we text BOOKED.',
  negotiate_asked: 'Shipping Wish: Asking {ask} on {load} (posted {posted}). Do not roll until we text BOOKED with the rate confirmation.',
  negotiate_accepted: 'Shipping Wish: Noted, {rate} on {load}. Do not roll until we text BOOKED with the rate confirmation.',
  book_blocked: 'Shipping Wish: We won\'t request {load}. That broker did not pass our FMCSA authority check. Text your ZIP for other loads.',
  book_blocked_more: 'Shipping Wish: We won\'t request {load}. That broker did not pass our FMCSA authority check.',
  book_expired: 'Shipping Wish: That list expired. Text the ZIP you are empty in to get fresh loads.',
  book_expired_lead: 'That list expired.',
  book_requested: 'Shipping Wish: Requesting {load} ({lane}, {rate}) from the broker now. Do not roll until we text BOOKED with the rate confirmation.',
  book_taken: 'Load {load} was just taken.',
  more_need_zip: 'Shipping Wish: Text the ZIP you are empty in and where you want to go. Example: 75201 to Atlanta.',
  more_none: 'Shipping Wish: No other loads near {origin} right now. Reply ANY for all directions, or text a new ZIP later.',
  off: 'Shipping Wish: Got it, no loads today. We will check in on the next workday morning.',
  reload_need_zip: 'Shipping Wish: Text the ZIP or city you are empty in for the next load. Example: empty Dallas TX.',
  reload_none: 'Shipping Wish: No posted loads fit near {origin} yet.{why} Text a new ZIP later.',
  noted_dest: 'Shipping Wish: Noted{dest}. What ZIP or city are you empty in?',
  help: 'Shipping Wish dispatch: text the ZIP or city you are empty in and where you want to go (example: 75201 to Atlanta). Reply 1-3 to request a load we sent, NEED 2600 to ask the broker for a higher rate we will not invent, MORE for others, RELOAD when empty at delivery, or OFF TODAY. On a booked load reply ARRIVED SHIPPER, LOADED, WAITING, ARRIVED RECEIVER, or DELIVERED, and photo the POD. A dispatcher reads every message.',
  handoff: 'Shipping Wish: A dispatcher will text you shortly.',
  booked: 'Shipping Wish: BOOKED {load}. {lane}, pickup {date}, {rate}. The rate confirmation and pickup details follow.{reload} Reply ARRIVED SHIPPER, LOADED, WAITING, ARRIVED RECEIVER, or DELIVERED. Photo the POD when you unload.',
  reload_hint: ' When empty in {city}, reply RELOAD for {n} next load{s} from there.',
  reload_hint_none: ' When empty in {city}, reply RELOAD and we will look again.',
  released: 'Shipping Wish: {load} is no longer available.',
  released_zip: ' Text your ZIP again for fresh loads.',
  broker_counter: 'Shipping Wish: Broker came back at {rate} on {load} (posted {posted}). Reply YES to take {rate}, or NEED a higher dollar amount.',
  pod_fail: 'Shipping Wish: Could not save that photo. Send the POD picture again.',
  pod_saved_extra: ' POD photo saved.',
  pod_one_fail: ' One photo did not save. Send it again.',
  zip_more: ' Text your ZIP for other loads.',
  zip_more_short: ' Text your ZIP for more.',
  arrived_shipper: 'Shipping Wish: Noted, arrived at shipper on {load}. Reply LOADED when you roll, or WAITING if they hold you.',
  loaded: 'Shipping Wish: Noted, loaded on {load}. Reply ARRIVED RECEIVER when you get there.',
  arrived_receiver: 'Shipping Wish: Noted, arrived at receiver on {load}. Reply WAITING if they hold you, DELIVERED when empty, and photo the POD.',
  waiting: 'Shipping Wish: Noted, waiting on {load}. We are clocking minutes. No dollar amount is billed until a dispatcher sets the rate. Photo the POD when you unload.',
  pod: 'Shipping Wish: POD photo saved for {load}. Reply RELOAD when you want the next load.',
  delivered: 'Shipping Wish: {load} marked delivered. Reply RELOAD for the next load from delivery.',
  transit_saved: 'Shipping Wish: Update saved for {load}.',
  check_call: 'Shipping Wish check-call on {load} ({lane}). Where are you? Reply ARRIVED SHIPPER, LOADED, WAITING, ARRIVED RECEIVER, or DELIVERED. Photo the POD when you unload.',
  morning: 'Shipping Wish: Good morning {name}. Reply with the ZIP you are empty in and where you want to go. Example: 75201 to Atlanta.{where}',
  morning_zip: ' Last empty ZIP on file: {zip}.',
  guard_no_posted: 'That load has no posted rate, so a dispatcher has to call the broker.',
  guard_need_number: 'Posted is {posted}. What rate do you need? Example: NEED {example}',
  guard_need_flat: 'Tell us the dollar amount you need on this load. Example: NEED 2600',
  guard_not_higher: 'Posted is already {posted}. Reply 1-3 to take it at that rate, or NEED a higher dollar amount.',
  guard_over_cap: 'We can ask the broker up to {cap} without a dispatcher ({posted} posted). A person will look at {ask}.',
  guard_below_min: 'That is below your minimum ${min}/mi all-in.'
};

const ES = {
  need_zip: 'Shipping Wish: Mande el ZIP o la ciudad donde está vacío, y a dónde quiere ir. Ejemplo: 75201 to Atlanta.',
  loads_header: 'Shipping Wish cargas cerca de {origin}{dest}:',
  loads_other_header: 'Nada a {dest} ahora. Otras cargas cerca de {origin}:',
  loads_none: 'Shipping Wish: No hay cargas publicadas cerca de {origin}{dest} ahora.{why} Mande otro ZIP luego, o responda ANY para cualquier dirección.',
  loads_footer: 'Responda {choices} para pedir una, o MORE. Las tarifas son las que publicó el broker; ~ son millas estimadas.',
  why_too_far: ' Nada dentro de su límite de millas vacías ahora.',
  why_min_rpm: ' Algunas cargas estaban bajo su mínimo por milla.',
  why_equipment: ' Las cargas cerca piden otro equipo.',
  proactive: 'Shipping Wish: carga nueva cerca de {origin}:\n{line}\nResponda 1 para pedirla, MORE, o OFF TODAY.',
  negotiate_which: 'Shipping Wish: ¿Cuál carga? Responda 1 NEED 2600 (el dólar que usted necesita, no uno inventado).',
  negotiate_none: 'Shipping Wish: No hay una carga abierta. Mande el ZIP donde está vacío para ver cargas.',
  negotiate_waiting: 'Shipping Wish: Ya pedimos {ask} en {load}. Esperamos al broker.',
  negotiate_one_email: 'Shipping Wish: Ya mandamos un correo de tarifa en {load}. Un dispatcher toma el siguiente pedido.',
  negotiate_staff: 'Shipping Wish: Un dispatcher va a pedir {ask} en {load}.',
  negotiate_asked_short: 'Shipping Wish: Pedimos {ask} en {load} (publicado {posted}). No salga hasta que le escribamos BOOKED.',
  negotiate_asked: 'Shipping Wish: Pedimos {ask} en {load} (publicado {posted}). No salga hasta que le escribamos BOOKED con la rate confirmation.',
  negotiate_accepted: 'Shipping Wish: Anotado, {rate} en {load}. No salga hasta que le escribamos BOOKED con la rate confirmation.',
  book_blocked: 'Shipping Wish: No vamos a pedir {load}. Ese broker no pasó el chequeo FMCSA. Mande su ZIP para otras cargas.',
  book_blocked_more: 'Shipping Wish: No vamos a pedir {load}. Ese broker no pasó el chequeo FMCSA.',
  book_expired: 'Shipping Wish: Esa lista ya venció. Mande el ZIP donde está vacío para cargas nuevas.',
  book_expired_lead: 'Esa lista ya venció.',
  book_requested: 'Shipping Wish: Pedimos {load} ({lane}, {rate}) al broker ahora. No salga hasta que le escribamos BOOKED con la rate confirmation.',
  book_taken: 'La carga {load} ya se cubrió.',
  more_need_zip: 'Shipping Wish: Mande el ZIP donde está vacío y a dónde quiere ir. Ejemplo: 75201 to Atlanta.',
  more_none: 'Shipping Wish: No hay otras cargas cerca de {origin} ahora. Responda ANY para cualquier dirección, o mande otro ZIP luego.',
  off: 'Shipping Wish: Entendido, no cargas hoy. Le escribimos en la mañana del siguiente día de trabajo.',
  reload_need_zip: 'Shipping Wish: Mande el ZIP o la ciudad donde está vacío para la siguiente carga. Ejemplo: vacio Dallas TX.',
  reload_none: 'Shipping Wish: No hay cargas publicadas cerca de {origin} ahora.{why} Mande otro ZIP luego.',
  noted_dest: 'Shipping Wish: Anotado{dest}. ¿En qué ZIP o ciudad está vacío?',
  help: 'Shipping Wish dispatch: mande el ZIP o ciudad donde está vacío y a dónde quiere ir (ejemplo: 75201 to Atlanta). Responda 1-3 para pedir una carga, NEED 2600 para pedir al broker un dólar que usted nombró, MORE para otras, RELOAD cuando quede vacío en la entrega, o OFF TODAY. En una carga BOOKED: ARRIVED SHIPPER / LLEGUE SHIPPER, LOADED / CARGADO, WAITING / ESPERANDO, ARRIVED RECEIVER / LLEGUE RECEIVER, o DELIVERED / ENTREGADO, y foto del POD. Un dispatcher lee cada mensaje.',
  handoff: 'Shipping Wish: Un dispatcher le escribe en breve.',
  booked: 'Shipping Wish: BOOKED {load}. {lane}, pickup {date}, {rate}. La rate confirmation y los detalles del pickup siguen.{reload} Responda ARRIVED SHIPPER, LOADED, WAITING, ARRIVED RECEIVER o DELIVERED (o LLEGUE SHIPPER, CARGADO, ESPERANDO, LLEGUE RECEIVER, ENTREGADO). Mande foto del POD al descargar.',
  reload_hint: ' Cuando esté vacío en {city}, responda RELOAD para {n} carga{s} siguiente{s} de ahí.',
  reload_hint_none: ' Cuando esté vacío en {city}, responda RELOAD y buscamos de nuevo.',
  released: 'Shipping Wish: {load} ya no está disponible.',
  released_zip: ' Mande su ZIP otra vez para cargas nuevas.',
  broker_counter: 'Shipping Wish: El broker ofreció {rate} en {load} (publicado {posted}). Responda YES o SI para tomar {rate}, o NEED un dólar más alto.',
  pod_fail: 'Shipping Wish: No se pudo guardar esa foto. Mande otra vez la foto del POD.',
  pod_saved_extra: ' Foto del POD guardada.',
  pod_one_fail: ' Una foto no se guardó. Mándela otra vez.',
  zip_more: ' Mande su ZIP para otras cargas.',
  zip_more_short: ' Mande su ZIP para más.',
  arrived_shipper: 'Shipping Wish: Anotado, llegó al shipper en {load}. Responda LOADED o CARGADO cuando salga, o WAITING / ESPERANDO si lo detienen.',
  loaded: 'Shipping Wish: Anotado, cargado en {load}. Responda ARRIVED RECEIVER o LLEGUE RECEIVER cuando llegue.',
  arrived_receiver: 'Shipping Wish: Anotado, llegó al receiver en {load}. Responda WAITING / ESPERANDO si lo detienen, DELIVERED / ENTREGADO cuando quede vacío, y foto del POD.',
  waiting: 'Shipping Wish: Anotado, esperando en {load}. Contamos los minutos. No se cobra un dólar hasta que un dispatcher ponga la tarifa. Mande foto del POD al descargar.',
  pod: 'Shipping Wish: Foto del POD guardada para {load}. Responda RELOAD cuando quiera la siguiente carga.',
  delivered: 'Shipping Wish: {load} quedó entregado. Responda RELOAD para la siguiente carga desde la entrega.',
  transit_saved: 'Shipping Wish: Actualización guardada para {load}.',
  check_call: 'Shipping Wish check-call en {load} ({lane}). ¿Dónde está? Responda ARRIVED SHIPPER, LOADED, WAITING, ARRIVED RECEIVER o DELIVERED (o LLEGUE SHIPPER, CARGADO, ESPERANDO, LLEGUE RECEIVER, ENTREGADO). Mande foto del POD al descargar.',
  morning: 'Shipping Wish: Buenos días {name}. Responda con el ZIP donde está vacío y a dónde quiere ir. Ejemplo: 75201 to Atlanta.{where}',
  morning_zip: ' Último ZIP vacío en archivo: {zip}.',
  guard_no_posted: 'Esa carga no tiene tarifa publicada, así que un dispatcher tiene que llamar al broker.',
  guard_need_number: 'Lo publicado es {posted}. ¿Qué tarifa necesita? Ejemplo: NEED {example}',
  guard_need_flat: 'Díganos el dólar que necesita en esta carga. Ejemplo: NEED 2600',
  guard_not_higher: 'Lo publicado ya es {posted}. Responda 1-3 para tomarla a esa tarifa, o NEED un dólar más alto.',
  guard_over_cap: 'Podemos pedir al broker hasta {cap} sin un dispatcher ({posted} publicado). Una persona va a ver {ask}.',
  guard_below_min: 'Eso está bajo su mínimo ${min}/mi all-in.'
};

function t(lang, key, vars) {
  const table = lang === 'es' ? ES : EN;
  let s = table[key] || EN[key] || key;
  if (vars) {
    s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] == null ? '' : String(vars[k])));
  }
  return s;
}

module.exports = { fold, detectLang, langOf, t, EN, ES };
