# Demo

Demo UI is working with localhost RPC Node `http://127.0.0.1:8555`. First you need to add custom localhost network in Metamask.
## Prepare config

Type in root folder - `cp config.example.js config.js`. Edit config if needed.

## Start node 

Open 1st terminal, then type in root folder to run local node - `npm run node:localhost`.

## Deploy smart contracts

Open 2nd terminal, then type in root folder to deploy contracts to local node - `npm run deploy:dex:localhost`.

## UI

Move to demo folder and run UI - `npm run dev`


## Accounts

When local node starts, it shares 20 account private keys.

First 7 accounts are reserved for system roles and topped up with USDT and BTC mocks in `dex-deploy.js` script.

0 - deployer
1 - alice
2 - bob
3 - matcher
4 - liquidator
5 - alice session
6 - bob session

You can import this private keys in your Metamask to use with demo.

## Troubleshooting

When you restart your local node, you need to redeploy smart contracts and reset imported account in Metamask with "Clear activity tab" button and re-add custom localhost network if needed to reset account nonce and Metamask cache.