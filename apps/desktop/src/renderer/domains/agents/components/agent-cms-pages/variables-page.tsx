import { JSONSchemaForm, jsonSchemaToFields } from '@mastra/playground-ui/components/JSONSchemaForm';
import type { SchemaField } from '@mastra/playground-ui/components/JSONSchemaForm';
import { ScrollArea } from '@mastra/playground-ui/components/ScrollArea';
import type { JsonSchema } from '@mastra/playground-ui/utils/json-schema';
import { Plus, PlusIcon } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useWatch } from 'react-hook-form';

import { useAgentEditFormContext } from '../../context/agent-edit-form-context';

function RecursiveFieldRenderer({
  field,
  parentPath,
  depth,
  t,
}: {
  field: SchemaField;
  parentPath: string[];
  depth: number;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  return (
    <div className="py-2 ">
      <JSONSchemaForm.Field key={field.id} field={field} parentPath={parentPath} depth={depth}>
        <div className="space-y-2 px-2">
          <div className="flex flex-row gap-4 items-center">
            <JSONSchemaForm.FieldName placeholder={t('variables.variableNamePlaceholder')} className="w-64" />
            <JSONSchemaForm.FieldType placeholder={t('variables.typePlaceholder')} />
            <JSONSchemaForm.FieldOptional />
            <JSONSchemaForm.FieldNullable />
            <JSONSchemaForm.FieldRemove aria-label={t('variables.removeVariable')} />
          </div>
        </div>

        <JSONSchemaForm.NestedFields className="pl-2">
          <JSONSchemaForm.FieldList>
            {(nestedField, _idx, nestedContext) => (
              <RecursiveFieldRenderer
                key={nestedField.id}
                field={nestedField}
                parentPath={nestedContext.parentPath}
                depth={nestedContext.depth}
                t={t}
              />
            )}
          </JSONSchemaForm.FieldList>
          <JSONSchemaForm.AddField variant="ghost" size="sm" className="mt-2">
            <PlusIcon className="w-3 h-3 mr-1" />
            {t('variables.addNestedVariable')}
          </JSONSchemaForm.AddField>
        </JSONSchemaForm.NestedFields>
      </JSONSchemaForm.Field>
    </div>
  );
}

export function VariablesPage() {
  const { t } = useTranslation('agents');
  const { form, readOnly } = useAgentEditFormContext();
  const { control } = form;

  const watchedVariables = useWatch({ control, name: 'variables' });

  const handleVariablesChange = useCallback(
    (newSchema: JsonSchema) => {
      form.setValue('variables', newSchema, { shouldDirty: true });
    },
    [form],
  );

  const initialFields = useMemo(() => jsonSchemaToFields(watchedVariables), [watchedVariables]);

  return (
    <ScrollArea className="h-full">
      <section className="flex flex-col gap-6">
        <div className={readOnly ? 'pointer-events-none opacity-60' : ''}>
          <JSONSchemaForm.Root onChange={handleVariablesChange} defaultValue={initialFields} maxDepth={5}>
            <JSONSchemaForm.FieldList>
              {(field, _index, { parentPath, depth }) => (
                <RecursiveFieldRenderer key={field.id} field={field} parentPath={parentPath} depth={depth} t={t} />
              )}
            </JSONSchemaForm.FieldList>

            <div className="p-2">
              <JSONSchemaForm.AddField>
                <Plus />
                {t('variables.addVariable')}
              </JSONSchemaForm.AddField>
            </div>
          </JSONSchemaForm.Root>
        </div>
      </section>
    </ScrollArea>
  );
}
