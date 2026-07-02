import { useBuilderAgentAccess } from './use-builder-agent-access';

const CMS_AGENT_CREATE_ROUTE = '/cms/agents/create';
const BUILDER_AGENT_CREATE_ROUTE = '/agent-builder/agents/create';

export interface UseCanCreateAgentResult {
  canCreateAgent: boolean;
  createRoute: string;
  isLoading: boolean;
}

export const useCanCreateAgent = (): UseCanCreateAgentResult => {
  const { canAccessAgentBuilder, isLoading } = useBuilderAgentAccess();

  const createRoute = canAccessAgentBuilder ? BUILDER_AGENT_CREATE_ROUTE : CMS_AGENT_CREATE_ROUTE;

  return { canCreateAgent: true, createRoute, isLoading };
};
