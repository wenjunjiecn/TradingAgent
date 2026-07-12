import { jsonLanguage } from '@codemirror/lang-json';
import type { MCPToolType } from '@mastra/core/mcp';
import { useCodemirrorTheme } from '@mastra/playground-ui/components/CodeEditor';
import { CopyButton } from '@mastra/playground-ui/components/CopyButton';
import { MainContentContent } from '@mastra/playground-ui/components/MainContent';
import { Tabs, Tab, TabList } from '@mastra/playground-ui/components/Tabs';
import { Button } from '@mastra/playground-ui/components/Button';
import { cn } from '@mastra/playground-ui/utils/cn';
import CodeMirror from '@uiw/react-codemirror';
import { useState, useMemo, useCallback } from 'react';
import type { ZodType } from 'zod';
import {
  RequestContextSchemaForm,
  SchemaRequestContextProvider,
  useSchemaRequestContext,
} from '@/domains/request-context';
import { ToolInformation } from '@/domains/tools/components/ToolInformation';
import { DynamicForm } from '@/lib/form';

interface ToolExecutorProps {
  isExecutingTool: boolean;
  zodInputSchema: ZodType;
  handleExecuteTool: (data: any, schemaRequestContext?: Record<string, any>) => void;
  executionResult: any;
  errorString?: string;
  toolDescription: string;
  toolId: string;
  toolType?: MCPToolType;
  requestContextSchema?: string;
  /** Raw JSON Schema object (if available) for complex schema detection */
  inputJsonSchema?: Record<string, any>;
}

/**
 * 检测 JSON Schema 是否包含表单生成器不支持的结构
 *
 * 不支持的结构: $ref, oneOf, anyOf, allOf, not, if/then/else
 */
function hasUnsupportedSchemaFeatures(schema: Record<string, any> | undefined): boolean {
  if (!schema) return false;
  const checkObj = (obj: any): boolean => {
    if (!obj || typeof obj !== 'object') return false;
    if ('$ref' in obj || 'oneOf' in obj || 'anyOf' in obj || 'allOf' in obj || 'not' in obj) return true;
    if ('if' in obj && ('then' in obj || 'else' in obj)) return true;
    // 递归检查 properties 和 items
    if (obj.properties) {
      for (const v of Object.values(obj.properties)) {
        if (checkObj(v)) return true;
      }
    }
    if (obj.items && checkObj(obj.items)) return true;
    if (obj.additionalProperties && typeof obj.additionalProperties === 'object') {
      if (checkObj(obj.additionalProperties)) return true;
    }
    return false;
  };
  return checkObj(schema);
}

type InputMode = 'form' | 'json';

