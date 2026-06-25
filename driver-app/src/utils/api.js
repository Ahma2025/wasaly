import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const api = axios.create({ baseURL: 'http://localhost:5000/api', timeout: 15000 });

api.interceptors.request.use(async config => {
  const token = await AsyncStorage.getItem('driver_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(res => res.data, err => { throw err.response?.data || { message: 'Network error' }; });

export default api;
