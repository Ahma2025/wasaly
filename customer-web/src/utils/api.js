import axios from 'axios';

const BASE = 'https://snareless-diatonic-emmalynn.ngrok-free.dev/api';

const api = axios.create({
  baseURL: BASE,
  headers: { 'ngrok-skip-browser-warning': 'true' }
});

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('wasaly_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use(r => r.data, e => {
  if (e?.response?.status === 401) {
    localStorage.removeItem('wasaly_token');
    localStorage.removeItem('wasaly_user');
    window.location.href = '/login';
  }
  return Promise.reject(e?.response?.data || e);
});

export default api;
