const changeEvent = "resource-calendar:bookings-changed";
const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("resource-calendar-bookings");

export function announceBookingChange() {
  window.dispatchEvent(new Event(changeEvent));
  channel?.postMessage(null);
}

export function subscribeToBookingChanges(callback: () => void) {
  const listener = () => callback();
  window.addEventListener(changeEvent, listener);
  channel?.addEventListener("message", listener);
  return () => {
    window.removeEventListener(changeEvent, listener);
    channel?.removeEventListener("message", listener);
  };
}
