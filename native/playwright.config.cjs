const {defineConfig, devices}=require('@playwright/test');
module.exports=defineConfig({
  testDir:__dirname,
  testMatch:'pc_smoke.spec.cjs',
  timeout:45000,
  expect:{timeout:15000},
  retries:0,
  workers:1,
  use:{baseURL:'http://127.0.0.1:8765',trace:'retain-on-failure'},
  projects:[
    {name:'desktop-chromium',use:{...devices['Desktop Chrome'],viewport:{width:1280,height:800}}},
    {name:'mobile-chromium',use:{...devices['Desktop Chrome'],viewport:{width:390,height:844},isMobile:true,hasTouch:true}}
  ],
  webServer:{
    command:'python3 -m http.server 8765 --bind 127.0.0.1 --directory '+JSON.stringify(__dirname),
    url:'http://127.0.0.1:8765/prime_v220_runtime.html',
    reuseExistingServer:!process.env.CI,
    timeout:30000
  }
});
