import axios, { AxiosError } from "axios";
import type {
  AIReport, AreaAnalysisResponse, AutoPlanResponse, BestLocation,
  BudgetRecommendation, BusinessCategories, BusinessGeoJSON, BusinessPlan,
  BusinessSummary, CannibalizationResponse, ChatResponse, CitiesCompareResponse,
  CityEco, CityOverview, CityStatDetail, CompareResult, CompetitionResult,
  DeveloperCheckReport, DeveloperCheckRequest, District, DistrictAnalytics,
  DistrictEco, DistrictForecast, DistrictGeoJSON, DistrictRecommendation,
  Facility, FacilityType, FifteenMinCity, FuturesChatResponse,
  FuturesCompareResponse, FuturesForecast, FuturesOptimizeGoal,
  FuturesOptimizeResponse, FuturesParamsMetaResponse, FuturesPreset,
  FuturesScenarioInput, FuturesSensitivityResponse, GeoJSONCollection,
  HealthImpact, HealthRiskMeta, HealthRiskRequest, HealthRiskResponse,
  InversionForecast, Mode, PersonaInput, PersonalBrief, PlanQuota, PlanRequest,
  SimulationResult, SourceAttribution, SourcesMapResponse,
  SpendingPotentialResponse, TimeCoverageResponse, WindowAdvice,
} from "../types";

// Base URL: in dev, Vite proxy serves /api → localhost:8000.
// In prod (Render), set VITE_API_URL to the backend's public URL.
// Render's `fromService.property: host` returns a bare hostname (without scheme),
// so we explicitly prefix https:// when missing.
function buildBaseUrl(): string {
  const raw = (import.meta.env?.VITE_API_URL ?? "").trim().replace(/\/+$/, "");
  if (!raw) return "/api/v1";
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return `${withScheme}/api/v1`;
}

const BASE_URL = buildBaseUrl();
if (import.meta.env?.DEV || typeof window !== "undefined" && (window as any).__AQYL_DEBUG_API__) {
  // eslint-disable-next-line no-console
  console.info("[aqyl] API base URL:", BASE_URL);
}

const api = axios.create({ baseURL: BASE_URL, timeout: 20000 });

export interface ApiError extends Error {
  status?: number;
  code?: string;
  detail?: unknown;
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof Error && "status" in (e as object);
}

// Reject HTML responses — happens when VITE_API_URL is misconfigured and
// requests hit the SPA's own _redirects fallback returning index.html.
api.interceptors.response.use(
  (r) => {
    const ct = (r.headers?.["content-type"] || "").toString().toLowerCase();
    if (ct.includes("text/html")) {
      const err: ApiError = Object.assign(
        new Error("API returned HTML — VITE_API_URL likely misconfigured"),
        { status: r.status, code: "BAD_BASE_URL", detail: "html_response" },
      );
      // eslint-disable-next-line no-console
      console.error("[aqyl-api] HTML response — check VITE_API_URL. Got:", r.config?.baseURL);
      return Promise.reject(err);
    }
    return r;
  },
  (e: AxiosError<{ detail?: string; error?: string; message?: string }>) => {
    const status = e.response?.status;
    const data = e.response?.data;
    const detail =
      (data && (data.detail || data.error || data.message)) || e.message;
    const err: ApiError = Object.assign(
      new Error(typeof detail === "string" ? detail : "Ошибка сети"),
      { status, code: e.code, detail: data },
    );
    if (import.meta.env?.DEV) {
      console.warn(`[api] ${e.config?.method?.toUpperCase() ?? "GET"} ${e.config?.url} → ${status ?? "?"}:`, detail);
    }
    return Promise.reject(err);
  },
);

// ---------- Districts / Facilities ----------

export const getDistricts = (): Promise<District[]> =>
  api.get<District[]>("/districts").then((r) => r.data);

export const getFacilities = (p: { facility_type?: FacilityType; district_id?: number; limit?: number }) =>
  api.get<Facility[]>("/facilities", { params: p }).then((r) => r.data);

export const getFacilitiesGeoJSON = (p: { facility_type?: FacilityType; district_id?: number }) =>
  api.get<GeoJSONCollection>("/facilities/geojson", { params: p }).then((r) => r.data);

export const getDistrictAnalytics = (): Promise<DistrictAnalytics[]> =>
  api.get<DistrictAnalytics[]>("/analytics/districts").then((r) => r.data);

