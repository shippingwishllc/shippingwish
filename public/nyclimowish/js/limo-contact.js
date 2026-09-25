(function () {
  const form = document.getElementById('contact-page-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Sending...';
    try {
      const res = await fetch('/api/corporate-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(form)))
      });
      btn.textContent = res.ok ? 'Message Sent ✓' : 'Try Again';
      if (res.ok) form.reset();
      btn.disabled = !res.ok;
    } catch {
      btn.textContent = 'Try Again';
      btn.disabled = false;
    }
  });
})();
