// Shipping Wish LLC Auth & Navigation Helper

function isAuthPage() {
  const p = (window.location.pathname || '').replace(/\.html$/i, '').replace(/\/$/, '');
  return p.endsWith('/login') || p.endsWith('/signup');
}

async function checkAuth(allowedRoles = []) {
  try {
    const res = await fetch('/api/me');
    if (!res.ok) {
      if (!isAuthPage()) {
        window.location.href = '/login';
      }
      return null;
    }
    const data = await res.json();
    const user = data.user;

    if (allowedRoles.length > 0) {
      if (!allowedRoles.includes(user.role) && !(allowedRoles.includes('admin') && user.role === 'super_admin')) {
        // Redirect to appropriate dashboard based on role
        redirectUserToDashboard(user);
        return null;
      }
    }
    return user;
  } catch (err) {
    if (!isAuthPage()) {
      window.location.href = '/login';
    }
    return null;
  }
}

function redirectUserToDashboard(user) {
  if (user.role === 'super_admin' || user.role === 'admin') {
    window.location.href = '/admin-dashboard';
  } else if (user.role === 'dispatcher') {
    window.location.href = '/dispatcher-dashboard';
  } else {
    window.location.href = '/dashboard';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Mobile Navigation Toggle
  const navToggle = document.querySelector('.nav-toggle');
  const navLinks = document.querySelector('.nav-links');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      if (navLinks.style.display === 'flex') {
        navLinks.style.display = 'none';
      } else {
        navLinks.style.display = 'flex';
        navLinks.style.flexDirection = 'column';
        navLinks.style.position = 'absolute';
        navLinks.style.top = '72px';
        navLinks.style.left = '0';
        navLinks.style.right = '0';
        navLinks.style.background = '#141820';
        navLinks.style.padding = '20px';
        navLinks.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
      }
    });
  }

  // Logout Handler
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await fetch('/api/logout', { method: 'POST' });
      window.location.href = '/login';
    });
  }

  // Login Form Submission Handler
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = document.getElementById('auth-msg');
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;

      if (msg) {
        msg.className = 'form-msg';
        msg.style.display = 'none';
        msg.textContent = '';
      }

      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (!res.ok) {
          if (msg) {
            msg.className = 'form-msg error';
            msg.textContent = data.error || 'Invalid email or password.';
            msg.style.display = 'block';
          } else {
            alert(data.error || 'Invalid email or password.');
          }
        } else {
          if (msg) {
            msg.className = 'form-msg success';
            msg.textContent = 'Signed in successfully! Redirecting...';
            msg.style.display = 'block';
          }
          setTimeout(() => redirectUserToDashboard(data.user), 500);
        }
      } catch (err) {
        if (msg) {
          msg.className = 'form-msg error';
          msg.textContent = 'Network error. Please try again.';
          msg.style.display = 'block';
        }
      }
    });
  }

  // Signup Form Submission Handler
  const signupForm = document.getElementById('signup-form');
  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = document.getElementById('auth-msg');
      const formData = new FormData(signupForm);
      const body = Object.fromEntries(formData.entries());

      if (msg) {
        msg.className = 'form-msg';
        msg.style.display = 'none';
      }

      try {
        const res = await fetch('/api/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await res.json();

        if (!res.ok) {
          if (msg) {
            msg.className = 'form-msg error';
            msg.textContent = data.error || 'Could not create account.';
            msg.style.display = 'block';
          } else {
            alert(data.error || 'Could not create account.');
          }
        } else {
          if (msg) {
            msg.className = 'form-msg success';
            msg.textContent = 'Account created! Redirecting to dashboard...';
            msg.style.display = 'block';
          }
          setTimeout(() => redirectUserToDashboard(data.user), 500);
        }
      } catch (err) {
        if (msg) {
          msg.className = 'form-msg error';
          msg.textContent = 'Network error. Please try again.';
          msg.style.display = 'block';
        }
      }
    });
  }
});
