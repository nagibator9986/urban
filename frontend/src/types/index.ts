// ==========================================================================
// AQYL CITY — frontend type definitions
// ==========================================================================

export type Mode = "public" | "business" | "eco";

// ---------- Facilities (public mode) ----------

export type FacilityType =
  | "school"
  | "hospital"
  | "clinic"
  | "kindergarten"
  | "pharmacy"
  | "park"
  | "police"
  | "fire_station"
  | "bus_stop";

export interface District {
  id: number;
  name_ru: string;
  name_kz: string | null;
  population: number | null;
  area_km2: number | null;
  density_per_km2: number | null;
}

export interface Facility {
  id: number;
  name: string | null;
  facility_type: FacilityType;
  source: string | null;
  address: string | null;
  lat: number;
  lon: number;
  district_id: number | null;
}

export interface GeoJSONFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    id: number;
    name: string | null;
    type: FacilityType;
    source: string | null;
    address: string | null;
    district_id: number | null;
  };
}

export interface GeoJSONCollection {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
}

export interface DistrictAnalytics {
  district_id: number;
  district_name: string;
  population: number;
  schools: number;
  hospitals: number;
  clinics: number;
  kindergartens: number;
  pharmacies: number;
  parks: number;
  police: number;
  fire_stations: number;
  bus_stops: number;
  schools_per_10k: number;
  hospitals_per_10k: number;
  clinics_per_10k: number;
  kindergartens_per_10k: number;
  pharmacies_per_10k: number;
}

export interface CoverageGap {
  district_name: string;
  facility_type: string;
  current_count: number;
  per_10k: number;
  city_avg_per_10k: number;
  deficit_percent: number;
  status: "critical" | "below_average" | "ok";
}

export interface CityOverview {
  total_population: number;
  districts: DistrictAnalytics[];
  coverage_gaps: CoverageGap[];
}

export const FACILITY_LABELS: Record<FacilityType, string> = {
  school: "Школы",
  hospital: "Больницы",
  clinic: "Поликлиники",
  kindergarten: "Детсады",
  pharmacy: "Аптеки",
  park: "Парки",
  police: "Полиция",
  fire_station: "Пожарные",
  bus_stop: "Остановки",
};

export const FACILITY_EMOJI: Record<FacilityType, string> = {
  school: "🎓",
  hospital: "🏥",
  clinic: "🩺",
  kindergarten: "🧸",
  pharmacy: "💊",
  park: "🌳",
  police: "🚓",
  fire_station: "🚒",
  bus_stop: "🚌",
};

export const FACILITY_COLORS: Record<FacilityType, string> = {
  school: "#38BDF8",
  hospital: "#EF4444",
  clinic: "#F97316",
  kindergarten: "#A855F7",
  pharmacy: "#22C55E",
  park: "#10B981",
  police: "#64748B",
  fire_station: "#DC2626",
  bus_stop: "#94A3B8",
};

// ---------- Stats ----------

export interface FacilityStatDetail {
  facility_type: string;
  label_ru: string;
  actual_count: number;
  norm_count: number;
  deficit: number;
  surplus: number;
  coverage_percent: number;
  actual_per_10k: number;
  norm_per_10k: number;
  total_capacity: number;
  needed_capacity: number;
  capacity_unit: string;
  source: string;
}

export interface DistrictStatDetail {
  district_id: number;
  district_name: string;
  population: number;
  facilities: FacilityStatDetail[];
  overall_score: number;
}

export interface CityStatDetail {
  total_population: number;
  total_facilities: number;
  overall_score: number;
  facilities: FacilityStatDetail[];
  districts: DistrictStatDetail[];
}

// ---------- Business ----------

export interface BusinessCategoryItem { value: string; label: string }

export interface BusinessCategories {
  groups: Record<string, BusinessCategoryItem[]>;
  all: BusinessCategoryItem[];
}

export interface BusinessDistrictStat {
  district_name: string;
  population: number;
  total_businesses: number;
  businesses_per_10k: number;
  categories: Record<string, number>;
}

export interface BusinessSummary {
  total_businesses: number;
  top_categories: { category: string; label: string; count: number }[];
  districts: BusinessDistrictStat[];
}

export interface CompetitionResult {
  category: string;
  radius_km: number;
  center: { lat: number; lon: number };
  competitors_count: number;
  competition_level: "low" | "medium" | "high";
  competitors: { id: number; name: string | null; lat: number; lon: number; address: string | null }[];
}

