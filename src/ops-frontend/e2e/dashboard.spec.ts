import { test, expect } from '@playwright/test'

test.describe('Dashboard E2E', () => {
  test('should show login page on first visit', async ({ page }) => {
    await page.goto('/')

    // Login page should be displayed
    await expect(page.locator('.login-page')).toBeVisible()
    await expect(page.locator('.login-card')).toBeVisible()
    await expect(page.locator('h1.login-title')).toHaveText('Smart Factory')
  })

  test('should login with valid credentials and show dashboard', async ({ page }) => {
    await page.goto('/')

    // Type credentials and submit
    await page.fill('input[placeholder="admin"]', 'admin')
    await page.fill('input[type="password"]', 'admin')
    await page.click('button[type="submit"]')

    // After successful login the dashboard should appear
    // (the app navigates away from login-page)
    await expect(page.locator('.login-page')).not.toBeVisible({ timeout: 10000 })
  })

  test('should show error on empty credentials', async ({ page }) => {
    await page.goto('/')

    // Click submit without filling fields
    await page.click('button[type="submit"]')

    // Error message should appear
    await expect(page.locator('.login-error')).toBeVisible()
    await expect(page.locator('.login-error')).toHaveText('Enter credentials')
  })
})
