(function () {
  const root = document.createElement('div');
  root.innerHTML = `
    <button type="button" id="bwoChatOpen" aria-label="Chat with BuyWish" style="position:fixed;right:18px;bottom:18px;z-index:40;width:56px;height:56px;border:0;border-radius:18px;background:#e94560;color:#fff;font-weight:750;font-size:18px;box-shadow:0 10px 30px rgba(26,26,46,.25);cursor:pointer;">B</button>
    <section id="bwoChat" hidden style="position:fixed;right:18px;bottom:84px;z-index:40;width:min(380px,calc(100vw - 24px));height:min(520px,70vh);background:#fff;border:1px solid #e7e2dc;border-radius:18px;box-shadow:0 18px 50px rgba(26,26,46,.2);display:flex;flex-direction:column;overflow:hidden;font-family:Inter,Helvetica,Arial,sans-serif;">
      <header style="background:#1a1a2e;color:#fff;padding:14px 16px;display:flex;justify-content:space-between;align-items:center;">
        <div><strong>BuyWishOnline</strong><div style="color:#f5a623;font-size:12px;">Shopping help</div></div>
        <button type="button" id="bwoChatClose" style="background:transparent;color:#fff;border:0;font-size:20px;cursor:pointer;">×</button>
      </header>
      <div id="bwoChatLog" style="flex:1;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:8px;"></div>
      <form id="bwoChatForm" style="display:flex;gap:8px;padding:12px;border-top:1px solid #efeae4;">
        <input id="bwoChatInput" placeholder="Ask about an order or the shop" style="flex:1;border:1px solid #e7e2dc;border-radius:10px;padding:10px 12px;font:inherit;">
        <button type="submit" style="background:#1a1a2e;color:#fff;border:0;border-radius:10px;padding:10px 12px;font-weight:700;cursor:pointer;">Send</button>
      </form>
    </section>`;
  document.body.appendChild(root);
  const panel = document.getElementById('bwoChat');
  const log = document.getElementById('bwoChatLog');
  const history = [];
  const visitorKey = 'bwo_chat_visitor';
  let visitor = '';
  try {
    visitor = localStorage.getItem(visitorKey) || '';
    if (!visitor) {
      visitor = 'v' + Math.random().toString(36).slice(2, 12);
      localStorage.setItem(visitorKey, visitor);
    }
  } catch (err) {
    visitor = 'guest';
  }
  function add(text, who) {
    const line = document.createElement('div');
    line.textContent = text;
    line.style.cssText = who === 'customer'
      ? 'align-self:flex-end;background:#1a1a2e;color:#fff;border-radius:12px;padding:8px 10px;max-width:85%;'
      : 'align-self:flex-start;background:#f6f3ef;color:#1a1a2e;border-radius:12px;padding:8px 10px;max-width:85%;';
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
  }
  add('Thank you for shopping with BuyWishOnline. Ask about shipping, an order number, or where to write support.', 'assistant');
  document.getElementById('bwoChatOpen').onclick = () => { panel.hidden = false; };
  document.getElementById('bwoChatClose').onclick = () => { panel.hidden = true; };
  document.getElementById('bwoChatForm').onsubmit = async (event) => {
    event.preventDefault();
    const input = document.getElementById('bwoChatInput');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    add(text, 'customer');
    history.push({ role: 'user', content: text });
    add('One moment…', 'assistant');
    const pending = log.lastChild;
    try {
      const res = await fetch('/api/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, brand: 'buywish', visitor, history: history.slice(-6) })
      });
      const data = await res.json();
      const reply = data.reply || 'Email support@buywishonline.com and we will help.';
      pending.textContent = reply;
      history.push({ role: 'assistant', content: reply });
    } catch (err) {
      pending.textContent = 'Email support@buywishonline.com and we will help.';
    }
  };
})();
