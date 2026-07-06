import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';

let socketInstance = null;

export function useSocket() {
  const socketRef = useRef(null);

  useEffect(() => {
    AsyncStorage.getItem('driver_token').then(token => {
      if (!token) return;
      if (!socketInstance) {
        socketInstance = io('https://burger-app-production.up.railway.app', { auth: { token }, transports: ['websocket'] });
      }
      socketRef.current = socketInstance;
    });
    return () => {};
  }, []);

  return socketRef.current;
}

export function disconnectSocket() {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
}

