import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function AuthCodeErrorPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow text-center">
        <div>
          <h2 className="text-3xl font-bold text-red-600">Authentication Error</h2>
          <p className="mt-4 text-gray-600">
            The magic link you clicked has expired or is invalid.
          </p>
          <p className="mt-2 text-sm text-gray-500">
            Magic links expire after 1 hour for security reasons.
          </p>
        </div>

        <div className="space-y-4">
          <div className="p-4 bg-blue-50 rounded-lg text-left">
            <h3 className="font-semibold text-sm text-blue-900 mb-2">What to do:</h3>
            <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
              <li>Return to the login page</li>
              <li>Request a new magic link</li>
              <li>Check your email immediately</li>
              <li>Click the link within 1 hour</li>
            </ul>
          </div>

          <Link href="/auth/login">
            <Button className="w-full">
              Back to Login
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
