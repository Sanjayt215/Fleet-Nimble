import { useEffect, useRef } from 'react';
import { connectSocket, subscribeSocket, unsubscribeSocket } from '../services/socket';
import { useAuth } from '../context/AuthContext';

export function useSocket(events = {}, vehicleId = null) {
  const { isAuthenticated } = useAuth();
  const handlers = useRef(events);
  handlers.current = events;

  useEffect(() => {
    if (!isAuthenticated) return;

    const socket = subscribeSocket();
    connectSocket();

    const joinRooms = () => {
      socket.emit('join:user');
      if (vehicleId) socket.emit('join:vehicle', vehicleId);
    };

    joinRooms();
    socket.on('connect', joinRooms);

    const interval = setInterval(() => {
      if (socket.connected) socket.emit('ping:heartbeat');
    }, 20000);

    const subs = Object.entries(events).map(([event, fn]) => {
      if (typeof fn !== 'function') return null;
      const wrapped = (...args) => {
        const handler = handlers.current[event];
        if (typeof handler === 'function') handler(...args);
      };
      socket.on(event, wrapped);
      return [event, wrapped];
    }).filter(Boolean);

    return () => {
      clearInterval(interval);
      socket.off('connect', joinRooms);
      subs.forEach(([event, wrapped]) => socket.off(event, wrapped));
      unsubscribeSocket();
    };
  }, [isAuthenticated, vehicleId]);
}
