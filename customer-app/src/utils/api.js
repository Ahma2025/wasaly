import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const API_URL = 'https://snareless-diatonic-emmalynn.ngrok-free.dev/api';

const api = axios.create({ baseURL: API_URL, timeout: 15000, headers: { 'ngrok-skip-browser-warning': '1' } });

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  res => res.data,
  async err => {
    if (err.response?.status === 401) {
      await SecureStore.deleteItemAsync('token');
    }
    throw err.response?.data || { message: 'Network error' };
  }
);

export default api;
