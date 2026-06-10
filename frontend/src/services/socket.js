import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.NEXT_PUBLIC_API_URL || import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL || 'http://localhost:5000';

let socket = null;
let socketSubscriberCount = 0;

export function getSocket() {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      auth: { token: localStorage.getItem('accessToken') },
    });
  }
  return socket;
}

export function subscribeSocket() {
  socketSubscriberCount += 1;
  return getSocket();
}

export function unsubscribeSocket() {
  socketSubscriberCount = Math.max(0, socketSubscriberCount - 1);
  if (socketSubscriberCount === 0) {
    disconnectSocket();
  }
}

export function resetSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
    socketSubscriberCount = 0;
  }
}

export function connectSocket() {
  const s = getSocket();
  s.auth = { token: localStorage.getItem('accessToken') };
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket() {
  if (socket?.connected) socket.disconnect();
}
