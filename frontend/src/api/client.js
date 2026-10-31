import axios from "axios";
import { supabase } from "../supabase";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://127.0.0.1:8001",
  timeout: 30000,
});

api.interceptors.request.use(async (config) => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.code === "ECONNABORTED") {
      error.message = "Request timeout. Please try again.";
    } else if (error.response) {
      error.message =
        error.response.data?.error ||
        error.response.data?.detail ||
        error.response.data?.message ||
        `Server error: ${error.response.status}`;
    } else if (error.request) {
      error.message = "Cannot connect to server. Is the backend running?";
    }
    return Promise.reject(error);
  }
);
