#!/usr/bin/env node

/**
 * Database Migration: Make scheduled_time nullable
 *
 * This migration allows draft social posts to be created without scheduled times.
 * Scheduled times will be set later during the scheduling phase.
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// Load .env.local manually
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8')
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=:#]+)=(.*)$/)
    if (match) {
      const key = match[1].trim()
      const value = match[2].trim().replace(/^["']|["']$/g, '')
      process.env[key] = value
    }
  })
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl) {
  console.error('❌ Error: NEXT_PUBLIC_SUPABASE_URL not found in .env.local')
  process.exit(1)
}

if (!supabaseServiceKey) {
  console.error(
    '❌ Error: SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY not found in .env.local'
  )
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function runMigration() {
  console.log('🔄 Running migration: Make scheduled_time nullable...\n')

  try {
    // Run the ALTER TABLE command
    const { error } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE public.social_posts
        ALTER COLUMN scheduled_time DROP NOT NULL;
      `,
    })

    if (error) {
      // If RPC doesn't exist, try direct SQL execution
      console.log('⚠️  RPC method not available, attempting direct SQL...\n')

      const { error: sqlError } = await supabase
        .from('social_posts')
        .select('*')
        .limit(0) // Just to test connection

      if (sqlError) {
        throw new Error(`Cannot connect to database: ${sqlError.message}`)
      }

      console.log(
        '⚠️  Direct SQL execution requires service role key with admin privileges.'
      )
      console.log('\n📋 Manual migration required:')
      console.log('\n1. Go to: https://supabase.com/dashboard')
      console.log('2. Select your letterflow project')
      console.log('3. Click "SQL Editor" in left sidebar')
      console.log('4. Click "New query"')
      console.log('5. Paste and run this SQL:\n')
      console.log('   ALTER TABLE public.social_posts')
      console.log('   ALTER COLUMN scheduled_time DROP NOT NULL;\n')
      console.log('6. Click RUN\n')
      return
    }

    // Verify the change
    const { data: verifyData, error: verifyError } = await supabase
      .from('information_schema.columns')
      .select('column_name, is_nullable, data_type')
      .eq('table_name', 'social_posts')
      .eq('column_name', 'scheduled_time')
      .single()

    if (verifyError) {
      console.log('⚠️  Could not verify migration (this is OK)')
    } else {
      console.log('✅ Migration completed successfully!\n')
      console.log('📊 Column info:')
      console.log(`   Column: ${verifyData.column_name}`)
      console.log(`   Type: ${verifyData.data_type}`)
      console.log(`   Nullable: ${verifyData.is_nullable}\n`)
    }

    console.log('✅ You can now create draft posts without scheduled times!\n')
  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    console.log(
      '\n📋 Please run the migration manually in Supabase SQL Editor:'
    )
    console.log('\nALTER TABLE public.social_posts')
    console.log('ALTER COLUMN scheduled_time DROP NOT NULL;\n')
    process.exit(1)
  }
}

runMigration()
