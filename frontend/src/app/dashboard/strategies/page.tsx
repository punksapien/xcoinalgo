'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  Search,
  Plus,
  Code,
  Play,
  Pause,
  Trash2,
  Edit,
  FileText,
  Clock,
  User,
  TrendingUp
} from "lucide-react";

interface Strategy {
  id: string;
  name: string;
  code: string;
  description: string;
  author: string;
  version: string;
  isActive: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  latestDeployment?: {
    id: string;
    status: string;
    deployedAt: string;
  };
}

export default function StrategiesPage() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  useEffect(() => {
    fetchStrategies();
  }, [searchTerm, statusFilter]);

  const fetchStrategies = async () => {
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (statusFilter !== 'all') params.append('status', statusFilter);

      const response = await fetch(`/api/strategy-upload/my-strategies?${params}`);
      const data = await response.json();

      if (response.ok) {
        setStrategies(data.strategies || []);
      }
    } catch (error) {
      console.error('Failed to fetch strategies:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-green-100 text-green-800';
      case 'DEPLOYING': return 'bg-blue-100 text-blue-800';
      case 'STOPPED': return 'bg-gray-100 text-gray-800';
      case 'FAILED': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredStrategies = strategies.filter(strategy => {
    const matchesSearch = searchTerm === '' ||
      strategy.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      strategy.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      strategy.author.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' ||
      (statusFilter === 'active' && strategy.isActive) ||
      (statusFilter === 'inactive' && !strategy.isActive);

    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">My Strategies</h1>
          <p className="text-gray-600">
            Manage and deploy your trading strategies
          </p>
        </div>
        <Link href="/dashboard/strategies/upload">
          <Button className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Upload Strategy
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search strategies..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'active', 'inactive'] as const).map((status) => (
            <Button
              key={status}
              variant={statusFilter === status ? 'default' : 'outline'}
              onClick={() => setStatusFilter(status)}
              className="capitalize"
            >
              {status}
            </Button>
          ))}
        </div>
      </div>

      {/* Strategy Grid */}
      {filteredStrategies.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No strategies found</h3>
            <p className="text-gray-600 mb-4">
              {strategies.length === 0
                ? "Upload your first trading strategy to get started"
                : "No strategies match your current filters"
              }
            </p>
            {strategies.length === 0 && (
              <Link href="/dashboard/strategies/upload">
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Upload Your First Strategy
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredStrategies.map((strategy) => (
            <Card key={strategy.id} className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg mb-1">{strategy.name}</CardTitle>
                    <CardDescription className="line-clamp-2">
                      {strategy.description || 'No description provided'}
                    </CardDescription>
                  </div>
                  {strategy.isActive ? (
                    <Badge className="bg-green-100 text-green-800">Active</Badge>
                  ) : (
                    <Badge variant="secondary">Inactive</Badge>
                  )}
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Strategy Info */}
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Code className="h-4 w-4 text-gray-500" />
                    <span className="font-mono">{strategy.code}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-gray-500" />
                    <span>{strategy.author}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-gray-500" />
                    <span>v{strategy.version}</span>
                  </div>
                </div>

                {/* Latest Deployment Status */}
                {strategy.latestDeployment && (
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-700">Latest Deployment</span>
                      <Badge
                        className={getStatusColor(strategy.latestDeployment.status)}
                        variant="secondary"
                      >
                        {strategy.latestDeployment.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-gray-600">
                      {new Date(strategy.latestDeployment.deployedAt).toLocaleDateString()}
                    </div>
                  </div>
                )}

                {/* Tags */}
                {strategy.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {strategy.tags.slice(0, 3).map((tag, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                    {strategy.tags.length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{strategy.tags.length - 3}
                      </Badge>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  <Link href={`/dashboard/strategies/${strategy.id}`} className="flex-1">
                    <Button variant="outline" size="sm" className="w-full">
                      <FileText className="h-4 w-4 mr-1" />
                      View
                    </Button>
                  </Link>

                  {strategy.latestDeployment?.status === 'ACTIVE' ? (
                    <Button variant="outline" size="sm" className="flex-1">
                      <Pause className="h-4 w-4 mr-1" />
                      Stop
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" className="flex-1">
                      <Play className="h-4 w-4 mr-1" />
                      Deploy
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Quick Stats */}
      {strategies.length > 0 && (
        <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-500" />
                <div>
                  <div className="text-2xl font-bold">{strategies.length}</div>
                  <div className="text-sm text-gray-600">Total Strategies</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Play className="h-5 w-5 text-green-500" />
                <div>
                  <div className="text-2xl font-bold">
                    {strategies.filter(s => s.latestDeployment?.status === 'ACTIVE').length}
                  </div>
                  <div className="text-sm text-gray-600">Active Deployments</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Code className="h-5 w-5 text-purple-500" />
                <div>
                  <div className="text-2xl font-bold">
                    {strategies.filter(s => s.isActive).length}
                  </div>
                  <div className="text-sm text-gray-600">Active Strategies</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-orange-500" />
                <div>
                  <div className="text-2xl font-bold">
                    {new Set(strategies.map(s => s.author)).size}
                  </div>
                  <div className="text-sm text-gray-600">Authors</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}