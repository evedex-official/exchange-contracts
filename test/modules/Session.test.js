const { ethers } = require('hardhat');
const { expect } = require('chai');
const { time } = require('@nomicfoundation/hardhat-network-helpers');
const { anyValue } = require('@nomicfoundation/hardhat-chai-matchers/withArgs');

describe('Testing SessionManager contract', function () {
  let Session, session;

  beforeEach(async function () {
    const [owner, validator] = await ethers.getSigners();

    Session = await ethers.getContractFactory('SessionManager');
    session = await Session.deploy(owner.address);
    const validatorRole = await session.VALIDATOR_ROLE();
    await session.grantRole(validatorRole, validator.address);
  });

  it('Checking set/get session', async function () {
    const [owner, validator, alice, aliceSession] = await ethers.getSigners();

    const timestamp = await time.latest();
    const newSession = {
      user: alice.address,
      expiration: timestamp + 999,
      limitMaxOrders: false,
      ordersAllowed: 0,
      limitAllowance: true,
      allowanceAllowed: ethers.parseEther('0.1'),
      limitWithdrawals: false,
    };
    const config = [{ collateral: ethers.ZeroAddress, amount: 0 }];
    await session.connect(alice).setSession(aliceSession.address, newSession, config);

    expect((await session.getSessions(alice.address))[0]).to.be.equal(aliceSession.address);
    expect(await session.getSessionsAt(alice.address, 0)).to.be.equal(aliceSession.address);
    expect(await session.getSessionsLength(alice.address)).to.be.equal(1);
    const storedSession = await session.getSessionData(aliceSession.address);
    expect(storedSession.user).to.be.equal(newSession.user);
    expect(storedSession.expiration).to.be.equal(newSession.expiration);
    expect(storedSession.limitMaxOrders).to.be.equal(newSession.limitMaxOrders);
    expect(storedSession.ordersAllowed).to.be.equal(newSession.ordersAllowed);
    expect(storedSession.limitAllowance).to.be.equal(newSession.limitAllowance);
    expect(storedSession.allowanceAllowed).to.be.equal(newSession.allowanceAllowed);
  });

  it('Checking session conflicts', async function () {
    const [owner, validator, alice, aliceSession, bob, bobSession] = await ethers.getSigners();

    const timestamp = await time.latest();
    const newSession = {
      user: alice.address,
      expiration: timestamp + 999,
      limitMaxOrders: false,
      ordersAllowed: 0,
      limitAllowance: true,
      allowanceAllowed: ethers.parseEther('0.1'),
      limitWithdrawals: false,
    };
    const config = [{ collateral: ethers.ZeroAddress, amount: 0 }];
    await session.connect(alice).setSession(aliceSession.address, newSession, config);

    await expect(session.connect(bob).setSession(bobSession.address, newSession, config)).to.be.revertedWithCustomError(
      Session,
      'InvalidSessionUser',
    );
    const newBobSession = {
      user: bob.address,
      expiration: timestamp + 999,
      limitMaxOrders: true,
      ordersAllowed: 10,
      limitAllowance: false,
      allowanceAllowed: ethers.parseEther('0.1'),
      limitWithdrawals: false,
    };
    expect(await session.connect(bob).setSession(bobSession.address, newBobSession, config))
      .to.emit(Session, 'SessionDataUpdated')
      .withArgs(bob.address, bobSession.address, anyValue);
  });

  it('Checking removing session', async function () {
    const [owner, validator, alice, aliceSession, aliceSession2, bob] = await ethers.getSigners();

    const timestamp = await time.latest();
    const newSession = {
      user: alice.address,
      expiration: timestamp + 999,
      limitMaxOrders: false,
      ordersAllowed: 0,
      limitAllowance: true,
      allowanceAllowed: ethers.parseEther('0.1'),
      limitWithdrawals: false,
    };
    const config = [{ collateral: ethers.ZeroAddress, amount: 0 }];
    await session.connect(alice).setSession(aliceSession.address, newSession, config);
    await session.connect(alice).setSession(aliceSession2.address, newSession, config);

    expect(await session.getSessionsLength(alice.address)).to.be.equal(2);
    await expect(session.connect(bob).removeSession(aliceSession.address)).to.be.revertedWithCustomError(
      Session,
      'SessionNotFound',
    );
    expect(await session.connect(alice).removeSession(aliceSession.address))
      .to.emit(Session, 'SessionDataUpdated')
      .withArgs(alice.address, aliceSession.address, anyValue);
    expect(await session.connect(aliceSession2).removeSession(aliceSession2.address))
      .to.emit(Session, 'SessionDataUpdated')
      .withArgs(alice.address, aliceSession2.address, anyValue);

    expect(await session.getSessionsLength(alice.address)).to.be.equal(0);
    let storedSession = await session.getSessionData(aliceSession.address);
    expect(storedSession.user).to.be.equal(ethers.ZeroAddress);
    expect(storedSession.expiration).to.be.equal(0);
    expect(storedSession.limitMaxOrders).to.be.equal(false);
    expect(storedSession.ordersAllowed).to.be.equal(0);
    expect(storedSession.limitAllowance).to.be.equal(false);
    expect(storedSession.allowanceAllowed).to.be.equal(0);
    await session.connect(alice).setSession(aliceSession.address, newSession, config);
    await session.connect(alice).setSession(aliceSession2.address, newSession, config);
    storedSession = await session.getSessionData(aliceSession.address);
    expect(storedSession.user).to.be.equal(newSession.user);
    expect(storedSession.expiration).to.be.equal(newSession.expiration);
    expect(storedSession.limitMaxOrders).to.be.equal(newSession.limitMaxOrders);
    expect(storedSession.ordersAllowed).to.be.equal(newSession.ordersAllowed);
    expect(storedSession.limitAllowance).to.be.equal(newSession.limitAllowance);
    expect(storedSession.allowanceAllowed).to.be.equal(newSession.allowanceAllowed);
    expect(await session.connect(alice).removeAllSessions())
      .to.emit(Session, 'SessionDataUpdated')
      .withArgs(alice.address, aliceSession.address, anyValue);
    expect(await session.getSessionsLength(alice.address)).to.be.equal(0);
    expect(await session.connect(bob).removeAllSessions()).not.to.emit(Session, 'SessionDataUpdated');
  });

  it('Checking session validation', async function () {
    const [owner, validator, alice, aliceSession, usdt, bob] = await ethers.getSigners();

    const timestamp = await time.latest();
    const allowance = ethers.parseEther('0.1');
    const newSession = {
      user: alice.address,
      expiration: timestamp + 999,
      limitMaxOrders: true,
      ordersAllowed: 2,
      limitAllowance: true,
      allowanceAllowed: allowance,
      limitWithdrawals: false,
    };
    const config = [{ collateral: ethers.ZeroAddress, amount: 0 }];
    await session.connect(alice).setSession(aliceSession.address, newSession, config);

    const amount = ethers.parseEther('0.06');
    const order1 = {
      senderAddress: alice.address,
      matcherAddress: owner.address,
      collateral: usdt.address,
      instrumentIndex: 1,
      amount: amount,
      price: 1000,
      leverage: 5,
      matcherFee: 10,
      expiration: timestamp + 200,
      side: 0,
      userSession: aliceSession.address,
      merkleRoot: ethers.ZeroHash,
      merkleProof: [],
      signature: '0x',
    };

    let storedSession = await session.getSessionData(aliceSession.address);
    expect(storedSession.ordersAllowed).to.be.equal(newSession.ordersAllowed);
    expect(storedSession.allowanceAllowed).to.be.equal(newSession.allowanceAllowed);
    expect(await session.connect(validator).validateUserOrder(order1))
      .to.emit(Session, 'SessionDataUpdated')
      .withArgs(alice.address, aliceSession.address, anyValue);
    storedSession = await session.getSessionData(aliceSession.address);
    expect(storedSession.ordersAllowed).to.be.equal(newSession.ordersAllowed - 1);
    expect(storedSession.allowanceAllowed).to.be.equal(allowance - amount);

    const order2 = {
      senderAddress: bob.address,
      matcherAddress: owner.address,
      collateral: usdt.address,
      instrumentIndex: 1,
      amount: amount,
      price: 1000,
      leverage: 5,
      matcherFee: 10,
      expiration: timestamp + 200,
      side: 0,
      userSession: aliceSession.address,
      merkleRoot: ethers.ZeroHash,
      merkleProof: [],
      signature: '0x',
    };

    await expect(session.connect(validator).validateUserOrder(order2)).to.be.revertedWithCustomError(
      Session,
      'SessionNotFound',
    );

    await expect(session.connect(validator).validateUserOrder(order1)).to.be.revertedWithCustomError(
      Session,
      'SessionAllowanceExceeded',
    );

    const amount2 = ethers.parseEther('0.01');
    const order3 = {
      senderAddress: alice.address,
      matcherAddress: owner.address,
      collateral: usdt.address,
      instrumentIndex: 1,
      amount: amount2,
      price: 1000,
      leverage: 5,
      matcherFee: 10,
      expiration: timestamp + 1000,
      side: 0,
      userSession: aliceSession.address,
      merkleRoot: ethers.ZeroHash,
      merkleProof: [],
      signature: '0x',
    };

    await expect(session.connect(validator).validateUserOrder(order3)).to.be.revertedWithCustomError(
      Session,
      'SessionExpired',
    );
    const order4 = {
      senderAddress: alice.address,
      matcherAddress: owner.address,
      collateral: usdt.address,
      instrumentIndex: 1,
      amount: amount2,
      price: 1000,
      leverage: 5,
      matcherFee: 10,
      expiration: timestamp + 300,
      side: 0,
      userSession: aliceSession.address,
      merkleRoot: ethers.ZeroHash,
      merkleProof: [],
      signature: '0x',
    };
    expect(await session.connect(validator).validateUserOrder(order4))
      .to.emit(Session, 'SessionDataUpdated')
      .withArgs(alice.address, aliceSession.address, anyValue);
    storedSession = await session.getSessionData(aliceSession.address);
    expect(storedSession.ordersAllowed).to.be.equal(0);
    expect(storedSession.allowanceAllowed).to.be.equal(allowance - amount - amount2);
    await expect(session.connect(validator).validateUserOrder(order4)).to.be.revertedWithCustomError(
      Session,
      'SessionMaxOrdersSettled',
    );

    await session.connect(alice).removeAllSessions();
    const newSession2 = {
      user: alice.address,
      expiration: 0,
      limitMaxOrders: false,
      ordersAllowed: 2,
      limitAllowance: false,
      allowanceAllowed: allowance,
      limitWithdrawals: false,
    };
    const order5 = {
      senderAddress: alice.address,
      matcherAddress: owner.address,
      collateral: usdt.address,
      instrumentIndex: 1,
      amount: amount2,
      price: 1000,
      leverage: 5,
      matcherFee: 10,
      expiration: timestamp + 10000,
      side: 0,
      userSession: aliceSession.address,
      merkleRoot: ethers.ZeroHash,
      merkleProof: [],
      signature: '0x',
    };
    await session.connect(alice).setSession(aliceSession.address, newSession2, config);
    storedSession = await session.getSessionData(aliceSession.address);
    expect(storedSession.user).to.be.equal(newSession2.user);
    expect(storedSession.expiration).to.be.equal(newSession2.expiration);
    expect(storedSession.limitMaxOrders).to.be.equal(newSession2.limitMaxOrders);
    expect(storedSession.ordersAllowed).to.be.equal(newSession2.ordersAllowed);
    expect(storedSession.limitAllowance).to.be.equal(newSession2.limitAllowance);
    expect(storedSession.allowanceAllowed).to.be.equal(newSession2.allowanceAllowed);

    await session.connect(validator).validateUserOrder(order5);
    storedSession = await session.getSessionData(aliceSession.address);
    expect(storedSession.user).to.be.equal(newSession2.user);
    expect(storedSession.expiration).to.be.equal(newSession2.expiration);
    expect(storedSession.limitMaxOrders).to.be.equal(newSession2.limitMaxOrders);
    expect(storedSession.ordersAllowed).to.be.equal(newSession2.ordersAllowed);
    expect(storedSession.limitAllowance).to.be.equal(newSession2.limitAllowance);
    expect(storedSession.allowanceAllowed).to.be.equal(newSession2.allowanceAllowed);
  });

  it('Checking session withdraw validation', async function () {
    const [owner, validator, alice, aliceSession, usdt, bob] = await ethers.getSigners();

    const timestamp = await time.latest();
    const allowance = ethers.parseEther('0.1');
    const newSession = {
      user: alice.address,
      expiration: timestamp + 999,
      limitMaxOrders: true,
      ordersAllowed: 2,
      limitAllowance: true,
      allowanceAllowed: allowance,
      limitWithdrawals: true,
      withdrawalsAllowed: allowance,
    };
    const withdrawConfig = [{ collateral: usdt.address, amount: allowance }];
    await session.connect(alice).setSession(aliceSession.address, newSession, withdrawConfig);

    const amount = ethers.parseEther('0.06');
    const withdrawOrder1 = {
      collateral: usdt.address,
      account: alice.address,
      amount: amount,
      session: aliceSession.address,
      expiration: timestamp + 200,
      signature: '0x',
    };

    let storedSession = await session.getSessionData(aliceSession.address);
    expect(storedSession.limitWithdrawals).to.be.equal(newSession.limitWithdrawals);
    expect(await session.getSessionWithdrawLength(aliceSession.address)).to.be.equal(1);
    expect((await session.getSessionWithdrawKeys(aliceSession.address))[0]).to.be.equal(usdt.address);
    expect((await session.getSessionWithdrawValues(aliceSession.address, [usdt.address]))[0]).to.be.equal(
      withdrawConfig[0].amount,
    );

    expect(await session.connect(validator).validateWithdrawalOrder(withdrawOrder1))
      .to.emit(Session, 'SessionDataUpdated')
      .withArgs(alice.address, aliceSession.address, anyValue);
    storedSession = await session.getSessionData(aliceSession.address);
    expect((await session.getSessionWithdrawValues(aliceSession.address, [usdt.address]))[0]).to.be.equal(
      allowance - amount,
    );

    await expect(session.connect(validator).validateWithdrawalOrder(withdrawOrder1)).to.be.revertedWithCustomError(
      Session,
      'SessionWithdrawalsExceeded',
    );
  });
});
