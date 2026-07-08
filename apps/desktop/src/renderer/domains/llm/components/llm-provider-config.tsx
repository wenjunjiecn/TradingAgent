import { Button } from '@mastra/playground-ui/components/Button';
import { Input } from '@mastra/playground-ui/components/Input';
import { Eye, EyeOff, Save, Plus, Trash2, AlertCircle } from 'lucide-react';
import { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Provider } from '@mastra/client-js';
import { useLLMProviders } from '../hooks/use-llm-providers';
import { useFilteredProviders } from '../hooks/use-filtered-providers';
import { useStudioConfig } from '@/domains/configuration/context/studio-config-state';

// Fallback provider list — used when the server returns an empty list or is unreachable.
// This ensures users can always configure API keys from the settings page.
const FALLBACK_PROVIDERS: Provider[] = [
  { id: 'openai', name: 'OpenAI', envVar: 'OPENAI_API_KEY', connected: false, models: [] },
  { id: 'anthropic', name: 'Anthropic', envVar: 'ANTHROPIC_API_KEY', connected: false, models: [] },
  { id: 'google', name: 'Google', envVar: 'GOOGLE_GENERATIVE_AI_API_KEY', connected: false, models: [] },
  { id: 'deepseek', name: 'DeepSeek', envVar: 'DEEPSEEK_API_KEY', connected: false, models: [] },
  { id: 'groq', name: 'Groq', envVar: 'GROQ_API_KEY', connected: false, models: [] },
  { id: 'openrouter', name: 'OpenRouter', envVar: 'OPENROUTER_API_KEY', connected: false, models: [] },
  { id: 'mistral', name: 'Mistral AI', envVar: 'MISTRAL_API_KEY', connected: false, models: [] },
  { id: 'cohere', name: 'Cohere', envVar: 'COHERE_API_KEY', connected: false, models: [] },
  { id: 'azure', name: 'Azure OpenAI', envVar: 'AZURE_API_KEY', connected: false, models: [] },
];

interface ProviderCredentials {
  providerId: string;
  envVar: string;
  value: string;
}

