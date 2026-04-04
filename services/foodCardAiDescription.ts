import Constants from 'expo-constants';
import OpenAI from 'openai';

function openAiApiKey(): string | undefined {
  const fromEnv =
    typeof process !== 'undefined'
      ? process.env?.EXPO_PUBLIC_OPENAI_API_KEY
      : undefined;
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const fromExtra =
    typeof extra?.openaiApiKey === 'string' ? extra.openaiApiKey : '';
  return (fromEnv || fromExtra || '').trim() || undefined;
}

/**
 * Short menu-style blurb for a swipe card (client-side, optional API key).
 */
export async function generateFoodCardAiDescription(input: {
  title: string;
  restaurantName: string;
  adminDescription?: string;
}): Promise<string | null> {
  const key = openAiApiKey();
  if (!key) return null;

  const title = input.title.trim();
  const restaurant = input.restaurantName.trim();
  const hint = (input.adminDescription ?? '').trim();

  try {
    const client = new OpenAI({
      apiKey: key,
      dangerouslyAllowBrowser: true,
    });
    const res = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You write concise food app card descriptions. 1–2 sentences, max 280 characters, appetizing but not claiming allergens or dietary facts. No markdown, no emojis unless one tasteful food emoji at end. Do not invent ingredients.',
        },
        {
          role: 'user',
          content: `Dish name: ${title}\nVenue: ${restaurant}${hint ? `\nNotes from venue: ${hint}` : ''}`,
        },
      ],
      max_tokens: 120,
      temperature: 0.65,
    });
    const text = res.choices[0]?.message?.content?.trim();
    if (text) return text.slice(0, 400);
  } catch (e) {
    console.warn('[foodCardAiDescription] OpenAI failed', e);
  }
  return null;
}
