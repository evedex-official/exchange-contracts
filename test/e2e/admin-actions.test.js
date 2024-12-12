const { upgrades } = require('hardhat');
const { generateSuit, restoreSuit } = require('../helpers/generate-suit');
const { writeContract, readContract } = require('viem/actions');
const { ETH_USD_INSTRUMENT } = require('./admin-actions.config');
const { expect } = require('chai');

const flow = 'admin configuration actions';
describe(flow, () => {
  before(upgrades.silenceWarnings);

  /**
   * Add new instrument to the exchange.
   * Only admin can add new instruments.
   */
  it('add instrument', async () => {
    const { owner, eveDex } = await generateSuit(flow);
    await writeContract(owner, {
      abi: eveDex.abi,
      address: eveDex.address,
      functionName: 'addInstrument',
      args: [
        ETH_USD_INSTRUMENT.SYMBOL,
        ETH_USD_INSTRUMENT.MAX_LEVERAGE,
        ETH_USD_INSTRUMENT.DAILY_FR_LONG,
        ETH_USD_INSTRUMENT.DAILY_FR_SHORT,
        Math.floor(Date.now() / 1000), //timestamp
      ],
    });
  });

  it('check new instrument', async () => {
    const { owner, eveDex } = await restoreSuit(flow);
    const { ticker, leverage } = await readContract(owner, {
      abi: eveDex.abi,
      address: eveDex.address,
      args: [ETH_USD_INSTRUMENT.INDEX],
      functionName: 'getInstrumentData',
    });
    expect(ticker).to.equal(ETH_USD_INSTRUMENT.SYMBOL);
    expect(leverage).to.equal(ETH_USD_INSTRUMENT.MAX_LEVERAGE);
  });

  /**
   * Lets modify the instrument: change leverage.
   * Only admin can modify instrument's properties.
   */
  it('change instrument leverage', async () => {
    const { owner, eveDex } = await restoreSuit(flow);
    await writeContract(owner, {
      abi: eveDex.abi,
      address: eveDex.address,
      functionName: 'changeInstrument',
      args: [
        ETH_USD_INSTRUMENT.INDEX,
        ETH_USD_INSTRUMENT.SYMBOL,
        ETH_USD_INSTRUMENT.MAX_LEVERAGE + 1n,
        ETH_USD_INSTRUMENT.DAILY_FR_LONG,
        ETH_USD_INSTRUMENT.DAILY_FR_SHORT,
        Math.floor(Date.now() / 1000) + 1, // timestamp
      ],
    });
  });

  it('check modified instrument', async () => {
    const { owner, eveDex } = await restoreSuit(flow);
    const { ticker, leverage } = await readContract(owner, {
      abi: eveDex.abi,
      address: eveDex.address,
      args: [ETH_USD_INSTRUMENT.INDEX],
      functionName: 'getInstrumentData',
    });
    expect(ticker).to.equal(ETH_USD_INSTRUMENT.SYMBOL);
    expect(leverage).to.equal(ETH_USD_INSTRUMENT.MAX_LEVERAGE + 1n);
  });

  /**
   * DANGEROUS ACTION!
   * Only admin can remove instruments.
   * Only last position can be removed.
   */
  it('remove instrument', async () => {
    const { owner, eveDex } = await restoreSuit(flow);
    await writeContract(owner, {
      abi: eveDex.abi,
      address: eveDex.address,
      functionName: 'deleteInstrument',
      args: [],
    });
  });

  it('check removed instrument', async () => {
    const { owner, eveDex } = await restoreSuit(flow);
    const { ticker } = await readContract(owner, {
      abi: eveDex.abi,
      address: eveDex.address,
      args: [ETH_USD_INSTRUMENT.INDEX],
      functionName: 'getInstrumentData',
    });
    expect(ticker).to.equal('');
  });
});
