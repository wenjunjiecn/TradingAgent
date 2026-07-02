import { AlertDialog } from '@mastra/playground-ui/components/AlertDialog';
import { Button } from '@mastra/playground-ui/components/Button';
import { toast } from '@mastra/playground-ui/utils/toast';
import { useNavigate } from 'react-router';
import { useStoredAgentMutations, useStoredAgentDependents } from '@/domains/agents/hooks/use-stored-agents';

const MAX_DEPENDENTS_SHOWN = 5;

type Variant = 'delete' | 'make-private';

const COPY: Record<
  Variant,
  {
    dependents: string;
    hidden: (n: number) => string;
  }
> = {
  delete: {
    dependents: 'This agent is used as a sub-agent by:',
    hidden: n =>
      n === 1
        ? '1 other private agent also references this agent.'
        : `${n} other private agents also reference this agent.`,
  },
  'make-private': {
    dependents: 'Making this agent private may break the following agents that use it as a sub-agent:',
    hidden: n =>
      n === 1
        ? '1 other private agent also references this agent and may stop working.'
        : `${n} other private agents also reference this agent and may stop working.`,
  },
};

interface AgentImpactWarningsProps {
  agentId: string;
  variant: Variant;
  enabled?: boolean;
}

const AgentImpactWarnings = ({ agentId, variant, enabled = true }: AgentImpactWarningsProps) => {
  const { data, isLoading, isError } = useStoredAgentDependents(agentId, { enabled });

  if (!enabled || isLoading || isError) return null;

  const dependents = data?.dependents ?? [];
  const hiddenCount = data?.hiddenCount ?? 0;

  if (dependents.length === 0 && hiddenCount === 0) return null;

  const copy = COPY[variant];
  const visible = dependents.slice(0, MAX_DEPENDENTS_SHOWN);
  const overflow = dependents.length - visible.length;

  return (
    <div data-testid="agent-impact-warnings" className="text-ui-sm text-neutral3">
      {dependents.length > 0 && (
        <div data-testid="agent-impact-dependents-warning">
          <p className="font-medium">{copy.dependents}</p>
          <ul className="mt-1 list-disc pl-5">
            {visible.map(dep => (
              <li key={dep.id} data-testid="agent-impact-dependent">
                {dep.name}
              </li>
            ))}
          </ul>
          {overflow > 0 && (
            <p data-testid="agent-impact-dependents-more" className="mt-1 text-icon-3">
              and {overflow} more
            </p>
          )}
        </div>
      )}
      {hiddenCount > 0 && (
        <p data-testid="agent-impact-hidden-warning" className={dependents.length > 0 ? 'mt-2' : ''}>
          {copy.hidden(hiddenCount)}
        </p>
      )}
    </div>
  );
};

interface DeleteAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId: string;
  agentName: string;
  onSuccess?: () => void;
}

export const DeleteAgentDialog = ({
  open,
  onOpenChange,
  agentId,
  agentName,
  onSuccess,
}: DeleteAgentDialogProps) => {
  const navigate = useNavigate();
  const { deleteStoredAgent } = useStoredAgentMutations(agentId);
  const { isLoading: isDependentsLoading } = useStoredAgentDependents(agentId, { enabled: open });

  const handleConfirm = async () => {
    try {
      await deleteStoredAgent.mutateAsync(undefined);
      toast.success('Agent deleted');
      onOpenChange(false);
      if (onSuccess) {
        onSuccess();
      } else {
        void navigate('/agents', { viewTransition: true });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete agent');
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Content data-testid="delete-agent-dialog">
        <AlertDialog.Header>
          <AlertDialog.Title>Delete agent?</AlertDialog.Title>
          <AlertDialog.Description>
            This permanently deletes &quot;{agentName}&quot; and removes its conversation history. This cannot be
            undone.
          </AlertDialog.Description>
        </AlertDialog.Header>
        <AlertDialog.Body className="pt-0">
          <AgentImpactWarnings agentId={agentId} variant="delete" enabled={open} />
        </AlertDialog.Body>
        <AlertDialog.Footer>
          <AlertDialog.Cancel disabled={deleteStoredAgent.isPending}>Cancel</AlertDialog.Cancel>
          <Button
            variant="primary"
            disabled={deleteStoredAgent.isPending || isDependentsLoading}
            onClick={() => void handleConfirm()}
          >
            {deleteStoredAgent.isPending ? 'Deleting…' : 'Delete agent'}
          </Button>
        </AlertDialog.Footer>
      </AlertDialog.Content>
    </AlertDialog>
  );
};