export interface BestLocation {
  district_name: string;
  score: number;
  population: number;
  existing_count: number;
  per_10k: number;
  city_avg_per_10k: number;
  suggested_lat: number;
  suggested_lon: number;
  reasons: string[];
}

export interface BusinessGeoJSON {
  type: "FeatureCollection";
  features: {
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: {
      id: number;
      name: string | null;
      category: string;
      address: string | null;
      phone: string | null;
      cuisine: string | null;
      opening_hours: string | null;
    };
  }[];
}

export const BUSINESS_COLORS: Record<string, string> = {
  restaurant: "#EF4444", cafe: "#F97316", bar: "#A855F7", fast_food: "#F59E0B",
  coffee_shop: "#92400E", bakery: "#D97706", grocery: "#22C55E",
  supermarket: "#16A34A", convenience: "#14B8A6", clothing: "#EC4899",
  electronics: "#3B82F6", beauty_salon: "#F472B6", barbershop: "#78350F",
  gym: "#F97316", hotel: "#F59E0B", bank: "#475569", atm: "#64748B",
  fuel: "#EAB308", car_wash: "#06B6D4", car_repair: "#334155",
  dentist: "#0EA5E9", pharmacy_biz: "#22C55E", mall: "#8B5CF6",
  nightclub: "#4C1D95", hookah: "#6B21A8", other: "#94A3B8",
};

// ---------- Eco ----------

export interface AqiCategory {
  level: "good" | "moderate" | "unhealthy_sensitive" | "unhealthy" | "very_unhealthy" | "hazardous";
  label: string;
  color: string;
  advice: string;
}

export interface Pollutant {
  label: string; value: number; unit: string; who_24h: number; over_who: number;
}

export interface EcoIssue {
  key: string; label: string; severity: number; severity_label: string; source: string;
}

export interface DistrictEco {
  district_name: string;
  population: number;
  aqi: number;
  aqi_category: AqiCategory;
  pollutants: Record<string, Pollutant>;
  green_m2_per_capita: number;
  green_norm: number;
  green_deficit_percent: number;
  traffic_per_1000: number;
  eco_score: number;
  eco_grade: string;
  issues: EcoIssue[];
  updated_at: string;
}

export interface CityEco {
  total_population: number;
  city_aqi: number;
  city_aqi_category: AqiCategory;
  city_green_m2_per_capita: number;
  city_green_norm: number;
  city_eco_score: number;
  districts: DistrictEco[];
  ranking: { district_name: string; aqi: number; eco_score: number; eco_grade: string }[];
  top_issues: (EcoIssue & { worst_district: string })[];
  updated_at: string;
}

// ---------- Eco: Forecast & Health ----------

export interface ForecastPoint {
  ts: string;
  aqi: number;
  level: string;
  label: string;
  color: string;
  main_driver: string;
}

export interface DailyForecast {
  date: string;
  avg_aqi: number;
  peak_aqi: number;
  peak_at: string;
  low_aqi: number;
  low_at: string;
  category: string;
  color: string;
}

export interface AqiWindow {
  date?: string;
  start: string;
  end: string;
  avg_aqi: number;
  label: string;
  kind?: "best" | "worst";
}

export interface EcoAlert {
  level: "high" | "medium";
  title: string;
  message: string;
}

export interface DistrictForecast {
  district: string;
  generated_at: string;
  hours: number;
  points: ForecastPoint[];
  daily: DailyForecast[];
  best_windows: AqiWindow[];
  worst_windows: AqiWindow[];
  alert: EcoAlert | null;
}

export interface HealthImpactItem {
  key: string;
  label: string;
  baseline_per_100k_year: number;
  extra_cases_per_100k_year: number;
  extra_percent: number;
  crf_per_10ug: number;
}

export interface HealthImpact {
  district: string;
  pm25_current: number;
  pm25_who_safe: number;
  pm25_excess: number;
  severity: "critical" | "high" | "moderate" | "low";
  impacts: HealthImpactItem[];
  methodology: string;
  updated_at: string;
}

export interface SourceItem {
  key: string;
  label: string;
  percent: number;
  color: string;
  description: string;
  aqi_contribution: number;
}

export interface SourceAttribution {
  district: string;
  current_aqi: number;
  current_category: string;
  season: "winter" | "summer";
  sources: SourceItem[];
  dominant_source: SourceItem;
  explanation: string;
  methodology: string;
  updated_at: string;
}

