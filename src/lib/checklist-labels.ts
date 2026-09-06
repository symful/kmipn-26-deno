// Translations of configured baseline policy labels; never translate survey notes or change answer IDs.
const labels: Record<string, string> = {
  "Foto kondisi dari 3 sudut": "Photograph the condition from 3 angles",
  "Ukur perkiraan dimensi": "Measure approximate dimensions",
  "Tandai koordinat presisi": "Mark precise coordinates",
};
export function checklistLabelEn(item: string): string | null {
  return labels[item] ?? null;
}
