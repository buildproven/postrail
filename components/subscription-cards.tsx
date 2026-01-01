'use client'

import { Button } from '@/components/ui/button'

interface SubscriptionCardsProps {
  currentPlan?: string
}

export function SubscriptionCards({
  currentPlan = 'trial',
}: SubscriptionCardsProps) {
  const handleCheckout = async (tier: 'standard' | 'growth') => {
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        alert('Failed to start checkout')
      }
    } catch (e) {
      console.error(e)
      alert('Error starting checkout')
    }
  }

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <div className="p-4 border rounded hover:border-blue-300 transition-colors">
        <div className="flex justify-between items-start mb-2">
          <div>
            <p className="font-medium">Standard</p>
            <p className="text-2xl font-bold">
              $29<span className="text-sm font-normal">/mo</span>
            </p>
          </div>
        </div>
        <ul className="text-sm text-gray-600 space-y-1 mb-3">
          <li>50 generations/day</li>
          <li>Scheduling</li>
          <li>Basic analytics</li>
        </ul>
        <Button
          className="w-full"
          variant="outline"
          onClick={() => handleCheckout('standard')}
          disabled={currentPlan === 'standard'}
        >
          {currentPlan === 'standard' ? 'Current Plan' : 'Upgrade to Standard'}
        </Button>
      </div>

      <div className="p-4 border-2 border-blue-500 rounded">
        <div className="flex justify-between items-start mb-2">
          <div>
            <p className="font-medium">Growth</p>
            <p className="text-2xl font-bold">
              $59<span className="text-sm font-normal">/mo</span>
            </p>
          </div>
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
            BEST VALUE
          </span>
        </div>
        <ul className="text-sm text-gray-600 space-y-1 mb-3">
          <li>200 generations/day</li>
          <li>Advanced analytics</li>
          <li>API access + priority support</li>
        </ul>
        <Button
          className="w-full"
          onClick={() => handleCheckout('growth')}
          disabled={currentPlan === 'growth'}
        >
          {currentPlan === 'growth' ? 'Current Plan' : 'Upgrade to Growth'}
        </Button>
      </div>
    </div>
  )
}
