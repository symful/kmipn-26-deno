import completenessTool from "./completeness";
import mediaQualityTool from "./mediaQuality";
import locationTimeConsistencyTool from "./locationTimeConsistency";
import classifyProblemTool from "./classifyProblem";
import duplicatesTool from "./duplicates";
import privacyRiskTool from "./privacyRisk";
import extractDamageTool from "./extractDamage";
import analyzeImageVisionTool from "./analyzeImageVision";

export const allTools = {
  assess_completeness: completenessTool,
  assess_media_quality: mediaQualityTool,
  assess_location_time_consistency: locationTimeConsistencyTool,
  classify_problem: classifyProblemTool,
  find_duplicates: duplicatesTool,
  detect_privacy_risk: privacyRiskTool,
  extract_damage_indicators: extractDamageTool,
  analyze_image_vision: analyzeImageVisionTool,
} as const;

export type ToolName = keyof typeof allTools;

export {
  completenessTool,
  mediaQualityTool,
  locationTimeConsistencyTool,
  classifyProblemTool,
  duplicatesTool,
  privacyRiskTool,
  extractDamageTool,
  analyzeImageVisionTool,
};

export type { CompletenessInput, CompletenessOutput } from "./completeness";
export type { MediaQualityInput, MediaQualityOutput } from "./mediaQuality";
export type { LocationTimeConsistencyInput, LocationTimeConsistencyOutput } from "./locationTimeConsistency";
export type { ClassifyProblemInput, ClassifyProblemOutput } from "./classifyProblem";
export type { DuplicatesInput, DuplicatesOutput } from "./duplicates";
export type { PrivacyRiskInput, PrivacyRiskOutput } from "./privacyRisk";
export type { ExtractDamageInput, ExtractDamageOutput } from "./extractDamage";
export type { AnalyzeImageVisionInput, AnalyzeImageVisionOutput } from "./analyzeImageVision";
