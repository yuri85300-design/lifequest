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
  // A human who wins the opening d20 may choose whether to play first;
  // the mulligan cannot appear until this mandatory choice is answered.
  const firstPlayerChoice=page.getByRole('dialog').getByRole('button',{name:'Oui',exact:true});
  await firstPlayerChoice.waitFor({state:'visible',timeout:2000}).catch(()=>{});
  if(await firstPlayerChoice.isVisible().catch(()=>false)) await firstPlayerChoice.click();
  await expect(page.getByText('Votre main de départ')).toBeVisible({timeout:20000});
  await page.locator('[data-m="0"]').click();
  await expect(page.locator('.board .hand')).toBeVisible({timeout:20000});
  await expect(page.locator('.board .midrail')).toBeVisible();
  // The test verifies that engine setup reaches the board; a full interactive
  // human match still requires additional end-to-end gameplay tests.
});

test('150-card library, filters and card details',async ({page})=>{
  await page.locator('[data-nav="cards"]').first().click();
  await expect(page.locator('[data-card]')).toHaveCount(150);
  await page.locator('#type').selectOption('Gear');
  await expect(page.locator('[data-card]')).toHaveCount(17);
  await page.locator('[data-card]').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('NIGHTMARE experimental training enabled without claiming certification',async ({page})=>{
  await page.locator('#homeMenuBtn').click();
  await page.locator('[data-lab]').click();
  await expect(page.locator('#labTrain')).toBeEnabled();
  await expect(page.locator('#labTrain')).toContainText('expérimentaux');
  await expect(page.locator('.lab-status')).toContainText('ne sont pas entièrement certifiés');
  await expect(page.locator('.lab-foot').filter({hasText:'Promotion compétitive verrouillée'})).toBeVisible();
  await expect(page.locator('#rivalToggle')).toBeVisible();
});

test('deck editor and rules screen are accessible',async ({page})=>{
  await page.locator('[data-nav="decks"]').first().click();
  await page.locator('#newDeck').click();
  await expect(page.locator('#deckName')).toHaveValue('Nouveau deck');
  await expect(page.locator('[data-slot]')).toHaveCount(3);
  await page.locator('[data-nav="decks"]').first().click();
  await page.locator('[data-nav="home"]').first().click();
  await page.locator('[data-nav="rules"]').first().click();
  await expect(page.getByText('Résumé des attaques et des Gigs')).toBeVisible();
});

test('collection advisor enters from main menu, imports quantities and persists',async ({page})=>{
  await page.locator('#homeMenuBtn').click();
  await page.locator('[data-collection]').click();
  await expect(page.getByText('Construis ton deck avec tes vraies cartes')).toBeVisible();
  await expect(page.locator('#collectionSave')).toHaveCount(0);
  await page.locator('#collectionImport').click();
  await page.locator('#ownedPaste').fill('2x mantis-blades\n1x corpo-security');
  await page.locator('#ownedApply').click();
  await expect(page.locator('.collection-count')).toContainText('3 exemplaires');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#homeMenuBtn').click();
  await page.locator('[data-collection]').click();
  await expect(page.locator('.collection-count')).toContainText('3 exemplaires');
  await page.locator('#collectionSearch').fill('Mantis Blades');
  await expect(page.locator('[data-own-count="mantis-blades"]')).toHaveText('2');
  await page.locator('[data-own-plus="mantis-blades"]').click();
  await expect(page.locator('[data-own-count="mantis-blades"]')).toHaveText('3');
});

test('collection advisor never invents owned cards and saves a fully owned legal deck',async ({page})=>{
  const status=await page.evaluate(()=>{
    const empty=CollectionAdvisor.suggest({},CARDS,presetDecks(),validateDeck,deckRamLimits);
    const starter=Object.values(presetDecks()).find(d=>d.official&&!validateDeck(d).length);
    if(!starter)throw Error('No legal official starter');
    const owned={};
    for(const id of [...starter.main,...starter.legends])owned[id]=(owned[id]||0)+1;
    const proposal=CollectionAdvisor.suggest(owned,CARDS,presetDecks(),validateDeck,deckRamLimits);
    localStorage.setItem('septgigs.collectionV1',JSON.stringify(owned));
    return {emptyPlayable:!!empty.ownedBest?.playable,sourceMissing:empty.closest?.missingCopies,
      legal:proposal.ownedBest?.playable,valid:proposal.ownedBest?validateDeck(proposal.ownedBest.deck):['missing'],
      count:proposal.ownedBest?.deck.main.length};
  });
  expect(status.emptyPlayable).toBe(false);
  expect(status.sourceMissing).toBeGreaterThan(0);
  expect(status.legal).toBe(true);
  expect(status.valid).toEqual([]);
  expect(status.count).toBe(40);
  await page.locator('#homeMenuBtn').click();
  await page.locator('[data-collection]').click();
  await expect(page.locator('#collectionSave')).toBeEnabled();
  await page.locator('#collectionSave').click();
  await expect(page.getByText('Vos decks et archétypes')).toBeVisible();
  const deck=await page.evaluate(()=>{
    const selected=JSON.parse(localStorage.getItem('septgigs.myDeck'));
    const decks=JSON.parse(localStorage.getItem('septgigs.decks'));
    return {selected,deck:decks[selected],errors:validateDeck(decks[selected])};
  });
  expect(deck.selected).toMatch(/^collection-/);
  expect(deck.deck.main).toHaveLength(40);
  expect(deck.errors).toEqual([]);
});

test('collection parser rejects unknown names and honors copy quantities',async ({page})=>{
  const parsed=await page.evaluate(()=>CollectionAdvisor.importText(
    '2x mantis-blades\n3x totally-fictional-card\ncorpo-security',
    CARDS,{'mantis-blades':1}));
  expect(parsed.owned['mantis-blades']).toBe(3);
  expect(parsed.owned['corpo-security']).toBe(1);
  expect(parsed.errors).toHaveLength(1);
  expect(parsed.owned['totally-fictional-card']).toBeUndefined();
});

test('synergy advice distinguishes ready combinations from missing components',async ({page})=>{
  const result=await page.evaluate(()=>{
    const owned={'netwatch-netdriver':1,'tetratronic-rippler':1,'goro-takemura-vengeful-bodyguard':1};
    return CollectionAdvisor.synergies(owned,CARDS,null).map(x=>({
      a:x.a,b:x.b,ready:x.ready,missing:x.missing
    }));
  });
  const netwatch=result.find(x=>x.a==='netwatch-netdriver');
  expect(netwatch.ready).toBe(true);
  expect(netwatch.missing).toEqual([]);
  const goro=result.find(x=>x.a==='goro-takemura-vengeful-bodyguard');
  expect(goro.ready).toBe(false);
  expect(goro.missing).toEqual(['corpo-security']);
});
