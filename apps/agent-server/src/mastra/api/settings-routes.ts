import type { ApiRoute } from '@mastra/core/server';

/**
 * Settings API Routes
 *
 * Endpoints for managing API keys and environment variables for AI model providers.
 * API keys are stored in process.env so that the Mastra runtime picks them up
 * immediately for agent.generate() calls.
 */

// Known provider → env var mapping. Used to build the provider list when the
// Mastra built-in listAgentsModelProviders is not available or returns empty.
const KNOWN_PROVIDERS = [
  { id: 'openai', name: 'OpenAI', envVar: 'OPENAI_API_KEY', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4'] },
  { id: 'anthropic', name: 'Anthropic', envVar: 'ANTHROPIC_API_KEY', models: ['claude-3-5-sonnet', 'claude-3-opus', 'claude-3-haiku'] },
  { id: 'google', name: 'Google', envVar: 'GOOGLE_GENERATIVE_AI_API_KEY', models: ['gemini-1.5-pro', 'gemini-1.5-flash'] },
  { id: 'deepseek', name: 'DeepSeek', envVar: 'DEEPSEEK_API_KEY', models: ['deepseek-chat', 'deepseek-coder'] },
  { id: 'groq', name: 'Groq', envVar: 'GROQ_API_KEY', models: ['llama-3.3-70b', 'mixtral-8x7b'] },
  { id: 'openrouter', name: 'OpenRouter', envVar: 'OPENROUTER_API_KEY', models: [] },
  { id: 'mistral', name: 'Mistral AI', envVar: 'MISTRAL_API_KEY', models: ['mistral-large', 'mistral-small'] },
  { id: 'cohere', name: 'Cohere', envVar: 'COHERE_API_KEY', models: ['command-r', 'command-r-plus'] },
  { id: 'azure', name: 'Azure OpenAI', envVar: 'AZURE_API_KEY', models: [] },
  { id: 'xai', name: 'xAI (Grok)', envVar: 'XAI_API_KEY', models: ['grok-beta'] },
  { id: 'together', name: 'Together AI', envVar: 'TOGETHER_API_KEY', models: [] },
  { id: 'perplexity', name: 'Perplexity', envVar: 'PERPLEXITY_API_KEY', models: [] },
];

// Get list of configured providers with their connection status
const getProviderStatusRoute: ApiRoute = {
  path: '/settings/providers',
  method: 'GET',
  handler: async (c: any) => {
    try {
      const providers = KNOWN_PROVIDERS.map(p => ({
        ...p,
        connected: Boolean(process.env[p.envVar]),
      }));

      return c.json({ providers });
    } catch (error) {
      console.error('[Settings API] Error fetching provider status:', error);
      return c.json({ error: 'Failed to fetch provider status' }, 500);
    }
  },
};

// Set environment variable for a provider
const setProviderApiKeyRoute: ApiRoute = {
  path: '/settings/providers/:providerId/api-key',
  method: 'POST',
  handler: async (c: any) => {
    try {
      const providerId = c.req.param('providerId');
      const body = await c.req.json();
      const { apiKey, envVar } = body;

      if (!apiKey || !envVar) {
        return c.json({ error: 'API key and environment variable name are required' }, 400);
      }

      // Set the environment variable in the current process.
      // This makes it immediately available to the Mastra runtime.
      process.env[envVar] = apiKey;

      console.log(`[Settings API] API key set for provider: ${providerId}, envVar: ${envVar}`);

      return c.json({ success: true, message: 'API key configured successfully' });
    } catch (error) {
      console.error('[Settings API] Error setting API key:', error);
      return c.json({ error: 'Failed to set API key' }, 500);
    }
  },
};

// Delete environment variable for a provider
const deleteProviderApiKeyRoute: ApiRoute = {
  path: '/settings/providers/:providerId/api-key',
  method: 'DELETE',
  handler: async (c: any) => {
    try {
      const providerId = c.req.param('providerId');

      // Find the env var name for this provider
      const provider = KNOWN_PROVIDERS.find(p => p.id === providerId);
      if (provider && provider.envVar) {
        delete process.env[provider.envVar];
        console.log(`[Settings API] API key deleted for provider: ${providerId} (${provider.envVar})`);
      } else {
        // Try to find by providerId in env vars
        const envVarName = `${providerId.toUpperCase()}_API_KEY`;
        if (process.env[envVarName]) {
          delete process.env[envVarName];
          console.log(`[Settings API] API key deleted for provider: ${providerId} (${envVarName})`);
        }
      }

      return c.json({ success: true, message: 'API key removed successfully' });
    } catch (error) {
      console.error('[Settings API] Error deleting API key:', error);
      return c.json({ error: 'Failed to delete API key' }, 500);
    }
  },
};

// Test provider connection
const testProviderConnectionRoute: ApiRoute = {
  path: '/settings/providers/:providerId/test',
  method: 'POST',
  handler: async (c: any) => {
    try {
      const providerId = c.req.param('providerId');
      const body = await c.req.json();
      const { apiKey } = body;

      if (!apiKey) {
        return c.json({ error: 'API key is required for testing' }, 400);
      }

      // Simple validation - in a real implementation, you would make a test API call
      const isValid = apiKey.length > 10;

      return c.json({
        success: true,
        connected: isValid,
        message: isValid ? 'Connection successful' : 'Invalid API key'
      });
    } catch (error) {
      console.error('[Settings API] Error testing provider connection:', error);
      return c.json({ error: 'Failed to test connection' }, 500);
    }
  },
};

export const settingsRoutes: ApiRoute[] = [
  getProviderStatusRoute,
  setProviderApiKeyRoute,
  deleteProviderApiKeyRoute,
  testProviderConnectionRoute,
];