export interface WindowPeriod {
  from: string;
  to: string;
  hours: number;
  avg_aqi: number;
}

export interface WindowAdvice {
  district: string;
  day_avg_aqi: number;
  clean_windows: WindowPeriod[];
  dirty_windows: WindowPeriod[];
  advice_html: string;
  updated_at: string;
}

export interface PersonaInput {
  district: string;
  age_group: "child" | "teen" | "adult" | "senior";
  conditions: string[];
  activities: string[];
  commute: "car" | "public" | "walk" | "bike" | "none";
  smoker: boolean;
  has_purifier: boolean;
}

export interface PersonalBrief {
  district: string;
  risk_level: "critical" | "high" | "moderate" | "low";
  current_aqi: number;
  markdown: string;
  context: Record<string, unknown>;
  engine: string;
  generated_at: string;
}

// ---------- AI ----------

export interface ChatToolCall {
  tool: string;
  args: Record<string, unknown>;
  ok: boolean;
}

export interface ChatResponse {
  mode: Mode;
  answer: string;
  intent: string;
  focus_district?: string | null;
  tool_calls?: ChatToolCall[];
  generated_at: string;
  engine: string;
}

export interface AIReport {
  mode: Mode;
  title: string;
  markdown: string;
  summary: Record<string, unknown>;
  generated_at: string;
}

// ---------- Public advanced: 15-min city, compare, developer check ----------

export interface FifteenMinDistrict {
  district_id: number;
  district_name: string;
  score_15min: number;
  grade: string;
  covered_all_services_percent: number;
  by_service: Record<string, number>;
  grid_size: number;
  walk_radius_km: number;
}

export interface FifteenMinCity {
  city_avg_score: number;
  districts: FifteenMinDistrict[];
  methodology: string;
  generated_at: string;
}

export interface CompareDistrict {
  district_id: number;
  district_name: string;
  population: number;
  area_km2: number | null;
  density_per_km2: number | null;
  score_infrastructure: number;
  score_15min: number;
  aqi_baseline: number | null;
  green_m2_per_capita: number | null;
  traffic_per_1000: number | null;
  facilities_by_type: Record<string, {
    count: number; norm: number; coverage_percent: number; per_10k: number;
  }>;
  fifteen_min_by_service: Record<string, number>;
}

export interface CompareResult {
  districts: CompareDistrict[];
  leaders: Record<string, { district_id: number; value: number }>;
  generated_at: string;
}

export interface DeveloperCheckRequest {
  district: string;
  apartments: number;
  class_type: "economy" | "comfort" | "business" | "premium";
  has_own_school?: boolean;
  has_own_kindergarten?: boolean;
  has_own_clinic?: boolean;
}

export interface DeveloperCheckReport {
  district: string;
  current_population: number;
  new_residents: number;
  new_population: number;
  apartments: number;
  class_type: string;
  demographics: { kids_0_6: number; kids_6_18: number; chronic_patients: number };
  requirements: {
    facility_type: string; label: string;
    extra_facilities_needed: number; extra_facilities_rounded: number;
    extra_capacity_needed: number; capacity_unit: string;
    norm_per_10k: number; avg_capacity: number; typical_cost_usd: string;
  }[];
  score_impact: {
    before: number; after_no_mitigation: number; after_with_mitigation: number;
    delta_no_mitigation: number; delta_with_mitigation: number;
  };
  mitigations: { type: string; count: number }[];
  risk: { level: "low" | "medium" | "high"; label: string };
  recommendations: string[];
  generated_at: string;
}

// ---------- Futures (Болашақ) ----------

export interface FuturesScenarioInput {
  horizon_years: number;
  name: string;
  birth_rate_multiplier: number;
  migration_multiplier: number;
  death_rate_multiplier: number;
  school_build_rate: number;
  kindergarten_build_rate: number;
  clinic_build_rate: number;
  pharmacy_build_rate: number;
  park_build_rate: number;
  transport_build_rate: number;
  new_apartments_per_year: number;
  auto_growth_rate: number;
  gas_conversion_target: number;
  brt_coverage_target: number;
  green_growth_rate: number;
  income_growth_per_year: number;
}

export interface PopulationPoint {
  year: number;
  population: number;
  age_0_6: number;
  age_6_18: number;
  age_18_65: number;
  age_65: number;
  dependency_ratio: number;
  births?: number;
  deaths?: number;
  migration?: number;
}

