export const dynamic = 'force-static'
export const revalidate = false

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
      'Open source AI-powered social media automation for newsletter creators. Turn your newsletter into 8 platform-optimized posts in seconds.',
    offers: {
      '@type': 'Offer',
      priceCurrency: 'USD',
      price: '0',
      description:
        'Free and open source - self-host on your own infrastructure',
    },
    creator: {
      '@type': 'Organization',
      name: 'Vibe Build Lab LLC',
      url: 'https://vibebuildlab.com',
    },
    license: 'https://opensource.org/licenses/MIT',
    codeRepository: 'https://github.com/vibebuildlab/postrail',
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
            Open source AI-powered automation for newsletter creators. Self-host
            and customize to your needs.
          </p>

          <div className="flex gap-4 items-center justify-center flex-col sm:flex-row mb-12">
            <a
              className="rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors text-lg font-medium h-12 px-8 flex items-center justify-center"
              href="https://github.com/vibebuildlab/postrail"
              target="_blank"
              rel="noopener noreferrer"
            >
              Fork on GitHub
            </a>
            <a
              className="rounded-full border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-lg h-12 px-8 flex items-center justify-center"
              href="https://github.com/vibebuildlab/postrail#installation"
              target="_blank"
              rel="noopener noreferrer"
            >
              Get Started
            </a>
          </div>

          <p className="text-sm text-gray-700 dark:text-gray-400">
            MIT License. Free forever. Built in under a week with AI-assisted
            development.
          </p>
        </div>

        {/* How It Works */}
        <section
          className="max-w-5xl mx-auto mt-20 w-full"
          aria-labelledby="how-it-works-heading"
        >
          <h2
            id="how-it-works-heading"
            className="text-3xl font-bold text-center mb-12"
          >
            How It Works
          </h2>
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
        </section>

        {/* Platforms */}
        <section
          className="max-w-4xl mx-auto mt-20 w-full"
          aria-labelledby="platforms-heading"
        >
          <h2
            id="platforms-heading"
            className="text-3xl font-bold text-center mb-8"
          >
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
        </section>

        {/* Open Source */}
        <section
          className="max-w-5xl mx-auto mt-20 w-full"
          aria-labelledby="opensource-heading"
        >
          <h2
            id="opensource-heading"
            className="text-3xl font-bold text-center mb-4"
          >
            Open Source
          </h2>
          <p className="text-center text-gray-700 dark:text-gray-400 mb-12">
            Self-host for free. Built in under a week with AI-assisted
            development.
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            {/* Self-Host */}
            <div className="border-2 border-blue-600 rounded-xl p-6 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
                MIT LICENSE
              </div>
              <h3 className="text-xl font-bold mb-2">Self-Host</h3>
              <p className="text-3xl font-bold mb-4">
                Free
                <span className="text-base font-normal text-gray-700 dark:text-gray-400">
                  {' '}
                  forever
                </span>
              </p>
              <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-400 mb-6">
                <li>Full source code</li>
                <li>All features included</li>
                <li>Deploy anywhere</li>
                <li>Modify as needed</li>
                <li>Community support</li>
              </ul>
              <a
                href="https://github.com/vibebuildlab/postrail"
                className="block text-center py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                target="_blank"
                rel="noopener noreferrer"
              >
                View on GitHub
              </a>
            </div>

            {/* Requirements */}
            <div className="border rounded-xl p-6 dark:border-gray-700">
              <h3 className="text-xl font-bold mb-2">What You Need</h3>
              <p className="text-3xl font-bold mb-4">
                ~$20
                <span className="text-base font-normal text-gray-700 dark:text-gray-400">
                  /mo
                </span>
              </p>
              <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-400 mb-6">
                <li>Supabase (free tier)</li>
                <li>Vercel/Netlify (free tier)</li>
                <li>Anthropic API (~$10-20/mo)</li>
                <li>Social platform OAuth</li>
                <li>Optional: Upstash Redis</li>
              </ul>
              <a
                href="https://github.com/vibebuildlab/postrail#installation"
                className="block text-center py-2 px-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                target="_blank"
                rel="noopener noreferrer"
              >
                Setup Guide
              </a>
            </div>

            {/* Built With VBL */}
            <div className="border rounded-xl p-6 dark:border-gray-700">
              <h3 className="text-xl font-bold mb-2">Built with VBL</h3>
              <p className="text-3xl font-bold mb-4">
                &lt;1 week
                <span className="text-base font-normal text-gray-700 dark:text-gray-400">
                  {' '}
                  build time
                </span>
              </p>
              <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-400 mb-6">
                <li>Production-ready code</li>
                <li>AI-assisted development</li>
                <li>Enterprise security</li>
                <li>Full test coverage</li>
                <li>Modern stack</li>
              </ul>
              <a
                href="https://vibebuildlab.com"
                className="block text-center py-2 px-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                target="_blank"
                rel="noopener noreferrer"
              >
                Learn More
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer
        className="py-8 px-6 border-t dark:border-gray-800"
        role="contentinfo"
      >
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-gray-700 dark:text-gray-400">
          <p>© 2025 Vibe Build Lab LLC. All rights reserved.</p>
          <div className="flex gap-6">
            <a
              href="https://github.com/vibebuildlab/postrail"
              className="hover:text-gray-900 dark:hover:text-gray-200"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
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
