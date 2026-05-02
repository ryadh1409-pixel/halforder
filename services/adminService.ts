/**
 * Admin API for `foodTemplates` (mobile admin panel).
 */
import {
  addFoodTemplate,
  deleteFoodTemplate,
  fetchAllFoodTemplatesOnce,
  updateFoodTemplate,
} from './foodTemplates';
import type { FoodTemplate, FoodTemplateWrite } from '../types/food';

export { subscribeAllFoodTemplates as subscribeTemplates } from './foodTemplates';

export async function getAllTemplates(): Promise<FoodTemplate[]> {
  return fetchAllFoodTemplatesOnce();
}

export async function addTemplate(data: FoodTemplateWrite): Promise<string> {
  return addFoodTemplate(data);
}

export async function updateTemplate(
  id: string,
  data: FoodTemplateWrite,
): Promise<void> {
  return updateFoodTemplate(id, data);
}

export async function deleteTemplate(id: string): Promise<void> {
  return deleteFoodTemplate(id);
}
