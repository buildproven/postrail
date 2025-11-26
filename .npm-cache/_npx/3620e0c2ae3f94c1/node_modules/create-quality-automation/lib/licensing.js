/**
 * Licensing System for create-quality-automation
 * Handles free/pro/enterprise tier validation
 */

const fs = require('fs')
const path = require('path')
const os = require('os')

// License storage locations
const LICENSE_DIR = path.join(os.homedir(), '.create-quality-automation')
const LICENSE_FILE = path.join(LICENSE_DIR, 'license.json')

/**
 * License tiers
 *
 * Standardized to use SCREAMING_SNAKE_CASE for both keys and values
 * for consistency with ErrorCategory and other enums in the codebase.
 */
const LICENSE_TIERS = {
  FREE: 'FREE',
  PRO: 'PRO',
  ENTERPRISE: 'ENTERPRISE',
}

/**
 * Feature definitions by tier
 */
const FEATURES = {
  [LICENSE_TIERS.FREE]: {
    dependencyMonitoring: 'basic',
    languages: ['npm'],
    frameworkGrouping: false,
    customSchedules: false,
    advancedWorkflows: false,
    notifications: false,
    multiRepo: false,
    roadmap: [],
  },
  [LICENSE_TIERS.PRO]: {
    dependencyMonitoring: 'premium', // ✅ PREMIUM-001 IMPLEMENTED
    languages: ['npm'],
    frameworkGrouping: true, // ✅ PREMIUM-001: React, Vue, Angular, Svelte grouping
    customSchedules: false,
    advancedWorkflows: false,
    notifications: false,
    multiRepo: false,
    roadmap: [
      '✅ Framework-aware dependency grouping (React, Next.js, Vue, Angular) - LIVE',
      'Multi-language package monitoring (Python, Rust, Go, more) - Coming Q1 2026',
      'Advanced security audit workflows with custom schedules - Coming Q1 2026',
      'Breaking change detection reports before merging updates - Coming Q2 2026',
    ],
  },
  [LICENSE_TIERS.ENTERPRISE]: {
    dependencyMonitoring: 'premium', // ✅ PREMIUM-001 IMPLEMENTED
    languages: ['npm'],
    frameworkGrouping: true, // ✅ PREMIUM-001: React, Vue, Angular, Svelte grouping
    customSchedules: false,
    advancedWorkflows: false,
    notifications: false,
    multiRepo: false,
    roadmap: [
      '✅ Framework-aware dependency grouping (React, Next.js, Vue, Angular) - LIVE',
      'Multi-language package monitoring (Python, Rust, Go, more) - Coming Q1 2026',
      'Custom notification channels (Slack, Teams, email digests) - Coming Q2 2026',
      'Portfolio-wide dependency analytics and policy enforcement - Coming Q2 2026',
      'Dedicated support response targets with shared runbooks - Coming Q2 2026',
    ],
  },
}

/**
 * Check if user has a valid license file
 */
function getLicenseInfo() {
  try {
    if (!fs.existsSync(LICENSE_FILE)) {
      return { tier: LICENSE_TIERS.FREE, valid: true }
    }

    const licenseData = JSON.parse(fs.readFileSync(LICENSE_FILE, 'utf8'))

    // Validate license structure
    if (!licenseData.tier || !licenseData.key || !licenseData.email) {
      return {
        tier: LICENSE_TIERS.FREE,
        valid: true,
        error: 'Invalid license format',
      }
    }

    // Check expiration
    if (licenseData.expires && new Date(licenseData.expires) < new Date()) {
      return { tier: LICENSE_TIERS.FREE, valid: true, error: 'License expired' }
    }

    // Basic key validation (in real implementation, this would call a license server)
    if (validateLicenseKey(licenseData.key, licenseData.tier)) {
      return {
        tier: licenseData.tier,
        valid: true,
        email: licenseData.email,
        expires: licenseData.expires,
      }
    } else {
      return {
        tier: LICENSE_TIERS.FREE,
        valid: true,
        error: 'Invalid license key',
      }
    }
  } catch (error) {
    return {
      tier: LICENSE_TIERS.FREE,
      valid: true,
      error: `License read error: ${error.message}`,
    }
  }
}

/**
 * Basic license key validation (simplified for demo)
 * In production, this would validate against a license server
 */
function validateLicenseKey(key, tier) {
  // Simplified validation - in production use proper cryptographic verification
  const expectedPrefix = `CQA-${tier.toUpperCase()}-`
  return key.startsWith(expectedPrefix) && key.length > 20
}

