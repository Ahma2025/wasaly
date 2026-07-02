import axios from 'axios';
const api = axios.create({ baseURL: 'https://burger-app-production.up.railway.app/api', timeout: 15000 });
api.interceptors.request.use(config => {
  const token = localStorage.getItem('admin_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
api.interceptors.response.use(res => res.data, err => { throw err.response?.data || { message: 'Network error' }; });
export default api;