/** Inner component that can access SchemaRequestContext */
const ToolExecutorContent = ({
  isExecutingTool,
  zodInputSchema,
  handleExecuteTool,
  result,
  errorString,
  toolDescription,
  toolId,
  toolType,
  requestContextSchema,
  inputJsonSchema,
}: Omit<ToolExecutorProps, 'executionResult'> & { result: any }) => {
  const theme = useCodemirrorTheme();
  const code = JSON.stringify(result ?? {}, null, 2);
  const [selectedTab, setSelectedTab] = useState('input-data');
  const { schemaValues } = useSchemaRequestContext();

  // 检测 Schema 复杂度，自动选择默认模式
  const schemaIsComplex = useMemo(() => hasUnsupportedSchemaFeatures(inputJsonSchema), [inputJsonSchema]);
  const [inputMode, setInputMode] = useState<InputMode>(schemaIsComplex ? 'json' : 'form');
  const [jsonInput, setJsonInput] = useState('{}');
  const [jsonError, setJsonError] = useState<string | null>(null);

  const handleJsonSubmit = useCallback(() => {
    try {
      const parsed = JSON.parse(jsonInput);
      setJsonError(null);
      handleExecuteTool(parsed, schemaValues);
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : 'Invalid JSON');
    }
  }, [jsonInput, handleExecuteTool, schemaValues]);

  return (
    <MainContentContent hasLeftServiceColumn={true} className="relative">
      <div className="bg-surface2 border-r border-border1 w-80 flex flex-col">
        <ToolInformation toolDescription={toolDescription} toolId={toolId} toolType={toolType} />
        <div className="flex-1 overflow-hidden border-t border-border1 flex flex-col">
          <Tabs defaultTab="input-data" value={selectedTab} onValueChange={setSelectedTab}>
            <TabList>
              <Tab value="input-data">Input Data</Tab>
              {requestContextSchema && <Tab value="request-context">Request Context</Tab>}
            </TabList>
          </Tabs>
          <div className={cn('p-5 overflow-y-auto', selectedTab !== 'input-data' && 'hidden')}>
            {/* 模式切换 */}
            <div className="flex items-center gap-2 mb-4">
              <Button
                variant={inputMode === 'form' ? 'primary' : 'secondary'}
                size="small"
                onClick={() => setInputMode('form')}
                disabled={schemaIsComplex}
              >
                Form
              </Button>
              <Button
                variant={inputMode === 'json' ? 'primary' : 'secondary'}
                size="small"
                onClick={() => setInputMode('json')}
              >
                JSON
              </Button>
              {schemaIsComplex && (
                <span className="text-ui-xs text-neutral3 ml-1">
                  Schema contains complex structures — JSON mode only
                </span>
              )}
            </div>

            {/* Form 模式 */}
            {inputMode === 'form' && !schemaIsComplex && (
              <DynamicForm
                isSubmitLoading={isExecutingTool}
                schema={zodInputSchema}
                onSubmit={data => {
                  handleExecuteTool(data, schemaValues);
                }}
                className="h-auto pb-7"
              />
            )}

            {/* JSON 模式 */}
            {inputMode === 'json' && (
              <div className="flex flex-col gap-3">
                <CodeMirror
                  value={jsonInput}
                  onChange={val => {
                    setJsonInput(val);
                    setJsonError(null);
                  }}
                  theme={theme}
                  extensions={[jsonLanguage]}
                  height="300px"
                />
                {jsonError && (
                  <p className="text-ui-sm text-error" data-testid="json-input-error">
                    {jsonError}
                  </p>
                )}
                <Button
                  variant="primary"
                  disabled={isExecutingTool}
                  onClick={() => void handleJsonSubmit()}
                >
                  {isExecutingTool ? 'Executing…' : 'Execute'}
                </Button>
              </div>
            )}
          </div>
          {requestContextSchema && (
            <div className={cn('p-5 overflow-y-auto', selectedTab !== 'request-context' && 'hidden')}>
              <RequestContextSchemaForm requestContextSchema={requestContextSchema} />
            </div>
          )}
        </div>
      </div>
      <div className="absolute top-4 right-4 z-10">
        <CopyButton content={code} tooltip="Copy JSON result to clipboard" />
      </div>
      <div className="p-5 h-full relative overflow-x-auto overflow-y-auto">
        <CodeMirror value={errorString || code} editable={true} theme={theme} extensions={[jsonLanguage]} />
      </div>
    </MainContentContent>
  );
};

const ToolExecutor = ({
  isExecutingTool,
  zodInputSchema,
  handleExecuteTool,
  executionResult: result,
  errorString,
  toolDescription,
  toolId,
  toolType,
  requestContextSchema,
  inputJsonSchema,
}: ToolExecutorProps) => {
  return (
    <SchemaRequestContextProvider>
      <ToolExecutorContent
        isExecutingTool={isExecutingTool}
        zodInputSchema={zodInputSchema}
        handleExecuteTool={handleExecuteTool}
        result={result}
        errorString={errorString}
        toolDescription={toolDescription}
        toolId={toolId}
        toolType={toolType}
        requestContextSchema={requestContextSchema}
        inputJsonSchema={inputJsonSchema}
      />
    </SchemaRequestContextProvider>
  );
};

export default ToolExecutor;