export interface InfraByType {
  facility_type: string;
  label: string;
  built: number;
  needed: number;
  deficit: number;
  coverage_percent: number;
  capacity_deficit: number;
  capacity_unit: string;
}

export interface InfraPoint {
  year: number;
  infra_score: number;
  by_type: Record<string, InfraByType>;
}

export interface EcoPoint {
  year: number;
  aqi: number;
  green_m2_per_capita: number;
  auto_park_growth_factor: number;
  gas_conversion_percent: number;
  brt_coverage_percent: number;
  eco_score: number;
}

export interface BusinessPoint {
  year: number;
  estimated_businesses: number;
  market_capacity: number;
  market_gap: number;
  businesses_per_10k: number;
  income_index: number;
}

export interface CriticalPoint {
  year: number;
  kind: string;
  severity: "high" | "medium" | "low";
  label: string;
  description: string;
}

export interface FuturesForecast {
  scenario_name: string;
  horizon_years: number;
  scenario_params: FuturesScenarioInput;
  final_year: number;
  final_population: number;
  population_delta: number;
  population_series: PopulationPoint[];
  infrastructure_series: InfraPoint[];
  eco_series: EcoPoint[];
  business_series: BusinessPoint[];
  critical_points: CriticalPoint[];
  overall_future_score: number;
  overall_grade: string;
  comparison_to_today: {
    infra_delta: number;
    eco_delta: number;
    population_growth_percent: number;
  };
  ai_analysis?: {
    markdown: string;
    engine: string;
    generated_at: string;
  };
  generated_at: string;
}

export interface FuturesPreset {
  key: string;
  horizon_years: number;
  name: string;
  [k: string]: unknown;
}

// ---------- Futures advanced (meta / compare / sensitivity / optimize / chat) ----------

export interface FuturesParamMeta {
  key: keyof FuturesScenarioInput | "horizon_years";
  group: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  baseline: number;
  tip: string;
  kind?: "int";
  percent?: boolean;
}

export interface FuturesParamsMetaResponse {
  params: FuturesParamMeta[];
}

export interface FuturesCompareYearRow {
  year: number;
  a_population: number;
  b_population: number;
  a_infra_score: number;
  b_infra_score: number;
  a_aqi: number;
  b_aqi: number;
  a_eco_score: number;
  b_eco_score: number;
}

export interface FuturesScenarioSummary {
  scenario_name: string;
  horizon_years: number;
  final_year: number;
  final_population: number;
  overall_future_score: number;
  overall_grade: string;
  comparison_to_today: {
    infra_delta: number;
    eco_delta: number;
    population_growth_percent: number;
  };
  final_infra_score: number;
  final_aqi: number;
  final_eco_score: number;
  final_green_m2: number;
  final_brt_coverage: number;
  final_dependency_ratio: number;
  final_businesses: number;
  final_market_gap: number;
  critical_points_count: number;
  critical_points: CriticalPoint[];
}

export interface FuturesCompareResponse {
  a: FuturesForecast;
  b: FuturesForecast;
  a_summary: FuturesScenarioSummary;
  b_summary: FuturesScenarioSummary;
  by_year: FuturesCompareYearRow[];
  deltas: {
    score: number;
    infra: number;
    aqi: number;
    eco_score: number;
    population: number;
  };
  generated_at: string;
}

export interface FuturesCompareManyResponse {
  labels: string[];
  forecasts: FuturesForecast[];
  summaries: FuturesScenarioSummary[];
  by_year: Array<{ year: number } & Record<string, number>>;
  deltas_vs_base: Record<string, {
    score: number;
    infra: number;
    aqi: number;
    eco_score: number;
    population: number;
  }>;
  generated_at: string;
}

export interface FuturesSensitivityLever {
  key: string;
  label: string;
  group: string;
  delta_up_score: number;
  delta_down_score: number;
  delta_up_aqi: number;
  delta_down_aqi: number;
  delta_up_infra: number;
  delta_down_infra: number;
  impact_magnitude: number;
}

export interface FuturesSensitivityResponse {
  base_score: number;
  base_aqi: number;
  base_infra: number;
  delta_percent: number;
  levers: FuturesSensitivityLever[];
  generated_at: string;
}

export interface FuturesOptimizeGoal {
  target_score: number;
  target_aqi: number;
  target_infra: number;
  target_eco: number;
  weight_score: number;
  weight_aqi: number;
  weight_infra: number;
  weight_eco: number;
}

