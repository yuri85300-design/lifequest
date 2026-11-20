'use strict';
const {test, expect}=require('@playwright/test');

test.beforeEach(async ({page})=>{
  const errors=[];
  page.on('pageerror', e=>errors.push(String(e)));
  await page.goto('/prime_v220_runtime.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#homeMenuBtn')).toBeVisible({timeout:15000});
  page.__smokeErrors=errors;
});
test.afterEach(async ({page})=>{
  expect(page.__smokeErrors||[], 'No uncaught JavaScript errors').toEqual([]);
});

test('main menu, missions, statistics and back navigation',async ({page})=>{
  await page.locator('#homeMenuBtn').click();
  await page.locator('[data-campaign]').click();
  await expect(page.getByText('Cinq contrats, une ascension')).toBeVisible();
  await expect(page.locator('[data-mission]')).toHaveCount(5);
  await expect(page.locator('[data-mission="4"]')).toBeDisabled();
  await page.locator('[data-nav="home"]').first().click();
  await page.locator('[data-nav="stats"]').first().click();
  await expect(page.getByText('Duels terminés')).toBeVisible();
});

test('deck library, setup and worker fallback do not crash',async ({page})=>{
  await page.locator('[data-nav="decks"]').first().click();
  await expect(page.getByText('Vos decks et archétypes')).toBeVisible();
  await page.locator('[data-nav="setup"]').first().click();
  await expect(page.locator('#mineDeck')).toBeVisible();
  await expect(page.locator('#enemyDeck')).toBeVisible();
  await expect(page.locator('#lvl')).toBeVisible();
});

test('tutorial progression is reachable',async ({page})=>{
  await page.locator('[data-tutorial-home]').click();
  for(let i=1;i<=4;i++){
    await expect(page.getByText(new RegExp('^'+i+' / 4'))).toBeVisible();
    await page.locator('[data-next]').click();
  }
  await expect(page.getByText('Vos decks et archétypes')).toBeVisible();
});

test('local challenge persists first leg without masquerading as PvP',async ({page})=>{
  await page.locator('[data-nav="challenge"]').first().click();
  await expect(page.getByText('Deux joueurs, une même épreuve')).toBeVisible();
  await page.locator('#challenger1').fill('Alpha');
  await page.locator('#challenger2').fill('Bravo');
  await page.locator('#beginChallenge').click();
  await expect(page.getByText('Au tour de Alpha')).toBeVisible();
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('[data-nav="challenge"]').first().click();
  await expect(page.getByText('Au tour de Alpha')).toBeVisible();
});

test('starting a real solo duel shows a playable hand',async ({page})=>{
  await page.locator('[data-nav="setup"]').first().click();
  await page.locator('#start').click();
  await expect(page.getByText('Votre main de départ')).toBeVisible({timeout:20000});
  await page.locator('[data-m="0"]').click();
  await expect(page.locator('.board .hand')).toBeVisible({timeout:20000});
  await expect(page.locator('.board .midrail')).toBeVisible();
  // The test verifies that engine setup reaches the board; a full interactive
  // human match still requires additional end-to-end gameplay tests.
});
