export default function Home() {
  /**
   * SECURITY WARNING - JSON-LD XSS Risk:
   * This structured data is rendered using dangerouslySetInnerHTML to comply with
   * search engine requirements. ONLY hardcoded static data is safe to use here.
   *
   * DO NOT INCLUDE:
   * - User-generated content
   * - Data from URL parameters or query strings
   * - Database values that could contain user input
   * - Any external or dynamic data sources
   *
   * Any violation of this rule creates a critical XSS vulnerability where attackers
   * could inject malicious scripts that execute in victim browsers.
   *
   * Valid uses: Static application metadata (as shown below)
   * Invalid uses: User names, descriptions, reviews, or any dynamic content
   */
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Postrail',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web Browser',
    description:
      'AI-powered social media automation for newsletter creators. Turn your newsletter into 8 platform-optimized posts in seconds.',
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'USD',
      lowPrice: '29',
      highPrice: '59',
      offerCount: '2',
    },
    creator: {
      '@type': 'Organization',
      name: 'Vibe Build Lab LLC',
      url: 'https://vibebuildlab.com',
    },
  }

  return (
    <div className="min-h-screen flex flex-col font-[family-name:var(--font-geist-sans)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Skip Link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md"
      >
        Skip to main content
      </a>
      {/* Hero Section */}
      <main
        id="main-content"
        className="flex-1 flex flex-col items-center justify-center px-6 py-16 sm:py-24"
      >
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-6">
            Turn Your Newsletter Into
            <span className="block text-blue-600 dark:text-blue-400">
              8 Social Posts in Seconds
            </span>
          </h1>
          <p className="text-xl sm:text-2xl text-gray-700 dark:text-gray-400 mb-8 max-w-2xl mx-auto">
            AI generates platform-perfect posts for Twitter, LinkedIn, Facebook,
            and Threads. Connect once, post everywhere.
          </p>

          <div className="flex gap-4 items-center justify-center flex-col sm:flex-row mb-12">
            <a
              className="rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors text-lg font-medium h-12 px-8 flex items-center justify-center"
              href="/auth/signup"
            >
              Start Free Trial
            </a>
            <a
              className="rounded-full border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-lg h-12 px-8 flex items-center justify-center"
              href="/auth/login"
            >
              Log In
            </a>
          </div>

          <p className="text-sm text-gray-700 dark:text-gray-400">
            14-day free trial. No credit card required. 3 generations/day, 10
            total.
          </p>
        </div>

        {/* How It Works */}
        <div className="max-w-5xl mx-auto mt-20 w-full">
          <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center p-6">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  1
                </span>
              </div>
              <h3 className="text-xl font-semibold mb-2">Paste or Import</h3>
              <p className="text-gray-700 dark:text-gray-400">
                Drop in your newsletter content or import directly from
                Substack, Beehiiv, or any URL.
              </p>
            </div>
            <div className="text-center p-6">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  2
                </span>
              </div>
              <h3 className="text-xl font-semibold mb-2">AI Generates Posts</h3>
              <p className="text-gray-700 dark:text-gray-400">
                Claude AI creates 8 optimized posts: pre-launch teasers and
                post-publish highlights for each platform.
              </p>
            </div>
            <div className="text-center p-6">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  3
                </span>
              </div>
              <h3 className="text-xl font-semibold mb-2">Schedule & Publish</h3>
              <p className="text-gray-700 dark:text-gray-400">
                Review, edit if needed, then schedule or publish instantly to
                all connected platforms.
              </p>
            </div>
          </div>
        </div>

        {/* Platforms */}
        <div className="max-w-4xl mx-auto mt-20 w-full">
          <h2 className="text-3xl font-bold text-center mb-8">
            Connected Platforms
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            <div className="p-4 border rounded-lg dark:border-gray-700">
              <p className="font-semibold">Twitter/X</p>
              <p className="text-sm text-gray-700 dark:text-gray-400">
                280 chars
              </p>
            </div>
            <div className="p-4 border rounded-lg dark:border-gray-700">
              <p className="font-semibold">LinkedIn</p>
              <p className="text-sm text-gray-700 dark:text-gray-400">
                3,000 chars
              </p>
            </div>
            <div className="p-4 border rounded-lg dark:border-gray-700">
              <p className="font-semibold">Facebook</p>
              <p className="text-sm text-gray-700 dark:text-gray-400">
                63,206 chars
              </p>
            </div>
            <div className="p-4 border rounded-lg dark:border-gray-700">
              <p className="font-semibold">Threads</p>
              <p className="text-sm text-gray-700 dark:text-gray-400">
                500 chars
              </p>
            </div>
          </div>
        </div>

        {/* Pricing */}
        <div className="max-w-5xl mx-auto mt-20 w-full">
          <h2 className="text-3xl font-bold text-center mb-4">
            Simple Pricing
          </h2>
          <p className="text-center text-gray-700 dark:text-gray-400 mb-12">
            Start free, upgrade when you need more.
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            {/* Free Trial */}
            <div className="border rounded-xl p-6 dark:border-gray-700">
              <h3 className="text-xl font-bold mb-2">Free Trial</h3>
              <p className="text-3xl font-bold mb-4">
                $0
                <span className="text-base font-normal text-gray-700 dark:text-gray-400">
                  /14 days
                </span>
              </p>
              <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-400 mb-6">
                <li>3 generations per day</li>
                <li>10 generations total</li>
                <li>All 4 platforms</li>
                <li>Manual posting</li>
              </ul>
              <a
                href="/auth/signup"
                className="block text-center py-2 px-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Get Started
              </a>
            </div>

            {/* Standard */}
            <div className="border-2 border-blue-600 rounded-xl p-6 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
                POPULAR
              </div>
              <h3 className="text-xl font-bold mb-2">Standard</h3>
              <p className="text-3xl font-bold mb-4">
                $29
                <span className="text-base font-normal text-gray-700 dark:text-gray-400">
                  /mo
                </span>
              </p>
              <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-400 mb-6">
                <li>50 generations per day</li>
                <li>Unlimited total</li>
                <li>All 4 platforms</li>
                <li>Scheduling</li>
                <li>Basic analytics</li>
              </ul>
              <a
                href="/auth/signup"
                className="block text-center py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Start Trial
              </a>
            </div>

            {/* Growth */}
            <div className="border rounded-xl p-6 dark:border-gray-700">
              <h3 className="text-xl font-bold mb-2">Growth</h3>
              <p className="text-3xl font-bold mb-4">
                $59
                <span className="text-base font-normal text-gray-700 dark:text-gray-400">
                  /mo
                </span>
              </p>
              <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-400 mb-6">
                <li>200 generations per day</li>
                <li>Unlimited total</li>
                <li>All platforms + API access</li>
                <li>Advanced analytics</li>
                <li>Priority support</li>
              </ul>
              <a
                href="/auth/signup"
                className="block text-center py-2 px-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Start Trial
              </a>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-8 px-6 border-t dark:border-gray-800">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-gray-700 dark:text-gray-400">
          <p>© 2025 Vibe Build Lab LLC. All rights reserved.</p>
          <div className="flex gap-6">
            <a
              href="https://vibebuildlab.com/privacy-policy"
              className="hover:text-gray-900 dark:hover:text-gray-200"
            >
              Privacy
            </a>
            <a
              href="https://vibebuildlab.com/terms"
              className="hover:text-gray-900 dark:hover:text-gray-200"
            >
              Terms
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