export const getCityOverview = (): Promise<CityOverview> =>
  api.get<CityOverview>("/analytics/overview").then((r) => r.data);

export const getCityStatistics = (): Promise<CityStatDetail> =>
  api.get<CityStatDetail>("/statistics").then((r) => r.data);

export const getFacilityTypeCounts = (): Promise<Record<string, number>> =>
  api.get<Record<string, number>>("/analytics/facility-types").then((r) => r.data);

// ---------- Business ----------

export const getBusinessCategories = (): Promise<BusinessCategories> =>
  api.get<BusinessCategories>("/business/categories").then((r) => r.data);

export const getBusinessGeoJSON = (category?: string): Promise<BusinessGeoJSON> =>
  api.get<BusinessGeoJSON>("/business/geojson", { params: category ? { category } : undefined }).then((r) => r.data);

export const getBusinessSummary = (): Promise<BusinessSummary> =>
  api.get<BusinessSummary>("/business/summary").then((r) => r.data);

export const getBestLocations = (category: string, topN = 5): Promise<BestLocation[]> =>
  api.get<BestLocation[]>("/business/best-locations", { params: { category, top_n: topN } }).then((r) => r.data);

export const getBestLocationsGrid = (
  category: string,
  opts?: { grid_size?: number; capture_radius_km?: number; district?: string },
): Promise<import("../types").BestLocationGridResponse> =>
  api.get<import("../types").BestLocationGridResponse>(
    "/business/best-locations/grid",
    {
      params: {
        category,
        grid_size: opts?.grid_size ?? 8,
        capture_radius_km: opts?.capture_radius_km ?? 0.7,
        ...(opts?.district ? { district: opts.district } : {}),
      },
      timeout: 30_000,
    },
  ).then((r) => r.data);

export const getCompetition = (category: string, lat: number, lon: number, radius_km = 1.0): Promise<CompetitionResult> =>
  api.get<CompetitionResult>("/business/competition", { params: { category, lat, lon, radius_km } }).then((r) => r.data);

// ---------- Eco ----------

export const getCityEco = (): Promise<CityEco> =>
  api.get<CityEco>("/eco/overview").then((r) => r.data);

export const getDistrictEco = (name: string): Promise<DistrictEco> =>
  api.get<DistrictEco>(`/eco/districts/${encodeURIComponent(name)}`).then((r) => r.data);

export const listEcoDistricts = (): Promise<{ name: string; baseline_aqi: number }[]> =>
  api.get("/eco/districts").then((r) => r.data);

// ---------- Futures (Болашақ) ----------

export const futuresPresets = (): Promise<{ presets: FuturesPreset[] }> =>
  api.get<{ presets: FuturesPreset[] }>("/futures/presets").then((r) => r.data);

export const futuresForecast = (s: FuturesScenarioInput): Promise<FuturesForecast> =>
  api.post<FuturesForecast>("/futures/forecast", s, { timeout: 30_000 }).then((r) => r.data);

export const futuresAnalyze = (s: FuturesScenarioInput): Promise<FuturesForecast> =>
  api.post<FuturesForecast>("/futures/analyze", s, { timeout: 60_000 }).then((r) => r.data);

export const futuresPresetForecast = (preset_key: string): Promise<FuturesForecast> =>
  api.post<FuturesForecast>("/futures/preset-forecast", { preset_key }, { timeout: 30_000 }).then((r) => r.data);

export const futuresParamsMeta = (): Promise<FuturesParamsMetaResponse> =>
  api.get<FuturesParamsMetaResponse>("/futures/params/meta").then((r) => r.data);

export const futuresCompare = (
  a: FuturesScenarioInput, b: FuturesScenarioInput,
): Promise<FuturesCompareResponse> =>
  api.post<FuturesCompareResponse>("/futures/compare", { a, b }, { timeout: 60_000 })
    .then((r) => r.data);

export const futuresCompareMany = (
  scenarios: FuturesScenarioInput[], labels?: string[],
): Promise<import("../types").FuturesCompareManyResponse> =>
  api.post<import("../types").FuturesCompareManyResponse>(
    "/futures/compare-many",
    { scenarios, labels },
    { timeout: 120_000 },
  ).then((r) => r.data);

export const futuresSensitivity = (
  scenario: FuturesScenarioInput, delta = 0.10,
): Promise<FuturesSensitivityResponse> =>
  api.post<FuturesSensitivityResponse>(
    "/futures/sensitivity", { scenario, delta }, { timeout: 120_000 },
  ).then((r) => r.data);