export function LLMProviderConfig() {
  const queryClient = useQueryClient();
  const { data: dataProviders, isLoading, isError: isProvidersError } = useLLMProviders();
  const { baseUrl, apiPrefix } = useStudioConfig();
  const [credentials, setCredentials] = useState<ProviderCredentials[]>([]);
  const [showValues, setShowValues] = useState<Record<string, boolean>>({});

  // Merge server-returned providers with fallback list.
  // Server providers take priority (they have accurate `connected` status);
  // fallback providers fill in any gaps so users can always configure keys.
  const allProviders = useMemo(() => {
    const serverProviders = dataProviders?.providers || [];
    const serverIds = new Set(serverProviders.map(p => p.id));
    const missing = FALLBACK_PROVIDERS.filter(p => !serverIds.has(p.id));
    return [...serverProviders, ...missing];
  }, [dataProviders]);

  const providers = useFilteredProviders(allProviders, '', false);

  // Build the full API base for settings routes
  const apiBase = `${baseUrl}${apiPrefix ?? '/api'}`;

  // Save API key mutation
  const saveApiKeyMutation = useMutation({
    mutationFn: async ({ providerId, apiKey, envVar }: { providerId: string; apiKey: string; envVar: string }) => {
      const response = await fetch(`${apiBase}/settings/providers/${providerId}/api-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, envVar }),
      });
      if (!response.ok) throw new Error('Failed to save API key');
      return response.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['provider-status'] });
      queryClient.invalidateQueries({ queryKey: ['llm-providers'] });
      setCredentials(prev => prev.filter(cred => cred.providerId !== variables.providerId));
    },
  });

  // Delete API key mutation
  const deleteApiKeyMutation = useMutation({
    mutationFn: async (providerId: string) => {
      const response = await fetch(`${apiBase}/settings/providers/${providerId}/api-key`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete API key');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['provider-status'] });
      queryClient.invalidateQueries({ queryKey: ['llm-providers'] });
    },
  });

  const handleAddCredential = (providerId: string, envVar: string) => {
    const newCredential: ProviderCredentials = {
      providerId,
      envVar,
      value: '',
    };
    setCredentials(prev => [...prev, newCredential]);
  };

  const handleUpdateCredential = (index: number, value: string) => {
    setCredentials(prev =>
      prev.map((cred, i) => (i === index ? { ...cred, value } : cred))
    );
  };

  const handleRemoveCredential = (index: number) => {
    setCredentials(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveCredential = async (credential: ProviderCredentials) => {
    saveApiKeyMutation.mutate({
      providerId: credential.providerId,
      apiKey: credential.value,
      envVar: credential.envVar,
    });
  };

  const toggleShowValue = (providerId: string) => {
    setShowValues(prev => ({ ...prev, [providerId]: !prev[providerId] }));
  };

  if (isLoading) {
    return <div className="text-neutral3">Loading providers...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="text-sm text-neutral3">
        Configure API keys for your AI model providers. These credentials will be stored
        securely and used for all agent operations.
      </div>

      {isProvidersError && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
          <AlertCircle className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
          <div className="text-xs text-yellow-700 dark:text-yellow-400">
            Could not fetch live provider status from the agent server. Showing a default
            list of providers — you can still configure API keys below.
          </div>
        </div>
      )}

      {providers.length === 0 ? (
        <div className="text-center py-8 text-neutral3">
          No model providers available. Make sure the agent server is running.
        </div>
      ) : (
        <div className="space-y-4">
          {providers.map(provider => {
            const existingCredential = credentials.find(
              cred => cred.providerId === provider.id
            );
            const envVarLabel = Array.isArray(provider.envVar)
              ? provider.envVar.join(', ')
              : provider.envVar || `${provider.id.toUpperCase()}_API_KEY`;
            const saveError = saveApiKeyMutation.error && saveApiKeyMutation.variables?.providerId === provider.id;

            return (
              <div
                key={provider.id}
                className="p-4 border border-border1 rounded-lg bg-surface1"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="font-medium text-neutral5">{provider.name}</div>
                    <div
                      className={`w-2 h-2 rounded-full ${
                        provider.connected ? 'bg-green-500' : 'bg-gray-400'
                      }`}
                      title={provider.connected ? 'Connected' : 'Not connected'}
                    />
                  </div>
                  {!provider.connected && !existingCredential && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAddCredential(provider.id, envVarLabel)}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Add API Key
                    </Button>
                  )}
                  {provider.connected && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => deleteApiKeyMutation.mutate(provider.id)}
                      disabled={deleteApiKeyMutation.isPending}
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Remove
                    </Button>
                  )}
                </div>

                <div className="text-xs text-neutral4 mb-2">
                  Environment Variable: <code className="bg-surface2 px-1 rounded">{envVarLabel}</code>
                </div>

                {existingCredential && (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input
                        type={showValues[provider.id] ? 'text' : 'password'}
                        value={existingCredential.value}
                        onChange={(e) => handleUpdateCredential(
                          credentials.indexOf(existingCredential),
                          e.target.value
                        )}
                        placeholder={`Enter ${envVarLabel}`}
                        className="flex-1"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleShowValue(provider.id)}
                      >
                        {showValues[provider.id] ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRemoveCredential(credentials.indexOf(existingCredential))}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleSaveCredential(existingCredential)}
                        disabled={!existingCredential.value.trim() || saveApiKeyMutation.isPending}
                      >
                        <Save className="w-4 h-4 mr-1" />
                        {saveApiKeyMutation.isPending ? 'Saving...' : 'Save'}
                      </Button>
                      {saveError && (
                        <span className="text-xs text-red-500">
                          Failed to save. Is the agent server running?
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {provider.connected && !existingCredential && (
                  <div className="text-xs text-green-600 mt-2">
                    ✓ API key is configured and working
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}