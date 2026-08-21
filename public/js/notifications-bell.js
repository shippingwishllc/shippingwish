/**
 * Shipping Wish LLC — Notification Bell Component
 * Reusable header notification bell for all TMS dashboards.
 */

class NotificationBell {
  constructor(containerId = 'notif-container') {
    this.container = document.getElementById(containerId);
    if (!this.container) return;
    this.init();
  }

  async init() {
    this.renderMarkup();
    this.bindEvents();
    await this.fetchUnreadCount();
    // Poll every 30 seconds
    setInterval(() => this.fetchUnreadCount(), 30000);
  }

  renderMarkup() {
    this.container.innerHTML = `
      <div class="notif-wrapper">
        <button class="notif-bell-btn" id="notif-bell-btn" aria-label="Notifications" aria-expanded="false">
          <span style="font-size:18px;">🔔</span>
          <span class="notif-badge" id="notif-badge" style="display:none;">0</span>
        </button>

        <div class="notif-popover" id="notif-popover">
          <div class="notif-popover-header">
            <div style="font-weight:700;font-size:14px;color:var(--text-primary);">Notifications</div>
            <button id="notif-mark-all" style="background:none;border:none;color:var(--color-amber-600);font-size:12px;font-weight:600;cursor:pointer;">
              Mark all read
            </button>
          </div>
          <div class="notif-popover-list" id="notif-list">
            <div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;">Loading notifications...</div>
          </div>
        </div>
      </div>
    `;

    this.btn = document.getElementById('notif-bell-btn');
    this.badge = document.getElementById('notif-badge');
    this.popover = document.getElementById('notif-popover');
    this.list = document.getElementById('notif-list');
    this.markAllBtn = document.getElementById('notif-mark-all');
  }

  bindEvents() {
    this.btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = this.popover.classList.toggle('open');
      this.btn.setAttribute('aria-expanded', isOpen);
      if (isOpen) this.fetchNotifications();
    });

    document.addEventListener('click', (e) => {
      if (!this.container.contains(e.target)) {
        this.popover.classList.remove('open');
        this.btn.setAttribute('aria-expanded', 'false');
      }
    });

    this.markAllBtn.addEventListener('click', async () => {
      try {
        await fetch('/api/notifications/read-all', { method: 'PUT', credentials: 'include' });
        this.badge.style.display = 'none';
        this.badge.textContent = '0';
        this.fetchNotifications();
      } catch (err) {
        console.error('Mark all read error:', err);
      }
    });
  }

  async fetchUnreadCount() {
    try {
      const res = await fetch('/api/notifications/unread-count', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      const count = data.unreadCount || 0;
      if (count > 0) {
        this.badge.textContent = count > 99 ? '99+' : count;
        this.badge.style.display = 'flex';
      } else {
        this.badge.style.display = 'none';
      }
    } catch (err) {
      // Silent catch
    }
  }

  async fetchNotifications() {
    try {
      const res = await fetch('/api/notifications?limit=15', { credentials: 'include' });
      if (!res.ok) {
        this.list.innerHTML = `<div style="padding:16px;text-align:center;color:var(--color-error);font-size:13px;">Could not load notifications.</div>`;
        return;
      }
      const data = await res.json();
      const notifs = data.notifications || [];

      if (notifs.length === 0) {
        this.list.innerHTML = `
          <div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px;">
            <div style="font-size:24px;margin-bottom:6px;">🎉</div>
            No notifications yet!
          </div>
        `;
        return;
      }

      this.list.innerHTML = notifs.map(n => `
        <div class="notif-item ${n.is_read ? '' : 'unread'}" onclick="NotificationBell.handleClick('${n.id}', '${n.link || ''}')">
          <div style="font-size:16px;flex-shrink:0;">${this.getIcon(n.type)}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:13px;color:var(--text-primary);margin-bottom:2px;">${this.escape(n.title)}</div>
            <div style="font-size:12px;color:var(--text-secondary);line-height:1.4;">${this.escape(n.message)}</div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:4px;">${this.formatTime(n.created_at)}</div>
          </div>
        </div>
      `).join('');
    } catch (err) {
      this.list.innerHTML = `<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:13px;">Network error loading notifications.</div>`;
    }
  }

  static async handleClick(id, link) {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: 'PUT', credentials: 'include' });
    } catch (e) {}
    if (link && link !== 'null' && link !== '') {
      window.location.href = link;
    }
  }

  getIcon(type) {
    switch (type) {
      case 'success': return '✅';
      case 'warning': return '⚠️';
      case 'danger': return '🚨';
      default: return 'ℹ️';
    }
  }

  formatTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const diffSec = Math.floor((new Date() - date) / 1000);
    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return date.toLocaleDateString();
  }

  escape(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

// Auto init if element exists
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('notif-container')) {
    new NotificationBell('notif-container');
  }
});
