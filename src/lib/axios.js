import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://172.18.188.154:8000';

export const nirmalaApi = axios.create({
  baseURL: API_BASE_URL,
  timeout: 12000, // Increased timeout - API can take up to 300ms + network latency
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// Response Interceptor for Error Diagnostics & Retry Logic
nirmalaApi.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const status = error?.response?.status;
    const message = error?.message;
    
    // Log with more context
    if (status) {
      console.error(`[Nirmala API Error] ${status}:`, message);
    } else if (message?.includes('timeout')) {
      console.warn(`[Nirmala API Warning] Request timeout - using fallback data`);
    } else {
      console.warn(`[Nirmala API Warning] ${message || 'Unknown error'}`);
    }
    
    return Promise.reject(error);
  }
);
