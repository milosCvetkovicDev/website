import { NotificationToast } from 'web';

export const Types = () => (
  <div className="space-y-3">
    <NotificationToast type="success">
      ✓ DEPLOYMENT SUCCESSFUL: production environment updated
    </NotificationToast>
    <NotificationToast type="info">Agent activated: analysing the stack trace</NotificationToast>
    <NotificationToast type="warning">Daily budget cap at 80%</NotificationToast>
    <NotificationToast type="error">
      ERROR DETECTED: NullPointerException in /api/orders
    </NotificationToast>
  </div>
);

export const Achievement = () => (
  <NotificationToast type="success">
    <div className="flex items-center gap-3">
      <span className="text-xl">🏆</span>
      <div>
        <div className="font-semibold">Achievement Unlocked</div>
        <div className="text-sm">"Zero Trust, Full Send" — +500 XP</div>
      </div>
    </div>
  </NotificationToast>
);

export const DarkTheme = () => (
  <div className="dark bg-[var(--background)] p-6 text-[var(--foreground)]">
    <div className="space-y-3">
      <NotificationToast type="success">
        ✓ DEPLOYMENT SUCCESSFUL: production environment updated
      </NotificationToast>
      <NotificationToast type="info">Agent activated: analysing the stack trace</NotificationToast>
      <NotificationToast type="warning">Daily budget cap at 80%</NotificationToast>
      <NotificationToast type="error">
        ERROR DETECTED: NullPointerException in /api/orders
      </NotificationToast>
    </div>
  </div>
);
