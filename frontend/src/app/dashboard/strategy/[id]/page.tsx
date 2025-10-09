'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ArrowLeft, Calendar, Users, Award, Info, Activity, TrendingUp, Code, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useAuth } from '@/lib/auth'
import { SubscribeModal } from '@/components/strategy/subscribe-modal'

interface StrategyData {
  id: string
  name: string
  code: string
  description?: string
  author: string
  version: string
  isActive: boolean
  isPublic: boolean
  isMarketplace: boolean
  subscriberCount: number
  tags: string
  executionConfig?: {
    symbol: string
    resolution: string
    lookbackPeriod?: number
  }
  createdAt: string
  updatedAt: string
}

interface UserSubscription {
  strategyId: string
  isActive: boolean
  isPaused: boolean
}

const StrategyHeader = ({
  strategy,
  onBack,
  onSubscribe,
  userSubscription
}: {
  strategy: StrategyData
  onBack: () => void
  onSubscribe: () => void
  userSubscription?: UserSubscription
}) => {
  return (
    <div className="space-y-6">
      {/* Navigation */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="hover:bg-secondary/80 transition-all duration-200 hover:scale-105"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Strategies
        </Button>
      </div>

      {/* Hero Section */}
      <Card className="border-border/50 shadow-lg hover:shadow-xl transition-all duration-300">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="space-y-2">
                  <h1 className="text-3xl font-bold text-foreground">
                    {strategy.name}
                  </h1>
                  <p className="text-muted-foreground font-mono text-sm">{strategy.code}</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {strategy.isActive ? (
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">Active</Badge>
                  ) : (
                    <Badge variant="secondary">Inactive</Badge>
                  )}
                  {strategy.isPublic && (
                    <Badge variant="outline">Public</Badge>
                  )}
                  {strategy.isMarketplace && (
                    <Badge variant="outline" className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                      Marketplace
                    </Badge>
                  )}
                </div>
              </div>

              <p className="text-muted-foreground leading-relaxed">
                {strategy.description || 'No description provided'}
              </p>

              {strategy.tags && (
                <div className="flex flex-wrap gap-2">
                  {strategy.tags.split(',').map((tag, index) => (
                    <Badge key={index} variant="secondary" className="text-xs hover:bg-primary/10 transition-colors">
                      {tag.trim()}
                    </Badge>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm text-muted-foreground pt-2">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span>Created {new Date(strategy.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  <span>{strategy.subscriberCount} subscriber{strategy.subscriberCount !== 1 ? 's' : ''}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Award className="h-4 w-4" />
                  <span>By {strategy.author}</span>
                </div>
              </div>
            </div>

            {/* Quick Info & Actions */}
            <div className="space-y-4">
              <div className="space-y-3 bg-secondary/20 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <Code className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Version</span>
                </div>
                <p className="text-xl font-semibold">v{strategy.version}</p>
              </div>

              {strategy.executionConfig && (
                <div className="space-y-3 bg-secondary/20 rounded-lg p-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Trading Pair</span>
                  </div>
                  <p className="text-xl font-semibold">{strategy.executionConfig.symbol}</p>
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span className="text-muted-foreground">{strategy.executionConfig.resolution}m candles</span>
                  </div>
                </div>
              )}

              <Separator />

              {/* Subscription Status */}
              {userSubscription && (
                <div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-blue-700 dark:text-blue-300">Your Subscription</span>
                    <Badge
                      className={userSubscription.isPaused ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'}
                      variant="secondary"
                    >
                      {userSubscription.isPaused ? 'Paused' : 'Active'}
                    </Badge>
                  </div>
                </div>
              )}

              <div className="space-y-2 pt-2">
                {userSubscription ? (
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => window.location.href = '/dashboard/subscriptions'}
                  >
                    Manage Subscription
                  </Button>
                ) : (
                  <Button
                    className="w-full bg-primary hover:bg-primary/90 transition-all hover:scale-105"
                    onClick={onSubscribe}
                  >
                    Subscribe to Strategy
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function StrategyDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { token } = useAuth()
  const [strategy, setStrategy] = useState<StrategyData | null>(null)
  const [userSubscription, setUserSubscription] = useState<UserSubscription | null>(null)
  const [loading, setLoading] = useState(true)
  const [subscribeModalOpen, setSubscribeModalOpen] = useState(false)

  useEffect(() => {
    fetchStrategy()
  }, [params.id, token])

  const fetchStrategy = async () => {
    try {
      setLoading(true)
      const strategyId = params.id as string

      // Fetch strategy details
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/strategy-upload/strategies/${strategyId}`,
        {
          headers: token ? {
            'Authorization': `Bearer ${token}`,
          } : {},
        }
      )

      if (response.ok) {
        const data = await response.json()
        setStrategy(data.strategy)

        // Check if user is subscribed to this strategy
        if (token && data.strategy) {
          await checkSubscription(data.strategy.id)
        }
      }
    } catch (error) {
      console.error('Failed to fetch strategy:', error)
    } finally {
      setLoading(false)
    }
  }

  const checkSubscription = async (strategyId: string) => {
    if (!token) return

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/strategies/subscriptions`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      )

      if (response.ok) {
        const data = await response.json()
        const subscription = data.subscriptions?.find((sub: { strategyId: string; isActive: boolean; isPaused: boolean }) => sub.strategyId === strategyId)

        if (subscription) {
          setUserSubscription({
            strategyId: subscription.strategyId,
            isActive: subscription.isActive,
            isPaused: subscription.isPaused,
          })
        }
      }
    } catch (error) {
      console.error('Failed to check subscription:', error)
    }
  }

  const handleBack = () => {
    router.push('/dashboard/strategies')
  }

  const handleSubscribe = () => {
    setSubscribeModalOpen(true)
  }

  const handleSubscribeSuccess = () => {
    if (strategy) {
      checkSubscription(strategy.id)
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    )
  }

  if (!strategy) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
          <h2 className="text-xl font-semibold">Strategy Not Found</h2>
          <p className="text-muted-foreground">The requested strategy could not be found.</p>
          <Button onClick={handleBack} variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Strategies
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6">
      <div className="space-y-8">
        <StrategyHeader
          strategy={strategy}
          onBack={handleBack}
          onSubscribe={handleSubscribe}
          userSubscription={userSubscription || undefined}
        />

        {/* Strategy Overview Section */}
        <section id="overview" className="scroll-mt-6">
          <Card className="border-border/50 shadow-md hover:shadow-lg transition-all duration-300">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Info className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-xl">About This Strategy</CardTitle>
                  <CardDescription>Detailed information and technical specifications</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 gap-6">
                <div className="space-y-6">
                  <div>
                    <p className="text-muted-foreground leading-relaxed">
                      {strategy.description || 'No detailed description provided for this strategy.'}
                    </p>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <h4 className="font-semibold flex items-center gap-2">
                      <Activity className="h-4 w-4" />
                      Strategy Information
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="bg-secondary/20 rounded-lg p-4">
                        <p className="text-sm font-medium text-muted-foreground mb-1">Status</p>
                        <Badge className={strategy.isActive ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" : ""}>
                          {strategy.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      <div className="bg-secondary/20 rounded-lg p-4">
                        <p className="text-sm font-medium text-muted-foreground mb-1">Visibility</p>
                        <Badge variant="outline">
                          {strategy.isPublic ? 'Public' : 'Private'}
                        </Badge>
                      </div>
                      {strategy.executionConfig && (
                        <>
                          <div className="bg-secondary/20 rounded-lg p-4">
                            <p className="text-sm font-medium text-muted-foreground mb-1">Trading Pair</p>
                            <p className="font-semibold">{strategy.executionConfig.symbol}</p>
                          </div>
                          <div className="bg-secondary/20 rounded-lg p-4">
                            <p className="text-sm font-medium text-muted-foreground mb-1">Resolution</p>
                            <p className="font-semibold">{strategy.executionConfig.resolution} minutes</p>
                          </div>
                          {strategy.executionConfig.lookbackPeriod && (
                            <div className="bg-secondary/20 rounded-lg p-4">
                              <p className="text-sm font-medium text-muted-foreground mb-1">Lookback Period</p>
                              <p className="font-semibold">{strategy.executionConfig.lookbackPeriod} candles</p>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Coming Soon Sections */}
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-lg text-muted-foreground">Performance Analytics Coming Soon</CardTitle>
            <CardDescription>
              Backtest results, performance charts, and trade analysis will be available in a future update.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      {/* Subscribe Modal */}
      {strategy && (
        <SubscribeModal
          open={subscribeModalOpen}
          onOpenChange={setSubscribeModalOpen}
          strategyId={strategy.id}
          strategyName={strategy.name}
          onSuccess={handleSubscribeSuccess}
        />
      )}
    </div>
  )
}