export const futuresOptimize = (
  scenario: FuturesScenarioInput,
  goal: FuturesOptimizeGoal,
  iterations = 24,
): Promise<FuturesOptimizeResponse> =>
  api.post<FuturesOptimizeResponse>(
    "/futures/optimize", { scenario, goal, iterations }, { timeout: 180_000 },
  ).then((r) => r.data);

export const futuresChat = (
  forecast: FuturesForecast, question: string,
): Promise<FuturesChatResponse> =>
  api.post<FuturesChatResponse>(
    "/futures/chat", { forecast, question }, { timeout: 45_000 },
  ).then((r) => r.data);

export const futuresExplainSlider = (
  param_key: string, current_value: number, baseline_value: number,
  horizon_years = 10,
): Promise<{ answer: string; engine: string; param: any; generated_at: string }> =>
  api.post(
    "/futures/explain-slider",
    { param_key, current_value, baseline_value, horizon_years },
    { timeout: 30_000 },
  ).then((r) => r.data);

// ---------- Public advanced: 15-min city, compare, developer check ----------

export const getFifteenMin = (): Promise<FifteenMinCity> =>
  api.get<FifteenMinCity>("/public/fifteen-min").then((r) => r.data);

export const compareDistrictsApi = (ids: number[]): Promise<CompareResult> =>
  api.post<CompareResult>("/public/compare", { district_ids: ids }).then((r) => r.data);

export const developerCheck = (req: DeveloperCheckRequest): Promise<DeveloperCheckReport> =>
  api.post<DeveloperCheckReport>("/public/developer-check", req, { timeout: 30_000 }).then((r) => r.data);

export const downloadDeveloperCheckPdf = async (req: DeveloperCheckRequest): Promise<Blob> => {
  const { data } = await api.post<Blob>("/public/developer-check/pdf", req, {
    responseType: "blob", timeout: 60_000,
  });
  return data;
};

// ---------- Eco: Forecast & Health & Sources & Windows ----------

export const getDistrictForecast = (name: string, hours = 72): Promise<DistrictForecast> =>
  api.get<DistrictForecast>(`/eco/forecast/${encodeURIComponent(name)}`,
    { params: { hours } }).then((r) => r.data);

export const getHealthImpact = (name: string): Promise<HealthImpact> =>
  api.get<HealthImpact>(`/eco/health-impact/${encodeURIComponent(name)}`).then((r) => r.data);

export const getSourceAttribution = (name: string): Promise<SourceAttribution> =>
  api.get<SourceAttribution>(`/eco/sources/${encodeURIComponent(name)}`).then((r) => r.data);

export const getWindowAdvice = (name: string): Promise<WindowAdvice> =>
  api.get<WindowAdvice>(`/eco/windows/${encodeURIComponent(name)}`).then((r) => r.data);

export const getPersonalBrief = (p: PersonaInput): Promise<PersonalBrief> =>
  api.post<PersonalBrief>("/eco/personal-brief", p, { timeout: 60_000 }).then((r) => r.data);

// ---------- AI ----------

export interface AiChatHistoryItem {
  role: "user" | "assistant";
  content: string;
}

export const aiChat = (
  mode: Mode,
  message: string,
  opts?: {
    district_focus?: string;
    simulator_state?: Record<string, unknown>;
    user_profile?: Record<string, unknown> | null;
    history?: AiChatHistoryItem[];
  },
): Promise<ChatResponse> =>
  api.post<ChatResponse>("/ai/chat", {
    mode, message,
    district_focus: opts?.district_focus,
    simulator_state: opts?.simulator_state,
    user_profile: opts?.user_profile ?? undefined,
    history: opts?.history ?? [],
  }).then((r) => r.data);

export const aiReport = (mode: Mode): Promise<AIReport> =>
  api.get<AIReport>(`/ai/report/${mode}`).then((r) => r.data);

// ---------- Business Plan Generator ----------

export const getPlanQuota = (): Promise<PlanQuota> =>
  api.get<PlanQuota>("/business/plan/quota").then((r) => r.data);

export const generatePlan = (req: PlanRequest): Promise<BusinessPlan> =>
  api.post<BusinessPlan>("/business/plan/generate", req, { timeout: 60_000 }).then((r) => r.data);

