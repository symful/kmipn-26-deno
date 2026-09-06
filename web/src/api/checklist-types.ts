export interface CategoryChecklistItem {
  item: string;
  required: boolean;
}
export interface CategoryChecklistTemplate {
  id?: string;
  version: number | null;
  items: CategoryChecklistItem[];
}