export interface FuturesOptimizeMetrics {
  fitness: number;
  final_score: number;
  final_aqi: number;
  final_infra: number;
  final_eco: number;
}

export interface FuturesOptimizeHistoryPoint extends FuturesOptimizeMetrics {
  iter: number;
  params?: FuturesScenarioInput;
}

export interface FuturesOptimizeResponse {
  goal: FuturesOptimizeGoal;
  iterations_run: number;
  best_scenario: FuturesScenarioInput;
  best_forecast_summary: FuturesScenarioSummary;
  best_forecast: FuturesForecast;
  best_metrics: FuturesOptimizeMetrics;
  history: FuturesOptimizeHistoryPoint[];
  generated_at: string;
}

export interface FuturesChatResponse {
  answer: string;
  engine: string;
  generated_at: string;
}

// ---------- Eco: Health Risk / Inversion / Sources-Map / Compare cities ----------

export interface HealthRiskOption {
  value: string;
  label: string;
  risk_points?: number;
  exposure_points?: number;
}

export interface HealthRiskMeta {
  age_groups: { value: string; label: string }[];
  conditions: HealthRiskOption[];
  activities: HealthRiskOption[];
  commute_modes: HealthRiskOption[];
}

export interface HealthRiskRequest {
  district: string;
  age_group: "child" | "teen" | "adult" | "senior";
  conditions: string[];
  activities: string[];
  commute: "car" | "public" | "walk" | "bike" | "none";
  smoker: boolean;
  has_purifier: boolean;
  wears_mask_n95: boolean;
  hours_outdoor_per_day: number;
}

export interface HealthRiskDriver {
  key: string;
  label: string;
  points: number;
  percent_of_score: number;
}

export interface HealthRiskResponse {
  district: string;
  score: number;
  severity: "low" | "moderate" | "high" | "critical";
  severity_label: string;
  raw_score_uncapped: number;
  breakdown: {
    age_baseline: number;
    chronic_conditions: number;
    pm25_exposure: number;
    activities_commute: number;
    lifestyle: number;
  };
  drivers: HealthRiskDriver[];
  exposure: {
    aqi: number;
    pm25: number;
    pm25_who_safe: number;
    pm25_excess: number;
    hours_outdoor_per_day: number;
    sensitivity_factor: number;
  };
  recommendations: string[];
  methodology: string;
  generated_at: string;
}

export interface InversionPoint {
  ts: string;
  t2m: number;
  t850hPa: number;
  delta_t: number;
  wind_speed_mps: number;
  pbl_height_m: number | null;
  humidity_percent: number | null;
  surface_pressure_hpa: number | null;
  inversion_score: number;
  severity: "low" | "moderate" | "high" | "critical";
  severity_label: string;
}

export interface InversionDaily {
  date: string;
  avg_inversion_score: number;
  max_inversion_score: number;
  hours_with_inversion: number;
}

export interface InversionForecast {
  city: string;
  generated_at: string;
  source: string;
  hours_requested: number;
  points: InversionPoint[];
  daily: InversionDaily[];
  worst_windows: {
    start: string; end: string; avg_score: number; severity: string;
  }[];
  summary: {
    total_inversion_hours: number;
    total_critical_hours: number;
    any_critical: boolean;
    alert_message: string;
  };
  methodology: string;
  error?: string;
}

export interface SourcesMapCategory {
  key: string;
  label: string;
  color: string;
  intensity: number;
  description: string;
}

export interface SourcesMapFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    source_key: string;
    label: string;
    color: string;
    intensity: number;
    name: string;
    osm_id?: number;
    osm_type?: string;
  };
}

export interface SourcesMapResponse {
  city: string;
  generated_at: string;
  source: string;
  total_features: number;
  by_category_count: Record<string, number>;
  categories: SourcesMapCategory[];
  features: SourcesMapFeature[];
  district_exposure: { district: string; counts: Record<string, number>; total_intensity: number }[];
  methodology: string;
  error?: string;
  warning?: string;
}

export interface CityCompareItem {
  city: string;
  country: string;
  lat: number;
  lon: number;
  pm25_annual: number;
  source_year: number;
  group: "polluted" | "comparable" | "clean" | "peer" | "self";
  group_label: string;
  group_color: string;
  aqi_approx: number;
  who_times_over: number;
  rank_by_pm25?: number;
  source_note: string;
}