/**
 * Check if a specific feature is available for current license
 */
function hasFeature(featureName) {
  const license = getLicenseInfo()
  const tierFeatures = FEATURES[license.tier] || FEATURES[LICENSE_TIERS.FREE]
  return tierFeatures[featureName] || false
}

/**
 * Get the dependency monitoring level for current license
 */
function getDependencyMonitoringLevel() {
  const license = getLicenseInfo()
  const tierFeatures = FEATURES[license.tier] || FEATURES[LICENSE_TIERS.FREE]
  return tierFeatures.dependencyMonitoring
}

/**
 * Get supported languages for current license
 */
function getSupportedLanguages() {
  const license = getLicenseInfo()
  const tierFeatures = FEATURES[license.tier] || FEATURES[LICENSE_TIERS.FREE]
  return tierFeatures.languages
}

/**
 * Display upgrade message for premium features
 */
function showUpgradeMessage(feature) {
  const license = getLicenseInfo()
  const tierFeatures = FEATURES[license.tier] || FEATURES[LICENSE_TIERS.FREE]

  console.log(`\n🔒 ${feature} is a premium feature`)
  console.log(`📊 Current license: ${license.tier.toUpperCase()}`)

  if (license.tier === LICENSE_TIERS.FREE) {
    console.log(
      '💰 Pro tier is in private beta; join the waitlist to shape the roadmap.'
    )
    console.log('   • Planned capabilities include:')
    FEATURES[LICENSE_TIERS.PRO].roadmap.forEach(item =>
      console.log(`     - ${item}`)
    )
    console.log('\n🚀 Join waitlist: https://create-quality-automation.dev/pro')
  } else if (license.tier === LICENSE_TIERS.PRO) {
    console.log('💼 Enterprise tier is preparing advanced governance tooling.')
    console.log('   • Planned enhancements include:')
    FEATURES[LICENSE_TIERS.ENTERPRISE].roadmap.forEach(item =>
      console.log(`     - ${item}`)
    )
    console.log(
      '\n🏢 Request beta access: https://create-quality-automation.dev/enterprise'
    )
  } else if (tierFeatures.roadmap && tierFeatures.roadmap.length) {
    console.log('🛠️ Premium roadmap items currently under development:')
    tierFeatures.roadmap.forEach(item => console.log(`   - ${item}`))
  }
}

/**
 * Save license information (for testing or license activation)
 */
function saveLicense(tier, key, email, expires = null) {
  try {
    if (!fs.existsSync(LICENSE_DIR)) {
      fs.mkdirSync(LICENSE_DIR, { recursive: true })
    }

    const licenseData = {
      tier,
      key,
      email,
      expires,
      activated: new Date().toISOString(),
    }

    fs.writeFileSync(LICENSE_FILE, JSON.stringify(licenseData, null, 2))
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

/**
 * Remove license (for testing)
 */
function removeLicense() {
  try {
    if (fs.existsSync(LICENSE_FILE)) {
      fs.unlinkSync(LICENSE_FILE)
    }
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

/**
 * Display current license status
 */
function showLicenseStatus() {
  const license = getLicenseInfo()

  console.log('\n📋 License Status:')
  console.log(`   Tier: ${license.tier.toUpperCase()}`)

  if (license.email) {
    console.log(`   Email: ${license.email}`)
  }

  if (license.expires) {
    console.log(`   Expires: ${license.expires}`)
  }

  if (license.error) {
    console.log(`   ⚠️  Issue: ${license.error}`)
  }

  console.log('\n🎯 Available Features:')
  const features = FEATURES[license.tier] || FEATURES[LICENSE_TIERS.FREE]
  console.log(`   Dependency Monitoring: ${features.dependencyMonitoring}`)
  console.log(`   Languages: ${features.languages.join(', ')}`)
  console.log(
    `   Framework Grouping: ${features.frameworkGrouping ? '✅' : '❌'}`
  )
  console.log(
    `   Advanced Workflows: ${features.advancedWorkflows ? '✅' : '❌'}`
  )

  if (features.roadmap && features.roadmap.length) {
    console.log('\n🛠️ Upcoming (beta roadmap):')
    features.roadmap.forEach(item => console.log(`   - ${item}`))
  }
}

module.exports = {
  LICENSE_TIERS,
  FEATURES,
  getLicenseInfo,
  hasFeature,
  getDependencyMonitoringLevel,
  getSupportedLanguages,
  showUpgradeMessage,
  saveLicense,
  removeLicense,
  showLicenseStatus,
}