export const downloadPlanPdf = async (req: PlanRequest): Promise<Blob> => {
  const { data } = await api.post<Blob>("/business/plan/pdf", req, {
    responseType: "blob", timeout: 90_000,
  });
  return data;
};

// ---------- Simulator ----------

export const simulateDistrict = (
  district_id: number,
  additions: Record<string, number>,
  removals: Record<string, number> = {},
): Promise<SimulationResult> =>
  api.post<SimulationResult>("/simulate/district", { district_id, additions, removals }).then((r) => r.data);

export const autoPlan = (district_id: number, target_score = 85): Promise<AutoPlanResponse> =>
  api.get<AutoPlanResponse>(`/simulate/auto-plan/${district_id}`, {
    params: { target_score },
  }).then((r) => r.data);

export const autoPlanPareto = (district_id: number): Promise<import("../types").AutoPlanParetoResponse> =>
  api.get<import("../types").AutoPlanParetoResponse>(
    `/simulate/auto-plan/${district_id}/pareto`,
    { timeout: 30_000 },
  ).then((r) => r.data);

export const downloadSimulationPdf = async (req: {
  district_id: number;
  additions: Record<string, number>;
  removals?: Record<string, number>;
  author?: string;
}): Promise<Blob> => {
  const { data } = await api.post<Blob>("/simulate/district/pdf", req, {
    responseType: "blob",
    timeout: 60_000,
  });
  return data;
};

export const getDistrictsGeoJSON = (): Promise<DistrictGeoJSON> =>
  api.get<DistrictGeoJSON>("/districts/geojson").then((r) => r.data);

// ---------- Eco advanced (health-risk / inversion / sources-map / cities) ----------

export const getHealthRiskMeta = (): Promise<HealthRiskMeta> =>
  api.get<HealthRiskMeta>("/eco/health-risk/meta").then((r) => r.data);

export const computeHealthRisk = (req: HealthRiskRequest): Promise<HealthRiskResponse> =>
  api.post<HealthRiskResponse>("/eco/health-risk", req).then((r) => r.data);

export const getInversionForecast = (hours = 72): Promise<InversionForecast> =>
  api.get<InversionForecast>("/eco/inversion", {
    params: { hours }, timeout: 30_000,
  }).then((r) => r.data);

export const getSourcesMap = (): Promise<SourcesMapResponse> =>
  api.get<SourcesMapResponse>("/eco/sources-map", { timeout: 90_000 }).then((r) => r.data);

export const getCitiesCompare = (): Promise<CitiesCompareResponse> =>
  api.get<CitiesCompareResponse>("/eco/compare-cities").then((r) => r.data);

// ---------- Business advanced ----------

export const recommendForDistrict = (
  districtName: string, top_n = 8, max_capex_usd?: number,
): Promise<DistrictRecommendation> =>
  api.get<DistrictRecommendation>(
    `/business/recommend/district/${encodeURIComponent(districtName)}`,
    { params: { top_n, ...(max_capex_usd ? { max_capex_usd } : {}) } },
  ).then((r) => r.data);

export const recommendByBudget = (
  max_capex_usd: number, top_n = 6,
): Promise<BudgetRecommendation> =>
  api.get<BudgetRecommendation>("/business/recommend/by-budget", {
    params: { max_capex_usd, top_n },
  }).then((r) => r.data);

export const getSpendingPotential = (): Promise<SpendingPotentialResponse> =>
  api.get<SpendingPotentialResponse>("/business/spending-potential").then((r) => r.data);

export const analyzeArea = (
  lat: number, lon: number, radius_km: number, category?: string,
): Promise<AreaAnalysisResponse> =>
  api.get<AreaAnalysisResponse>("/business/area-analysis", {
    params: { lat, lon, radius_km, ...(category ? { category } : {}) },
  }).then((r) => r.data);

export const cannibalizationSim = (
  lat: number, lon: number, category: string, capture_radius_km = 1.2,
): Promise<CannibalizationResponse> =>
  api.post<CannibalizationResponse>("/business/cannibalization", {
    lat, lon, category, capture_radius_km,
  }).then((r) => r.data);

export const timeCoverage = (
  category?: string, district?: string,
): Promise<TimeCoverageResponse> =>
  api.get<TimeCoverageResponse>("/business/time-coverage", {
    params: { ...(category ? { category } : {}), ...(district ? { district } : {}) },
  }).then((r) => r.data);