export interface CitiesCompareResponse {
  almaty: CityCompareItem;
  cities: CityCompareItem[];
  all_ranked: CityCompareItem[];
  who_annual_guideline: number;
  groups: { key: string; label: string; color: string }[];
  rank_summary: {
    total: number;
    almaty_rank: number;
    cleaner_cities: number;
    dirtier_cities: number;
  };
  summary_html: string;
  methodology: string;
  generated_at: string;
}

// ---------- Business: Recommender / Area / Cannibalization / Time coverage / Spending ----------

export interface BizCategoryScore {
  category: string;
  label: string;
  score: number;
  components: {
    demand: number;
    supply_opportunity: number;
    competition: number;
    complementarity: number;
    eco_penalty: number;
    age_fit: number;
    income_bonus: number;
  };
  market: {
    existing_count: number;
    per_10k: number;
    city_avg_per_10k: number;
    benchmark_per_10k: number;
    potential_slots: number;
  };
  economics: {
    capex_min_usd?: number;
    capex_max_usd?: number;
    opex_monthly_usd?: number;
    revenue_per_m2_month_usd?: number;
    net_margin?: number;
  };
  reasons: string[];
}

export interface DistrictRecommendation {
  district: string;
  district_id: number | null;
  population: number;
  income_index: number;
  age_cohorts: { kids: number; youth: number; middle: number; senior: number };
  total_businesses: number;
  current_aqi: number | null;
  top: BizCategoryScore[];
  bottom: BizCategoryScore[];
  all_scored: BizCategoryScore[];
  group_scores: Record<string, number>;
  methodology: string;
  generated_at: string;
}

export interface BudgetRecommendationItem extends BizCategoryScore {
  district: string;
  population: number;
}

export interface BudgetRecommendation {
  picks: BudgetRecommendationItem[];
}

export interface SpendingPotentialDistrict {
  district: string;
  score: number;
  population: number;
  income_index: number;
  total_businesses: number;
  businesses_per_10k: number;
  bounds: [number, number, number, number] | null;
}

export interface SpendingPotentialResponse {
  districts: SpendingPotentialDistrict[];
  methodology: string;
  generated_at: string;
}

export interface AreaAnalysisResponse {
  center: { lat: number; lon: number };
  radius_km: number;
  area_km2: number;
  district: string | null;
  total_competitors: number;
  by_category: { category: string; label: string; count: number }[];
  dominant_categories: { category: string; label: string; count: number; percent: number }[];
  demography_estimate: {
    population_in_radius: number | null;
    basis: string;
    income_index_district: number | null;
    age_cohorts_district: { kids: number; youth: number; middle: number; senior: number } | null;
  };
  examples: {
    id: number; name: string | null; category: string;
    lat: number; lon: number; address: string | null; distance_km: number;
  }[];
  generated_at: string;
}

export interface CannibalizationCompetitor {
  id: number;
  name: string;
  lat: number;
  lon: number;
  address: string | null;
  distance_km: number;
  weight: number;
  cannibalized_share_percent: number;
}

export interface CannibalizationResponse {
  center: { lat: number; lon: number };
  category: string;
  capture_radius_km: number;
  competitors_in_radius: number;
  newcomer_market_share_percent: number;
  total_cannibalized_percent: number;
  risk: "low" | "medium" | "high";
  risk_label: string;
  competitors: CannibalizationCompetitor[];
  methodology: string;
  generated_at: string;
}

export interface TimeCoverageHeatmap {
  day_idx: number;
  day: string;
  hour: number;
  open_count: number;
  closed_count: number;
  open_share: number;
}

export interface BestLocationGridCell {
  row: number;
  col: number;
  lat: number;
  lon: number;
  district: string;
  conflict: number;
  complementary: number;
  population_proxy: number;
  income_index: number;
  score: number;
}

export interface BestLocationGridResponse {
  category: string;
  category_label: string;
  grid_size: number;
  capture_radius_km: number;
  district_filter: string | null;
  bbox: { lat_min: number; lat_max: number; lon_min: number; lon_max: number };
  lat_step: number;
  lon_step: number;
  total_cells: number;
  top: BestLocationGridCell[];
  cells: BestLocationGridCell[];
  methodology: string;
  generated_at: string;
}

