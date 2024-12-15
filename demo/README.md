# Demo
## Prepare config

Type in root folder - `cp config.example.js config.js`. Edit config if needed.

## Start node 

Open 1st terminal, then type in root folder to run local node - `npm run node:localhost`.

## Deploy smart contracts

Open 2nd terminal, then type in root folder to deploy contracts to local node - `npm run deploy:dex:localhost`.

## UI

Move to demo folder and run UI - `npm run dev`


## Accounts

When local node starts, it shares 20 account private keys. These private keys are used in demo app.

First 5 accounts are reserved for system roles and topped up with USDT and BTC mocks in `dex-deploy.js` script.

0 - deployer
1 - alice
2 - bob
3 - matcher
4 - liquidator

Rest of accounts are available as session wallets.