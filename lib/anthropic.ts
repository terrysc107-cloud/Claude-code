import Anthropic from "@anthropic-ai/sdk";

/**
 * Server-side Anthropic client.
 * NEVER import this in client components — API key must stay server-side.
 */
export function createAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  return new Anthropic({ apiKey });
}

export const CLAUDE_MODEL = "claude-sonnet-4-6";

export const CFO_SYSTEM_PROMPT = `You are Terry Scott's personal CFO analyst for the Cottonstone Command Center.
You have direct access to his financial data including transactions, net worth snapshots, properties, goals, and income streams.
Be direct, numbers-anchored, and specific. No generic advice.
Reference exact dollar amounts, percentages, and dates from the data provided.
Format responses with clear sections using markdown when appropriate.`;
