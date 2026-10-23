// Auto-Renew Push Subscription
if ('serviceWorker' in navigator && 'PushManager' in window) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      
      // If user hasn't granted permission, do nothing
      if (Notification.permission !== 'granted') return;

      // Get existing subscription
      let subscription = await registration.pushManager.getSubscription();
      
      // If subscription expired or missing, renew it
      if (!subscription) {
        const res = await fetch('/api/push/vapid-public-key');
        if (!res.ok) return;
        const { key } = await res.json();
        
        const urlBase64ToUint8Array = (base64String) => {
          const padding = '='.repeat((4 - base64String.length % 4) % 4);
          const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
          const rawData = window.atob(base64);
          const outputArray = new Uint8Array(rawData.length);
          for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
          return outputArray;
        };

        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key)
        });
      }

      // Sync subscription with backend (Upsert logic handles duplicates)
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(subscription)
      });
      
    } catch (err) {
      console.error('Auto-renew push subscription failed:', err);
    }
  });
}
