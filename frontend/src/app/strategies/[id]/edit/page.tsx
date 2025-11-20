'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Editor from '@monaco-editor/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiClient, ApiError } from '@/lib/api-client';
import { showErrorToast, showSuccessToast } from '@/lib/toast-utils';
import {
  Save,
  Edit as EditIcon,
  Eye,
  Play,
  ArrowLeft,
  FileCode,
  FileText,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type FileType = 'code' | 'requirements';

interface EditorData {
  code: string;
  requirements: string;
  strategyName: string;
  fileName: string;
}

export default function StrategyCodeEditorPage() {
  const params = useParams();
  const router = useRouter();
  const strategyId = params.id as string;

  const [editorData, setEditorData] = useState<EditorData>({
    code: '',
    requirements: '',
    strategyName: '',
    fileName: ''
  });
  const [currentFile, setCurrentFile] = useState<FileType>('code');
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runningBacktest, setRunningBacktest] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Cmd/Ctrl + S: Save
      if ((event.metaKey || event.ctrlKey) && event.key === 's') {
        event.preventDefault();
        if (isEditing && hasUnsavedChanges && !saving) {
          handleSave();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditing, hasUnsavedChanges, saving]);

  // Fetch strategy code and requirements
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [codeResponse, reqResponse] = await Promise.all([
          apiClient.get<{
            success: boolean;
            code: string;
            fileName: string;
            strategyName: string;
          }>(`/api/strategy-upload/${strategyId}/code`),
          apiClient.get<{
            success: boolean;
            requirements: string;
          }>(`/api/strategy-upload/${strategyId}/requirements`)
        ]);

        setEditorData({
          code: codeResponse.code,
          requirements: reqResponse.requirements,
          strategyName: codeResponse.strategyName,
          fileName: codeResponse.fileName
        });
      } catch (error) {
        if (error instanceof ApiError) {
          showErrorToast('Error', error.message);
        } else {
          showErrorToast('Error', 'Failed to load strategy files');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [strategyId]);

  const handleEditorChange = (value: string | undefined) => {
    if (!value) return;

    setHasUnsavedChanges(true);

    if (currentFile === 'code') {
      setEditorData(prev => ({ ...prev, code: value }));
    } else {
      setEditorData(prev => ({ ...prev, requirements: value }));
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      if (currentFile === 'code') {
        await apiClient.put(`/api/strategy-upload/${strategyId}/code`, {
          code: editorData.code
        });
        showSuccessToast('Success', 'Strategy code saved successfully');
      } else {
        await apiClient.put(`/api/strategy-upload/${strategyId}/requirements`, {
          requirements: editorData.requirements
        });
        showSuccessToast('Success', 'Requirements saved successfully');
      }

      setHasUnsavedChanges(false);
    } catch (error) {
      if (error instanceof ApiError) {
        showErrorToast('Error', error.message);
      } else {
        showErrorToast('Error', 'Failed to save changes');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleBacktest = async () => {
    try {
      setRunningBacktest(true);

      // First save any unsaved changes
      if (hasUnsavedChanges) {
        await handleSave();
      }

      // Trigger backtest via existing backtest endpoint
      const response = await apiClient.post<{
        success: boolean;
        backtestId: string;
      }>(`/api/strategy-upload/${strategyId}/backtest`, {
        strategyId
      });

      showSuccessToast('Success', 'Backtest started! Results will be available shortly.');

      // Redirect to backtest results page with flag to show backtest running message
      setTimeout(() => {
        router.push(`/dashboard/strategy/${strategyId}?backtestRunning=true`);
      }, 1500);
    } catch (error) {
      if (error instanceof ApiError) {
        showErrorToast('Error', error.message);
      } else {
        showErrorToast('Error', 'Failed to start backtest');
      }
    } finally {
      setRunningBacktest(false);
    }
  };


  const getCurrentFileContent = () => {
    return currentFile === 'code' ? editorData.code : editorData.requirements;
  };

  const getCurrentFileName = () => {
    return currentFile === 'code' ? editorData.fileName : 'requirements.txt';
  };

  const getLanguage = () => {
    return currentFile === 'code' ? 'python' : 'plaintext';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="max-w-[1800px] mx-auto mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/strategies')}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Strategies
            </Button>
            <div>
              <h1 className="text-3xl font-bold">{editorData.strategyName}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Strategy Code Editor
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {hasUnsavedChanges && (
              <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/50">
                Unsaved Changes
              </Badge>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(!isEditing)}
            >
              {isEditing ? (
                <>
                  <Eye className="h-4 w-4 mr-2" />
                  View Mode
                </>
              ) : (
                <>
                  <EditIcon className="h-4 w-4 mr-2" />
                  Edit Mode
                </>
              )}
            </Button>

            <Button
              onClick={handleSave}
              disabled={!isEditing || !hasUnsavedChanges || saving}
              size="sm"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save
                </>
              )}
            </Button>

            <Button
              onClick={handleBacktest}
              disabled={runningBacktest}
              size="sm"
              variant="default"
              className="bg-green-600 hover:bg-green-700"
            >
              {runningBacktest ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Run Backtest
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[1800px] mx-auto space-y-4">
        <Card className="border-2">
          <CardContent className="p-0">
            <div className="flex h-[calc(100vh-200px)]">
              {/* File Sidebar */}
              <div className="w-64 border-r bg-gray-50 dark:bg-gray-800/50">
                <div className="p-4">
                  <h3 className="text-sm font-semibold text-muted-foreground mb-3">
                    FILES
                  </h3>
                  <div className="space-y-2">
                    <button
                      onClick={() => setCurrentFile('code')}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                        currentFile === 'code'
                          ? 'bg-blue-500 text-white'
                          : 'hover:bg-gray-200 dark:hover:bg-gray-700'
                      )}
                    >
                      <FileCode className="h-4 w-4" />
                      <span className="truncate">{editorData.fileName}</span>
                    </button>

                    <button
                      onClick={() => setCurrentFile('requirements')}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                        currentFile === 'requirements'
                          ? 'bg-blue-500 text-white'
                          : 'hover:bg-gray-200 dark:hover:bg-gray-700'
                      )}
                    >
                      <FileText className="h-4 w-4" />
                      <span>requirements.txt</span>
                    </button>
                  </div>
                </div>

                {/* File Info */}
                <div className="border-t p-4 mt-4">
                  <div className="space-y-2 text-xs text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Current File:</span>
                      <span className="font-mono">{getCurrentFileName()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Lines:</span>
                      <span className="font-mono">
                        {getCurrentFileContent().split('\n').length}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Language:</span>
                      <span className="font-mono capitalize">{getLanguage()}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Monaco Editor */}
              <div className="flex-1">
                <Editor
                  height="100%"
                  language={getLanguage()}
                  value={getCurrentFileContent()}
                  onChange={handleEditorChange}
                  theme="vs-dark"
                  options={{
                    readOnly: !isEditing,
                    minimap: { enabled: true },
                    fontSize: 14,
                    lineNumbers: 'on',
                    roundedSelection: false,
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    tabSize: 4,
                    wordWrap: 'on',
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
