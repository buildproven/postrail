import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://postrail.buildproven.ai'

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/dashboard/', '/auth/callback'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
