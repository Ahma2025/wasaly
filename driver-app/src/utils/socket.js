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
        socketInstance = io('http://localhost:5000', { auth: { token }, transports: ['websocket'] });
      }
      socketRef.current = socketInstance;
    });
    return () => {};
  }, []);

  return socketRef.current;
}