export interface TimeCoverageResponse {
  category: string | null;
  district: string | null;
  parsed_businesses: number;
  skipped_no_hours: number;
  heatmap: TimeCoverageHeatmap[];
  by_hour_avg: { hour: number; avg_open: number; avg_open_share: number }[];
  top_niches: TimeCoverageHeatmap[];
  methodology: string;
  generated_at: string;
}

// ---------- Public: auto-plan, district geojson, sim PDF ----------

export interface AutoPlanResponse {
  district_id: number;
  district_name: string;
  population: number;
  target_score: number;
  reached_target: boolean;
  steps_taken: number;
  initial_score: number;
  final_score: number;
  additions: Record<string, number>;
  score_history: { step: number; score: number; added: Record<string, number> }[];
  facility_before: {
    facility_type: string; label: string;
    actual_count: number; coverage_percent: number; deficit: number;
  }[];
  facility_after: {
    facility_type: string; label: string;
    actual_count: number; coverage_percent: number; deficit: number;
  }[];
  capex_estimate: {
    lines: {
      facility_type: string; label: string; count: number;
      unit_capex_label: string; line_min_usd: number; line_max_usd: number;
    }[];
    total_min_usd: number;
    total_max_usd: number;
    currency: string;
  };
  methodology: string;
  generated_at: string;
}

export interface AutoPlanParetoPlan {
  key: "cheap" | "balanced" | "premium";
  label: string;
  description: string;
  target_score: number;
  color: string;
  reached_target: boolean;
  final_score: number;
  score_delta: number;
  additions: Record<string, number>;
  total_objects: number;
  steps_taken: number;
  capex_estimate: AutoPlanResponse["capex_estimate"];
}

export interface AutoPlanParetoResponse {
  district_id: number;
  district_name: string;
  population: number;
  current_score: number;
  plans: AutoPlanParetoPlan[];
  methodology: string;
  generated_at: string;
}

export interface DistrictGeoJSONFeature {
  type: "Feature";
  geometry: { type: string; coordinates: unknown };
  properties: {
    district_id: number;
    name_ru: string;
    name_kz: string | null;
    overall_score: number;
    population: number;
    area_km2: number | null;
    // Optional metrics (since 2026-04):
    aqi?: number | null;
    green_m2_per_capita?: number | null;
    traffic_per_1000?: number | null;
    eco_score?: number | null;
    businesses_per_10k?: number;
    fifteen_min_score?: number;
  };
}

export type ChoroplethMetric =
  | "overall_score"
  | "fifteen_min_score"
  | "eco_score"
  | "aqi"
  | "green_m2_per_capita"
  | "traffic_per_1000"
  | "businesses_per_10k"
  | "population";

export interface DistrictGeoJSON {
  type: "FeatureCollection";
  features: DistrictGeoJSONFeature[];
}

// ---------- Simulator ----------

export interface SimulationDelta {
  before: number; after: number; delta: number;
}

// ---------- Business Plan Generator ----------

export interface PlanFinance {
  capex_usd: number;
  opex_monthly_usd: number;
  revenue_m1_12_usd: number;
  revenue_m13_24_usd: number;
  gross_year_1_usd: number;
  net_year_1_usd: number;
  break_even_months: number;
  margin_net: number;
  rent_per_m2_usd: number;
}

export interface PlanSummary {
  category: string;
  category_label: string;
  district: string | null;
  capex_usd: number;
  opex_monthly_usd: number;
  break_even_months: number;
  net_year_1_usd: number;
  competition_level: "low" | "medium" | "high" | null;
  competitors_nearby: number | null;
}

export interface BusinessPlan {
  markdown: string;
  summary: PlanSummary;
  finance: PlanFinance;
  context: Record<string, unknown>;
  engine: string;
  generated_at: string;
  quota?: { remaining: number; tier: string };
}

export interface PlanQuota {
  tier: string;
  quota_per_hour: number;
  remaining: number;
  upgrade_url: string;
}

export interface PlanRequest {
  category: string;
  district?: string | null;
  budget_usd: number;
  area_m2: number;
  experience: "none" | "some" | "experienced";
  language?: "ru" | "kz" | "en";
  concept?: string;
}

export interface SimulationResult {
  district_id: number;
  district_name: string;
  population: number;
  before: { score: number; facilities: FacilityStatDetail[] };
  after: { score: number; facilities: FacilityStatDetail[] };
  delta_score: number;
  deltas_by_type: Record<string, SimulationDelta>;
  recommendations: {
    facility_type: string; label: string;
    still_needed: number; current_coverage_percent: number;
  }[];
}
