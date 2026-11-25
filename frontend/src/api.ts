import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:4000/api",
  withCredentials: true
});

export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) return error.response?.data?.error ?? "The request could not be completed.";
  return "The request could not be completed.";
}
