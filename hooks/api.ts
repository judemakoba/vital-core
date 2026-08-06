import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// Generic API call function
async function apiCall<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  });
  
  const data = await response.json();
  
  if (!response.ok) {
    const error = new Error(data.error?.message || "API Error");
    (error as any).status = response.status;
    (error as any).code = data.error?.code;
    throw error;
  }
  
  return data;
}

// Patient hooks
export function usePatients(params?: { search?: string; page?: number; limit?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.set("search", params.search);
  if (params?.page) searchParams.set("page", params.page.toString());
  if (params?.limit) searchParams.set("limit", params.limit.toString());
  
  return useQuery({
    queryKey: ["patients", params],
    queryFn: () => apiCall<any>("/api/patients?" + searchParams.toString()),
    placeholderData: (previousData) => previousData,
  });
}

export function usePatient(id: string) {
  return useQuery({
    queryKey: ["patient", id],
    queryFn: () => apiCall<any>("/api/patients/" + id),
    enabled: !!id,
  });
}

export function useCreatePatient() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: any) => apiCall("/api/patients", {
      method: "POST",
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patients"] });
    },
  });
}

export function useUpdatePatient(id: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: any) => apiCall("/api/patients/" + id, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patient", id] });
      queryClient.invalidateQueries({ queryKey: ["patients"] });
    },
  });
}

export function useDeletePatient() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => apiCall("/api/patients/" + id, {
      method: "DELETE",
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patients"] });
    },
  });
}

// Appointment hooks
export function useAppointments(params?: { date?: string; doctorId?: string }) {
  const searchParams = new URLSearchParams();
  if (params?.date) searchParams.set("date", params.date);
  if (params?.doctorId) searchParams.set("doctorId", params.doctorId);
  
  return useQuery({
    queryKey: ["appointments", params],
    queryFn: () => apiCall<any>("/api/appointments?" + searchParams.toString()),
  });
}

export function useCreateAppointment() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: any) => apiCall("/api/appointments", {
      method: "POST",
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
  });
}

// Pharmacy hooks
export function usePharmacySummary() {
  return useQuery({
    queryKey: ["pharmacy", "summary"],
    queryFn: () => apiCall<any>("/api/pharmacy/summary"),
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}

export function useDrugs(params?: { search?: string; page?: number; limit?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.set("search", params.search);
  if (params?.page) searchParams.set("page", params.page.toString());
  if (params?.limit) searchParams.set("limit", params.limit.toString());
  
  return useQuery({
    queryKey: ["drugs", params],
    queryFn: () => apiCall<any>("/api/pharmacy/drugs?" + searchParams.toString()),
  });
}

// Finance hooks
export function useFinanceSummary() {
  return useQuery({
    queryKey: ["finance", "summary"],
    queryFn: () => apiCall<any>("/api/finance/summary"),
  });
}

export function useChartOfAccounts() {
  return useQuery({
    queryKey: ["finance", "chartOfAccounts"],
    queryFn: () => apiCall<any>("/api/finance/accounts"),
  });
}

// IPD hooks
export function useAdmissions(params?: { status?: string }) {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set("status", params.status);
  
  return useQuery({
    queryKey: ["admissions", params],
    queryFn: () => apiCall<any>("/api/ipd/admissions?" + searchParams.toString()),
  });
}

export function useWards() {
  return useQuery({
    queryKey: ["wards"],
    queryFn: () => apiCall<any>("/api/ipd/wards"),
  });
}

// Generic hooks for any API endpoint
export function useApi<T>(key: string[], url: string, options?: { enabled?: boolean }) {
  return useQuery<T>({
    queryKey: key,
    queryFn: () => apiCall<T>(url),
    enabled: options?.enabled !== false,
  });
}

export function useApiMutation(url: string, options?: { method?: string; invalidateKeys?: string[][] }) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: any) => apiCall(url, {
      method: options?.method || "POST",
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      options?.invalidateKeys?.forEach(key => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
  });
}
